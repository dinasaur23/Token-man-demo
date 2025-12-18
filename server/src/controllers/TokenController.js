import TokenWorkspace from "../models/TokenWorkspace.js";
import fs from "fs";
import os from "os";
import path from "path";
import StyleDictionary from "style-dictionary";
//import { mergeWorkspaceFiles } from "../utils/dtcg/mergeWorkspaceFiles.js";
import { applyOverridesToTokens } from "../utils/dtcg/applyOverrides.js";
import { normalizeDtcgForCss } from "../utils/dtcg/normalizeDtcgForCss.js";
import { createSdConfig } from "../utils/sd/index.js";
import {
  pruneDeletedTokens,
  buildCleanOverrides,
} from "../utils/dtcg/cleanupWorkspaceTokens.js";
import { resolveUploadedDocuments } from "../utils/dtcg/uploadedResolver.js";
import archiver from "archiver";
function isFigmaIdString(v) {
  return typeof v === "string" && /^\d+:\d+$/.test(v);
}

function resolveFigmaIdValuesInPlace(rootTokens) {
  const idToPrimitive = new Map();

  // collect id -> primitive
  (function collect(node) {
    if (!isJsonObject(node)) return;

    const isTokenLeaf =
      Object.prototype.hasOwnProperty.call(node, "$type") ||
      Object.prototype.hasOwnProperty.call(node, "$value");

    if (isTokenLeaf) {
      const fig = isJsonObject(node.$extensions)
        ? node.$extensions.figma
        : null;
      const id = fig?.id || fig?.variableId || fig?.nodeId;

      const v = node.$value;
      const isPrimitive =
        typeof v === "number" ||
        typeof v === "boolean" ||
        (typeof v === "string" && !isFigmaIdString(v));

      if (id && isPrimitive) idToPrimitive.set(String(id), v);
      return;
    }

    for (const v of Object.values(node)) collect(v);
  })(rootTokens);

  if (idToPrimitive.size === 0) return;

  // replace id-values
  (function replace(node) {
    if (!isJsonObject(node)) return;

    const isTokenLeaf =
      Object.prototype.hasOwnProperty.call(node, "$type") ||
      Object.prototype.hasOwnProperty.call(node, "$value");

    if (isTokenLeaf) {
      const v = node.$value;
      if (isFigmaIdString(v) && idToPrimitive.has(v)) {
        node.$value = idToPrimitive.get(v);
      }
      return;
    }

    for (const v of Object.values(node)) replace(v);
  })(rootTokens);
}

function applyValuesByModeToValueInPlace(root, combo) {
  const mode = combo?.mode;
  if (!mode) return;

  (function walk(n) {
    if (!isJsonObject(n)) return;

    const isTokenLeaf =
      Object.prototype.hasOwnProperty.call(n, "$type") ||
      Object.prototype.hasOwnProperty.call(n, "$value");

    if (isTokenLeaf) {
      const fig = isJsonObject(n.$extensions) ? n.$extensions.figma : null;
      if (isJsonObject(fig) && isJsonObject(fig.valuesByMode)) {
        if (Object.prototype.hasOwnProperty.call(fig.valuesByMode, mode)) {
          const candidate = fig.valuesByMode[mode];
          if (candidate !== undefined) n.$value = candidate;
        }
      }
      return;
    }

    for (const v of Object.values(n)) walk(v);
  })(root);
}

function isJsonObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectionHasModes(collectionName, allowedModesByCollection) {
  const modes = allowedModesByCollection?.[collectionName];
  return Array.isArray(modes) && modes.length > 0;
}

function makeVariantFolderForCollection(
  combo,
  collectionName,
  allowedModesByCollection
) {
  const allowed = allowedModesByCollection?.[collectionName] ?? [];
  const collectionHasModes = Array.isArray(allowed) && allowed.length > 0;
  if (!collectionHasModes) {
    const rest = { ...(combo || {}) };
    delete rest.mode;
    return makeVariantFolder(rest);
  }

  // If collection has modes, keep full combo (includes mode)
  return makeVariantFolder(combo);
}

function deriveAllowedModesByCollection(rootTokens) {
  const out = {}; // { [collectionName]: Set<string> }

  function ensure(col) {
    if (!out[col]) out[col] = new Set();
    return out[col];
  }

  function visit(node, pathArr) {
    if (!isJsonObject(node)) return;

    const isTokenLeaf =
      Object.prototype.hasOwnProperty.call(node, "$type") ||
      Object.prototype.hasOwnProperty.call(node, "$value");

    if (isTokenLeaf) {
      const collection = pathArr[0];
      if (!collection) return;

      const ext = node.$extensions;
      const fig = isJsonObject(ext) ? ext.figma : null;

      // 1) valuesByMode keys (common in your data)
      if (isJsonObject(fig) && isJsonObject(fig.valuesByMode)) {
        for (const k of Object.keys(fig.valuesByMode)) {
          ensure(collection).add(k);
        }
      }

      // 2) figma.modes object keys (also in your example)
      if (isJsonObject(fig) && isJsonObject(fig.modes)) {
        for (const k of Object.keys(fig.modes)) {
          ensure(collection).add(k);
        }
      }

      return;
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === "$extensions" || k === "$type" || k === "$value") continue;
      visit(v, pathArr.concat(k));
    }
  }

  visit(rootTokens, []);

  // Convert Set -> Array
  const asObj = {};
  for (const [col, set] of Object.entries(out)) {
    asObj[col] = Array.from(set);
  }
  return asObj; // { device: ["mobile","tablet"], brand:["neo",...], ... }
}
function isComboAllowedForCollection(
  combo,
  collectionName,
  allowedModesByCollection
) {
  const allowed = allowedModesByCollection?.[collectionName];
  const collectionHasModes = Array.isArray(allowed) && allowed.length > 0;

  // Collection has no modes -> never block (we will dedupe + ignore mode in folder)
  if (!collectionHasModes) return true;

  // Collection has modes -> require combo.mode to be valid (if mode exists)
  if (combo && typeof combo === "object" && typeof combo.mode === "string") {
    return allowed.includes(combo.mode);
  }

  // If collection has modes but combo has no mode, skip (otherwise you'd get "default" export)
  return false;
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function findResolverDocInDocs(docs) {
  for (const raw of Object.values(docs)) {
    if (isPlainObject(raw) && Array.isArray(raw.resolutionOrder)) return raw;
  }
  return null;
}

function extractAllModifierValues(docs, workspace) {
  const out = {};

  // 1) from resolver document: modifiers[name].contexts keys
  const resolver = findResolverDocInDocs(docs);
  if (resolver?.modifiers && isPlainObject(resolver.modifiers)) {
    for (const [name, mod] of Object.entries(resolver.modifiers)) {
      if (!isPlainObject(mod)) continue;
      const ctx = mod.contexts;
      if (!isPlainObject(ctx)) continue;
      const values = Object.keys(ctx).filter(Boolean);
      if (values.length) out[name] = values;
    }
  }

  // 2) from Figma: workspace.figmaModifierOptions[name].values
  const fig = workspace?.figmaModifierOptions;
  if (fig && isPlainObject(fig)) {
    for (const [name, opt] of Object.entries(fig)) {
      if (!isPlainObject(opt)) continue;
      if (Array.isArray(opt.values) && opt.values.length) {
        out[name] = Array.from(new Set([...(out[name] ?? []), ...opt.values]));
      }
    }
  }

  return out; // { mode: ["mobile","saas"], theme: ["light","dark"], ... }
}

function cartesianProduct(modMap) {
  const names = Object.keys(modMap);
  if (names.length === 0) return [{}];

  let combos = [{}];
  for (const name of names) {
    const values = modMap[name] ?? [];
    const next = [];
    for (const c of combos) {
      for (const v of values) {
        next.push({ ...c, [name]: v });
      }
    }
    combos = next;
  }
  return combos;
}

function makeVariantFolder(combo) {
  const entries = Object.entries(combo).filter(
    ([, v]) => typeof v === "string" && v.length
  );
  if (entries.length === 0) return "default";
  if (entries.length === 1) return entries[0][1]; // e.g. "mobile"
  // e.g. "mode-mobile__theme-dark"
  return entries.map(([k, v]) => `${k}-${v}`).join("__");
}

function listTopLevelCollections(tokenTree) {
  if (!tokenTree || typeof tokenTree !== "object") return [];
  return Object.keys(tokenTree).filter(
    (k) => k !== "$metadata" && k !== "$extensions"
  );
}

function pickCollectionTree(tokenTree, collectionKey) {
  if (!tokenTree || typeof tokenTree !== "object") return {};
  const sub = tokenTree[collectionKey];
  if (!sub || typeof sub !== "object") return {};
  // exported file should still be a DTCG tree, so wrap:
  return { [collectionKey]: sub };
}

function getUserIdFromReq(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?._id) return req.user._id;
  return null;
}

function getDesignSystemIdFromReq(req) {
  if (req.query?.designSystemId) return req.query.designSystemId;
  if (req.params?.designSystemId) return req.params.designSystemId;
  return null;
}

function applyGroupNameOverridesToTokens(rootTokens, groupNameOverrides) {
  if (!groupNameOverrides || typeof groupNameOverrides !== "object") return;

  for (const [groupId, newLabel] of Object.entries(groupNameOverrides)) {
    if (typeof newLabel !== "string") continue;
    const trimmed = newLabel.trim();
    if (!trimmed) continue;

    const segments = groupId.split(".");
    if (!segments.length) continue;

    const parentSegments = segments.slice(0, -1);
    const oldKey = segments[segments.length - 1];

    let parent = rootTokens;
    let ok = true;

    for (const segment of parentSegments) {
      if (!parent || typeof parent !== "object" || !(segment in parent)) {
        ok = false;
        break;
      }
      parent = parent[segment];
    }

    if (!ok || !parent || typeof parent !== "object") continue;
    if (!(oldKey in parent)) continue;

    // avoid overwriting an existing key with the new name
    if (Object.prototype.hasOwnProperty.call(parent, trimmed)) {
      console.warn(
        "[exportTokens] group rename skipped because key already exists:",
        groupId,
        "→",
        trimmed
      );
      continue;
    }

    parent[trimmed] = parent[oldKey];
    delete parent[oldKey];
  }
}
const ALLOWED_TOKEN_TYPES = ["color", "number", "string", "boolean"];

function validateToken(token) {
  if (!token || typeof token !== "object") {
    throw new Error("Invalid token object");
  }

  if (!ALLOWED_TOKEN_TYPES.includes(token.$type)) {
    throw new Error(`Unsupported token type: ${token.$type}`);
  }
}

function validateTokenTree(node) {
  if (!node || typeof node !== "object") return;

  // Token leaf (DTCG)
  if (node.$type && node.$value !== undefined) {
    validateToken(node);
    return;
  }

  // Recurse into groups
  for (const key of Object.keys(node)) {
    validateTokenTree(node[key]);
  }
}

export async function syncFigmaTokens(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Not authenticated" });
    }

    const designSystemId = getDesignSystemIdFromReq(req);
    if (!designSystemId) {
      return res
        .status(400)
        .json({ ok: false, message: "designSystemId is required" });
    }

    const { tokens, modifiers } = req.body || {};
    if (!tokens || typeof tokens !== "object") {
      return res
        .status(400)
        .json({ ok: false, message: "Missing or invalid tokens payload" });
    }
    try {
      validateTokenTree(tokens);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        message: err.message,
      });
    }

    const normalizedModifiers =
      modifiers && typeof modifiers === "object" ? modifiers : {};

    let workspace = await TokenWorkspace.findOne({
      user: userId,
      designSystem: designSystemId,
    });

    if (!workspace) {
      workspace = new TokenWorkspace({
        user: userId,
        designSystem: designSystemId,
        files: [],
        modifiers: {},
        overrides: {},
        nameOverrides: {},
        addedRows: [],
        deletedPaths: [],
        rowOrder: [],
        figmaTokens: tokens,
        figmaModifierOptions: normalizedModifiers,
      });
    } else {
      workspace.figmaTokens = tokens;
      workspace.figmaModifierOptions = normalizedModifiers;
    }

    const files = workspace.files || [];
    const idx = files.findIndex((f) => f.name === "figma-sync.json");
    if (idx === -1) {
      files.push({ name: "figma-sync.json", content: tokens });
    } else {
      files[idx].content = tokens;
    }
    workspace.files = files;

    console.log(
      "figma-sync.json content preview:",
      JSON.stringify(
        files[idx === -1 ? files.length - 1 : idx].content,
        null,
        2
      )
    );

    await workspace.save();

    console.log("syncFigmaTokens:", {
      userId,
      designSystemId,
      tokenKeys: Object.keys(tokens),
      hasModifiers: !!modifiers,
    });

    return res.json({
      ok: true,
      saved: Object.keys(tokens).length,
    });
  } catch (err) {
    console.error("syncFigmaTokens error", err);
    next(err);
  }
}

export async function getWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      console.warn("getWorkspace: no user id in token", req.user);
      return res.json({
        files: [],
        modifiers: {},
        overrides: {},
        nameOverrides: {},
        addedRows: [],
        deletedPaths: [],
        rowOrder: [],
        figmaTokens: {},
        figmaModifierOptions: {},
        groupNameOverrides: {},
        scopedModifiers: {},
      });
    }
    const designSystemId = getDesignSystemIdFromReq(req);
    if (!designSystemId) {
      return res.status(400).json({
        ok: false,
        stage: "loadWorkspace",
        message: "No design system selected",
      });
    }
    const query = { user: userId, designSystem: designSystemId };
    console.log("getWorkspace query =", query);
    const workspace = await TokenWorkspace.findOne(query).lean();
    console.log(
      "getWorkspace: found?",
      !!workspace,
      "user:",
      userId,
      "designSystem:",
      designSystemId
    );

    if (!workspace) {
      return res.json({
        files: [],
        modifiers: {},
        overrides: {},
        nameOverrides: {},
        addedRows: [],
        deletedPaths: [],
        rowOrder: [],
        figmaTokens: {},
        figmaModifierOptions: {},
        groupNameOverrides: {},
        scopedModifiers: {},
      });
    }
    res.json({
      files: workspace.files ?? [],
      modifiers: workspace.modifiers ?? {},
      overrides: workspace.overrides ?? {},
      nameOverrides: workspace.nameOverrides ?? {},
      addedRows: workspace.addedRows,
      deletedPaths: workspace.deletedPaths,
      rowOrder: workspace.rowOrder ?? [],
      figmaTokens: workspace.figmaTokens ?? {},
      figmaModifierOptions: workspace.figmaModifierOptions ?? {},
      groupNameOverrides: workspace.groupNameOverrides ?? {},
      scopedModifiers: workspace.scopedModifiers ?? {},
    });
  } catch (err) {
    console.error("getWorkspace error", err);
    next(err);
  }
}

export async function saveWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    const designSystemId = getDesignSystemIdFromReq(req);
    if (!userId) {
      console.error("saveWorkspace: no user id in token", req.user);
      return res
        .status(400)
        .json({ ok: false, message: "No user id in token" });
    }
    if (!designSystemId) {
      return res
        .status(400)
        .json({ ok: false, message: "No design system selected" });
    }

    const {
      files,
      modifiers,
      overrides,
      nameOverrides,
      addedRows,
      deletedPaths,
      rowOrder,
      groupNameOverrides,
      scopedModifiers,
    } = req.body;

    console.log(
      "saveWorkspace user",
      userId,
      "designSystem:",
      designSystemId,
      "files:",
      Array.isArray(files) ? files.length : 0
    );

    const workspaceData = {
      user: userId,
      designSystem: designSystemId || null,
      files: Array.isArray(files) ? files : [],
      modifiers: modifiers ?? {},
      overrides: overrides ?? {},
      nameOverrides: nameOverrides ?? {},
      addedRows: Array.isArray(addedRows) ? addedRows : [],
      deletedPaths: Array.isArray(deletedPaths) ? deletedPaths : [],
      rowOrder: Array.isArray(rowOrder) ? rowOrder : [],
      groupNameOverrides: groupNameOverrides ?? {},
      scopedModifiers: scopedModifiers ?? {},
    };

    const query = { user: userId, designSystem: designSystemId };
    console.log("saveWorkspace query =", query);
    const workspace = await TokenWorkspace.findOneAndUpdate(
      query,
      workspaceData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    console.log(
      "saveWorkspace saved workspaceId:",
      workspace?._id,
      "for designSystem:",
      designSystemId
    );

    res.json({
      files: workspace.files ?? [],
      modifiers: workspace.modifiers ?? {},
      overrides: workspace.overrides ?? {},
      nameOverrides: workspace.nameOverrides ?? {},
      addedRows: workspace.addedRows,
      deletedPaths: workspace.deletedPaths,
      groupNameOverrides: workspace.groupNameOverrides ?? {},
      scopedModifiers: workspace.scopedModifiers ?? {},
    });
  } catch (err) {
    console.error("saveWorkspace error", err);
    next(err);
  }
}

export async function exportTokens(req, res) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    const designSystemId = getDesignSystemIdFromReq(req);

    if (!userId) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    stage = "loadWorkspace";
    const query = { user: userId };
    if (designSystemId) query.designSystem = designSystemId;

    const workspace = await TokenWorkspace.findOne(query).lean();
    if (!workspace) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "No workspace found" });
    }
    if (!Array.isArray(workspace.files) || workspace.files.length === 0) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "Workspace has no token files" });
    }

    const format = (req.query.format || "css").toString();
    const bundle = String(req.query.bundle || "") === "1";

    if (!bundle) {
      return res.status(400).json({
        ok: false,
        stage,
        message:
          "Pass bundle=1 to export a ZIP with collections/modifier variants.",
      });
    }

    stage = "buildDocsFromWorkspace";
    const docs = {};
    for (const file of workspace.files) {
      if (!file || !file.name) continue;
      docs[file.name] =
        file.content !== undefined ? file.content : (file.json ?? {});
    }

    stage = "computeModifierMatrix";
    const allModValues = extractAllModifierValues(docs, workspace);
    const combos = cartesianProduct(allModValues);

    if (combos.length > 500) {
      return res.status(400).json({
        ok: false,
        stage,
        message: `Too many export variants (${combos.length}). Reduce modifiers/values or add a limit.`,
      });
    }

    stage = "resolveBaseForCollections";
    const baseResolved = resolveUploadedDocuments(docs, {}); // empty input
    const baseMerged = baseResolved;

    pruneDeletedTokens(baseMerged, workspace.deletedPaths ?? []);
    const cleanedOverridesBase = buildCleanOverrides(
      baseMerged,
      workspace.overrides ?? {}
    );
    applyOverridesToTokens(baseMerged, cleanedOverridesBase);
    applyGroupNameOverridesToTokens(
      baseMerged,
      workspace.groupNameOverrides ?? {}
    );

    const collections = listTopLevelCollections(baseMerged);
    if (!collections.length) {
      return res.status(400).json({
        ok: false,
        stage,
        message: "No top-level collections found to export.",
      });
    }
    const allowedModesByCollection = deriveAllowedModesByCollection(baseMerged);
    const collectionsWithModes = collections.filter((c) =>
      collectionHasModes(c, allowedModesByCollection)
    );

    const collectionsWithoutModes = collections.filter(
      (c) => !collectionHasModes(c, allowedModesByCollection)
    );
    const exportedKeySet = new Set();
    // ---------- ZIP response ----------
    const dsSuffix = designSystemId ? `-${designSystemId}` : "";
    const zipName = `tokens${dsSuffix}.${format}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("ZIP error", err);
      throw err;
    });
    archive.pipe(res);

    // temp build base
    const tmpDir = os.tmpdir();
    const buildBaseRoot = path.join(
      tmpDir,
      `export-${userId}${dsSuffix}-${Date.now()}`
    );

    const exported = new Set();
    if (format === "json" && collectionsWithoutModes.length > 0) {
      const mergedTokens = resolveUploadedDocuments(docs, {}); // NO MODE
      pruneDeletedTokens(mergedTokens, workspace.deletedPaths ?? []);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        workspace.overrides ?? {}
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);
      applyGroupNameOverridesToTokens(
        mergedTokens,
        workspace.groupNameOverrides ?? {}
      );

      for (const col of collectionsWithoutModes) {
        const colTree = pickCollectionTree(mergedTokens, col);
        const jsonOut = JSON.stringify(colTree, null, 2);
        const entryPath = path.posix.join(col, "default", "tokens.dtcg.json");
        archive.append(jsonOut, { name: entryPath });
      }
    }

    // ---- EXPORT COLLECTIONS WITHOUT MODES (ONCE) ----
    if (format !== "json" && collectionsWithoutModes.length > 0) {
      const mergedTokens = resolveUploadedDocuments(docs, {}); // NO MODE

      pruneDeletedTokens(mergedTokens, workspace.deletedPaths ?? []);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        workspace.overrides ?? {}
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);
      applyGroupNameOverridesToTokens(
        mergedTokens,
        workspace.groupNameOverrides ?? {}
      );

      normalizeDtcgForCss(mergedTokens);

      const jsonFilePath = path.join(buildBaseRoot, `tokens-nomode.json`);
      fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(mergedTokens, null, 2),
        "utf8"
      );

      const buildBase = path.join(buildBaseRoot, `build-nomode`);
      const sdConfig = createSdConfig(format, jsonFilePath, buildBase);
      const platformKey = Object.keys(sdConfig.platforms)[0];
      const platformConfig = sdConfig.platforms[platformKey];

      const fileTemplateNoMode = platformConfig.files?.[0];
      if (!fileTemplateNoMode)
        throw new Error("SD config has no files[0] template (nomode).");

      const originalDestination = fileTemplateNoMode.destination;
      if (!originalDestination)
        throw new Error("SD config has no destination (nomode).");

      platformConfig.files = collectionsWithoutModes.map((col) => ({
        ...fileTemplateNoMode,
        destination: path.posix.join(col, "default", originalDestination),
        filter: (token) => Array.isArray(token.path) && token.path[0] === col,
      }));

      fs.mkdirSync(platformConfig.buildPath, { recursive: true });

      const sd = new StyleDictionary(sdConfig);
      await sd.buildAllPlatforms();

      for (const col of collectionsWithoutModes) {
        const builtPath = path.join(
          platformConfig.buildPath,
          col,
          "default",
          originalDestination
        );
        if (!fs.existsSync(builtPath)) continue;

        archive.file(builtPath, {
          name: path.posix.join(col, "default", originalDestination),
        });
      }
    }

    for (const combo of combos) {
      const variantFolder = makeVariantFolder(combo);

      stage = `resolveTokens:${variantFolder}`;
      let mergedTokens = resolveUploadedDocuments(docs, combo);

      pruneDeletedTokens(mergedTokens, workspace.deletedPaths ?? []);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        workspace.overrides ?? {}
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);
      applyGroupNameOverridesToTokens(
        mergedTokens,
        workspace.groupNameOverrides ?? {}
      );
      applyValuesByModeToValueInPlace(mergedTokens, combo);
      resolveFigmaIdValuesInPlace(mergedTokens);

      if (!mergedTokens || Object.keys(mergedTokens).length === 0) continue;

      // ---- JSON: directly add per collection ----
      if (format === "json") {
        for (const col of collections) {
          if (
            !isComboAllowedForCollection(combo, col, allowedModesByCollection)
          )
            continue;

          const vf = makeVariantFolderForCollection(
            combo,
            col,
            allowedModesByCollection
          );
          const exportKey = `${col}__${vf}__json`;
          if (exportedKeySet.has(exportKey)) continue;
          exportedKeySet.add(exportKey);

          const colTree = pickCollectionTree(mergedTokens, col);
          const jsonOut = JSON.stringify(colTree, null, 2);
          const entryPath = path.posix.join(col, vf, "tokens.dtcg.json");
          archive.append(jsonOut, { name: entryPath });
        }
        continue;
      }

      // ---- SD formats: build files per collection using SD filters ----
      normalizeDtcgForCss(mergedTokens);
      const safeVariantKey = String(variantFolder).replace(/[\\/]/g, "__");
      const jsonFilePath = path.join(
        buildBaseRoot,
        `tokens-${safeVariantKey}.json`
      );
      fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(mergedTokens, null, 2),
        "utf8"
      );

      const buildBase = path.join(buildBaseRoot, `build-${variantFolder}`);
      const sdConfig = createSdConfig(format, jsonFilePath, buildBase);
      if (!sdConfig) throw new Error(`Unsupported export format: ${format}`);

      const destPlatformKey = Object.keys(sdConfig.platforms)[0];
      const platformConfig = sdConfig.platforms[destPlatformKey];

      platformConfig.buildPath = buildBase;

      const fileTemplate = platformConfig.files?.[0];
      if (!fileTemplate) {
        throw new Error("Style Dictionary config has no files[0] template.");
      }

      const originalDestination = fileTemplate.destination;
      if (!originalDestination) {
        throw new Error("Style Dictionary config has no destination file.");
      }

      const allowedCollections = collectionsWithModes.filter((col) =>
        isComboAllowedForCollection(combo, col, allowedModesByCollection)
      );

      platformConfig.files = [];

      for (const col of allowedCollections) {
        const colVariantFolder = makeVariantFolderForCollection(
          combo,
          col,
          allowedModesByCollection
        );

        const dedupeKey = `${format}::${col}::${colVariantFolder}`;
        if (exported.has(dedupeKey)) continue;
        exported.add(dedupeKey);

        const dest = path.posix.join(
          col,
          colVariantFolder,
          originalDestination
        );

        platformConfig.files.push({
          ...fileTemplate,
          destination: dest,
          filter: (token) => Array.isArray(token.path) && token.path[0] === col,
        });
      }
      if (platformConfig.files.length === 0) {
        continue; // nothing to build for this combo (all would have been duplicates)
      }

      fs.mkdirSync(platformConfig.buildPath, { recursive: true });
      for (const f of platformConfig.files) {
        const destDir = path.join(
          platformConfig.buildPath,
          ...String(f.destination).split("/")
        );
        fs.mkdirSync(path.dirname(destDir), { recursive: true });
      }

      const sd = new StyleDictionary(sdConfig);
      await sd.buildAllPlatforms();

      for (const col of allowedCollections) {
        const colVariantFolder = makeVariantFolderForCollection(
          combo,
          col,
          allowedModesByCollection
        );

        const builtPath = path.join(
          platformConfig.buildPath,
          col,
          colVariantFolder,
          originalDestination
        );
        if (!fs.existsSync(builtPath)) continue;

        const zipEntry = path.posix.join(
          col,
          colVariantFolder,
          originalDestination
        );
        archive.file(builtPath, { name: zipEntry });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("exportTokens error at stage:", stage, err);

    if (res.headersSent) {
      try {
        res.end();
      } catch (e) {
        console.warn("res.end failed", e);
      }
      return;
    }
    return res.status(500).json({
      ok: false,
      stage,
      message: err instanceof Error ? err.message : "Unknown export error",
    });
  }
}
