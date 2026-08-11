import TokenWorkspace from "../models/TokenWorkspace.js";
import fs from "fs";
import os from "os";
import path from "path";
import { applyOverridesToTokens } from "../utils/dtcg/applyOverrides.js";
import {
  exportCanonicalJson,
  preparePlatformExport,
} from "../utils/dtcg/exporters/index.js";
import {
  createSdConfig,
  runStyleDictionaryExport,
} from "../utils/sd/index.js";
import {
  pruneDeletedTokens,
  buildCleanOverrides,
} from "../utils/dtcg/cleanupWorkspaceTokens.js";
import { resolveUploadedDocuments } from "../utils/dtcg/uploadedResolver.js";
import {
  APPLICATION_SUPPORTED_TYPES,
  isApplicationSupportedTokenType,
} from "../utils/dtcg/allowedTokenTypes.js";
import {
  validateFigmaImportTokenTree,
} from "../../../shared/figma-dtcg-mapping/index.js";
import archiver from "archiver";

function getTokensRoot(root) {
  if (
    root &&
    typeof root === "object" &&
    root.tokens &&
    typeof root.tokens === "object"
  ) {
    return root.tokens;
  }
  return root;
}

function buildOverrideRules(overrides) {
  return Object.entries(overrides || {})
    .filter(
      ([k, v]) =>
        typeof k === "string" && typeof v === "string" && v.trim().length > 0,
    )
    .sort((a, b) => b[0].split(".").length - a[0].split(".").length);
}

function mapPathSegmentsByOverrides(pathStr, overrides, direction) {
  if (!pathStr || typeof pathStr !== "string" || !pathStr.includes("."))
    return pathStr;

  const seg = pathStr.split(".");
  const rules = buildOverrideRules(overrides);

  for (const [groupId, newLabelRaw] of rules) {
    const newLabel = String(newLabelRaw).trim();
    if (!newLabel) continue;

    const gidSeg = groupId.split(".");
    const parentSeg = gidSeg.slice(0, -1);
    const oldKey = gidSeg[gidSeg.length - 1];
    const idx = parentSeg.length;

    // parent must match exactly
    let parentMatches = true;
    for (let i = 0; i < parentSeg.length; i++) {
      if (seg[i] !== parentSeg[i]) {
        parentMatches = false;
        break;
      }
    }
    if (!parentMatches) continue;
    if (idx >= seg.length) continue;

    if (direction === "toDisplay") {
      if (seg[idx] === oldKey) seg[idx] = newLabel;
    } else {
      if (seg[idx] === newLabel) seg[idx] = oldKey;
    }
  }

  return seg.join(".");
}

function rewriteRefsInTokenTreeInPlace(root, groupNameOverrides) {
  if (!root || typeof root !== "object") return;

  const rewriteString = (s) => {
    if (typeof s !== "string") return s;
    const m = s.match(/^\{(.+)\}$/);
    if (!m) return s;
    const inner = m[1];
    const mapped = mapPathSegmentsByOverrides(
      inner,
      groupNameOverrides,
      "toDisplay",
    );
    return `{${mapped}}`;
  };

  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === "string") node[i] = rewriteString(v);
        else walk(v);
      }
      return;
    }

    if (!node || typeof node !== "object") return;

    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string") {
        node[k] = rewriteString(v);
      } else {
        walk(v);
      }
    }
  };

  const tokensRoot =
    root.tokens && typeof root.tokens === "object" && root.tokens !== null
      ? root.tokens
      : root;

  walk(tokensRoot);
}
function rewriteRefsByTokenNameOverrides(
  root,
  nameOverrides,
  groupNameOverrides,
) {
  if (!nameOverrides || typeof nameOverrides !== "object") return;

  const normalize = (p) =>
    mapPathSegmentsByOverrides(p, groupNameOverrides, "toDisplay");

  const normalizedMap = Object.entries(nameOverrides).map(
    ([oldPath, newPath]) => [normalize(oldPath), normalize(newPath)],
  );

  const rewriteString = (s) => {
    if (typeof s !== "string") return s;
    const m = s.match(/^\{(.+)\}$/);
    if (!m) return s;

    let ref = m[1];
    for (const [oldNorm, newNorm] of normalizedMap) {
      if (ref === oldNorm) {
        return `{${newNorm}}`;
      }
    }
    return s;
  };

  (function walk(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        if (typeof v === "string") node[i] = rewriteString(v);
        else walk(v);
      });
      return;
    }

    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") node[k] = rewriteString(v);
      else walk(v);
    }
  })(root.tokens ?? root);
}
function expandNameOverrides(nameOverrides, groupNameOverrides) {
  const out = {};
  for (const [oldPath, newPathRaw] of Object.entries(nameOverrides || {})) {
    if (typeof oldPath !== "string" || typeof newPathRaw !== "string") continue;

    const newPath = newPathRaw.trim();
    if (!newPath) continue;

    if (!newPath.includes(".")) {
      const parent = oldPath.split(".").slice(0, -1).join(".");
      out[oldPath] = parent ? `${parent}.${newPath}` : newPath;
    } else {
      out[oldPath] = newPath;
    }
  }

  if (groupNameOverrides && typeof groupNameOverrides === "object") {
    const normalized = {};
    for (const [a, b] of Object.entries(out)) {
      const aa = mapPathSegmentsByOverrides(a, groupNameOverrides, "toDisplay");
      const bb = mapPathSegmentsByOverrides(b, groupNameOverrides, "toDisplay");
      normalized[aa] = bb;
    }
    return normalized;
  }

  return out;
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function findMissingReferences(tokenTree) {
  const existing = new Set();

  const collectPaths = (obj, path = []) => {
    if (!obj || typeof obj !== "object") return;

    if (Object.prototype.hasOwnProperty.call(obj, "$value")) {
      existing.add(path.join("."));
    }

    for (const [k, v] of Object.entries(obj)) {
      if (k === "value") continue;
      collectPaths(v, [...path, k]);
    }
  };

  const refs = [];
  const collectRefs = (obj, path = []) => {
    if (!obj || typeof obj !== "object") return;

    for (const [k, v] of Object.entries(obj)) {
      const p = [...path, k];
      if (k === "$value" && typeof v === "string") {
        const m = v.match(/^\{(.+)\}$/);
        if (m) refs.push({ at: path.join("."), ref: m[1] });
      } else {
        collectRefs(v, p);
      }
    }
  };

  collectPaths(tokenTree);
  collectRefs(tokenTree);

  const missing = refs.filter((r) => !existing.has(r.ref));
  return missing;
}

function ensureContainer(root, pathSegments) {
  let cur = root;
  for (const seg of pathSegments) {
    const next = cur[seg];
    if (!isRecord(next)) cur[seg] = {};
    cur = cur[seg];
  }
  return cur;
}

function getTokenTypeAtPath(tokensRoot, tokenPath) {
  const seg = String(tokenPath).split(".").filter(Boolean);
  if (!seg.length) return undefined;

  let node = tokensRoot;
  for (const s of seg) {
    if (!isRecord(node)) return undefined;
    node = node[s];
  }
  if (!isRecord(node)) return undefined;
  return typeof node.$type === "string" ? node.$type : undefined;
}

function setTokenAtPath(tokensRoot, tokenPath, type, value) {
  const seg = String(tokenPath).split(".").filter(Boolean);
  if (!seg.length) return;

  const key = seg[seg.length - 1];
  const parent = ensureContainer(tokensRoot, seg.slice(0, -1));

  const existing = parent[key];
  if (isRecord(existing)) {
    // Preserve an existing $type when the caller does not supply one
    // (override paths must not hardcode "string").
    if (type) existing.$type = type;
    existing.$value = value;
  } else {
    parent[key] = type ? { $type: type, $value: value } : { $value: value };
  }
}

function deleteAtPathIfExistsInTree(tokensRoot, tokenPath) {
  const seg = String(tokenPath).split(".").filter(Boolean);
  if (seg.length === 0) return;

  const key = seg[seg.length - 1];
  const parentSeg = seg.slice(0, -1);

  let parent = tokensRoot;
  for (const s of parentSeg) {
    if (!isRecord(parent)) return;
    parent = parent[s];
  }
  if (!isRecord(parent)) return;

  if (Object.prototype.hasOwnProperty.call(parent, key)) {
    delete parent[key];
  }
}

function applyWorkspaceEditsForCollectionMode(
  mergedTokens,
  workspace,
  collection,
  modeName,
) {
  if (!mergedTokens || typeof mergedTokens !== "object") return;

  const tokensRoot =
    mergedTokens.tokens && isRecord(mergedTokens.tokens)
      ? mergedTokens.tokens
      : mergedTokens;

  if (!isRecord(tokensRoot)) return;

  const del = workspace.modeDeletedPaths?.[modeName];
  if (Array.isArray(del)) {
    for (const p of del) {
      if (typeof p !== "string") continue;
      if (p === collection || p.startsWith(collection + ".")) {
        deleteAtPathIfExistsInTree(tokensRoot, p);
      }
    }
  }

  const key = `${modeName}::${collection}`;
  const added = workspace.modeAddedRows?.[key];
  if (Array.isArray(added)) {
    for (const r of added) {
      if (!r || typeof r.path !== "string" || typeof r.type !== "string")
        continue;
      if (r.path !== collection && !r.path.startsWith(collection + "."))
        continue;
      setTokenAtPath(tokensRoot, r.path, r.type, r.value);
    }
  }

  const overrides = workspace.overrides ?? {};

  for (const [k, v] of Object.entries(overrides)) {
    if (typeof k !== "string") continue;

    const prefix = modeName + "::";
    if (k.startsWith(prefix)) {
      const tokenPath = k.slice(prefix.length);
      if (tokenPath === collection || tokenPath.startsWith(collection + ".")) {
        const existingType = getTokenTypeAtPath(tokensRoot, tokenPath);
        setTokenAtPath(tokensRoot, tokenPath, existingType, v);
      }
    }
  }

  for (const [tokenPath, v] of Object.entries(overrides)) {
    if (typeof tokenPath !== "string") continue;
    if (tokenPath.includes("::")) continue;
    if (tokenPath !== collection && !tokenPath.startsWith(collection + "."))
      continue;

    const modeKey = `${modeName}::${tokenPath}`;
    if (Object.prototype.hasOwnProperty.call(overrides, modeKey)) continue;

    const existingType = getTokenTypeAtPath(tokensRoot, tokenPath);
    setTokenAtPath(tokensRoot, tokenPath, existingType, v);
  }
}

function isFigmaIdString(v) {
  return typeof v === "string" && /^\d+:\d+$/.test(v);
}

function resolveFigmaIdValuesInPlace(rootTokens) {
  const idToPrimitive = new Map();

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
  allowedModesByCollection,
) {
  const allowed = allowedModesByCollection?.[collectionName] ?? [];
  const collectionHasModes = Array.isArray(allowed) && allowed.length > 0;
  if (!collectionHasModes) {
    const rest = { ...(combo || {}) };
    delete rest.mode;
    return makeVariantFolder(rest);
  }

  return makeVariantFolder(combo);
}

function deriveAllowedModesByCollection(rootTokens) {
  const out = {};

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

      if (isJsonObject(fig) && isJsonObject(fig.valuesByMode)) {
        for (const k of Object.keys(fig.valuesByMode)) {
          ensure(collection).add(k);
        }
      }

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

  const asObj = {};
  for (const [col, set] of Object.entries(out)) {
    asObj[col] = Array.from(set);
  }
  return asObj;
}
function isComboAllowedForCollection(
  combo,
  collectionName,
  allowedModesByCollection,
) {
  const allowed = allowedModesByCollection?.[collectionName];
  const collectionHasModes = Array.isArray(allowed) && allowed.length > 0;

  if (!collectionHasModes) return true;

  if (combo && typeof combo === "object" && typeof combo.mode === "string") {
    return allowed.includes(combo.mode);
  }

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

  const fig = workspace?.figmaModifierOptions;
  if (fig && isPlainObject(fig)) {
    for (const [name, opt] of Object.entries(fig)) {
      if (!isPlainObject(opt)) continue;
      if (Array.isArray(opt.values) && opt.values.length) {
        out[name] = Array.from(new Set([...(out[name] ?? []), ...opt.values]));
      }
    }
  }

  return out;
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
    ([, v]) => typeof v === "string" && v.length,
  );
  if (entries.length === 0) return "default";
  if (entries.length === 1) return entries[0][1];

  return entries.map(([k, v]) => `${k}-${v}`).join("__");
}

function listTopLevelCollections(tokenTree) {
  if (!tokenTree || typeof tokenTree !== "object") return [];
  return Object.keys(tokenTree).filter(
    (k) => k !== "$metadata" && k !== "$extensions",
  );
}

function pickCollectionTree(tokenTree, collectionKey) {
  if (!tokenTree || typeof tokenTree !== "object") return {};
  const sub = tokenTree[collectionKey];
  if (!sub || typeof sub !== "object") return {};

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

function applyGroupNameOverridesToTokens(rootMaybeWrapped, groupNameOverrides) {
  if (!groupNameOverrides || typeof groupNameOverrides !== "object") return;

  const rootTokens = getTokensRoot(rootMaybeWrapped);
  if (!rootTokens || typeof rootTokens !== "object") return;

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

    if (Object.prototype.hasOwnProperty.call(parent, trimmed)) {
      console.warn(
        "[exportTokens] group rename skipped because key already exists:",
        groupId,
        "→",
        trimmed,
      );
      continue;
    }

    parent[trimmed] = parent[oldKey];
    delete parent[oldKey];
  }
}
function applyTokenNameOverridesToTokens(rootMaybeWrapped, nameOverrides) {
  if (!nameOverrides || typeof nameOverrides !== "object") return;

  const rootTokens = getTokensRoot(rootMaybeWrapped);
  if (!rootTokens || typeof rootTokens !== "object") return;

  for (const [oldPath, newPath] of Object.entries(nameOverrides)) {
    if (!oldPath.includes(".") || !newPath.includes(".")) continue;

    const oldSeg = oldPath.split(".");
    const newSeg = newPath.split(".");

    const oldKey = oldSeg.pop();
    const newKey = newSeg.pop();

    if (oldSeg.join(".") !== newSeg.join(".")) continue;

    let parent = rootTokens;
    for (const s of oldSeg) {
      if (!parent || typeof parent !== "object") {
        parent = null;
        break;
      }
      parent = parent[s];
    }
    if (!parent || typeof parent !== "object") continue;
    if (!(oldKey in parent)) continue;

    parent[newKey] = parent[oldKey];
    delete parent[oldKey];
  }
}

const ALLOWED_TOKEN_TYPES = APPLICATION_SUPPORTED_TYPES;

function validateToken(token) {
  if (!token || typeof token !== "object") {
    throw new Error("Invalid token object");
  }

  if (!isApplicationSupportedTokenType(token.$type)) {
    throw new Error(
      `Unsupported token type: ${token.$type}. Allowed: ${ALLOWED_TOKEN_TYPES.join(", ")}`,
    );
  }
}

function validateTokenTree(node) {
  if (!node || typeof node !== "object") return;

  if (node.$type && node.$value !== undefined) {
    validateToken(node);
    return;
  }

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

    const { tokens, modifiers, importReport } = req.body || {};
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

    const valueValidation = validateFigmaImportTokenTree(tokens);
    if (!valueValidation.ok) {
      return res.status(400).json({
        ok: false,
        message: `Invalid Figma DTCG value at ${valueValidation.path || "(root)"}: ${valueValidation.message}`,
      });
    }

    const normalizedModifiers =
      modifiers && typeof modifiers === "object" ? modifiers : {};
    const normalizedImportReport =
      importReport && typeof importReport === "object"
        ? {
            imported: Array.isArray(importReport.imported)
              ? importReport.imported
              : [],
            skipped: Array.isArray(importReport.skipped)
              ? importReport.skipped
              : [],
            warnings: Array.isArray(importReport.warnings)
              ? importReport.warnings
              : [],
          }
        : { imported: [], skipped: [], warnings: [] };

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
        modeAddedRows: {},
        modeDeletedPaths: {},
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
        2,
      ),
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
      importReport: normalizedImportReport,
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
        modeAddedRows: {},
        modeDeletedPaths: {},
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
      designSystemId,
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
        modeAddedRows: {},
        modeDeletedPaths: {},
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
      modeAddedRows: workspace.modeAddedRows ?? {},
      modeDeletedPaths: workspace.modeDeletedPaths ?? {},
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
      modeAddedRows,
      modeDeletedPaths,
    } = req.body;

    console.log(
      "saveWorkspace user",
      userId,
      "designSystem:",
      designSystemId,
      "files:",
      Array.isArray(files) ? files.length : 0,
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
      modeAddedRows: isPlainObject(modeAddedRows) ? modeAddedRows : {},
      modeDeletedPaths: isPlainObject(modeDeletedPaths) ? modeDeletedPaths : {},
    };

    const query = { user: userId, designSystem: designSystemId };
    console.log("saveWorkspace query =", query);
    const workspace = await TokenWorkspace.findOneAndUpdate(
      query,
      workspaceData,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    console.log(
      "saveWorkspace saved workspaceId:",
      workspace?._id,
      "for designSystem:",
      designSystemId,
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
      modeAddedRows: workspace.modeAddedRows ?? {},
      modeDeletedPaths: workspace.modeDeletedPaths ?? {},
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
    const groupNameOverrides = workspace.groupNameOverrides ?? {};

    const nameOverridesFixed = expandNameOverrides(
      workspace.nameOverrides ?? {},
      groupNameOverrides,
    );

    console.log("groupNameOverrides:", groupNameOverrides);
    console.log("nameOverrides raw:", workspace.nameOverrides);
    console.log("nameOverrides fixed:", nameOverridesFixed);

    const mapPath = (p) =>
      typeof p === "string" && nameOverridesFixed[p]
        ? nameOverridesFixed[p]
        : p;

    const overridesFixed = {};
    for (const [k, v] of Object.entries(workspace.overrides ?? {})) {
      if (typeof k !== "string") continue;

      if (k.includes("::")) {
        const [mode, tokenPath] = k.split("::");
        overridesFixed[`${mode}::${mapPath(tokenPath)}`] = v;
      } else {
        overridesFixed[mapPath(k)] = v;
      }
    }
    const overridesFixedBaseOnly = Object.fromEntries(
      Object.entries(overridesFixed).filter(
        ([k]) => typeof k === "string" && !k.includes("::"),
      ),
    );

    const deletedPathsFixed = (workspace.deletedPaths ?? []).map(mapPath);

    const modeDeletedPathsFixed = {};
    for (const [mode, arr] of Object.entries(
      workspace.modeDeletedPaths ?? {},
    )) {
      modeDeletedPathsFixed[mode] = Array.isArray(arr) ? arr.map(mapPath) : arr;
    }

    const modeAddedRowsFixed = {};
    for (const [key, rows] of Object.entries(workspace.modeAddedRows ?? {})) {
      modeAddedRowsFixed[key] = Array.isArray(rows)
        ? rows.map((r) =>
            r && typeof r.path === "string"
              ? { ...r, path: mapPath(r.path) }
              : r,
          )
        : rows;
    }

    const workspaceExport = {
      ...workspace,
      overrides: overridesFixed,
      deletedPaths: deletedPathsFixed,
      modeDeletedPaths: modeDeletedPathsFixed,
      modeAddedRows: modeAddedRowsFixed,
    };

    if (!Array.isArray(workspace.files) || workspace.files.length === 0) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "Workspace has no token files" });
    }

    const format = (req.query.format || "css").toString();
    const bundle = String(req.query.bundle || "") === "1";
    const remBasePxRaw = req.query.remBasePx;
    const remBasePx =
      remBasePxRaw === undefined || remBasePxRaw === null || remBasePxRaw === ""
        ? undefined
        : Number(remBasePxRaw);
    const platformExportOptions = {
      remBasePx:
        typeof remBasePx === "number" && Number.isFinite(remBasePx)
          ? remBasePx
          : undefined,
    };
    /** @type {import('../utils/dtcg/exporters/exportResult.js').ExportIssue[]} */
    const exportWarnings = [];
    /** @type {import('../utils/dtcg/exporters/exportResult.js').ExportIssue[]} */
    const exportErrors = [];

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
    for (const [fileName, doc] of Object.entries(docs)) {
      const scan = (obj, path = []) => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          const p = [...path, k];
          if (k === "value" && typeof v === "string" && v.startsWith("{")) {
            console.log("[ref-check]", fileName, p.join("."), "=>", v);
          } else {
            scan(v, p);
          }
        }
      };
      scan(doc);
    }
    const baseResolved = resolveUploadedDocuments(docs, {});
    const baseMerged = baseResolved;

    pruneDeletedTokens(baseMerged, deletedPathsFixed);
    const cleanedOverridesBase = buildCleanOverrides(
      baseMerged,
      overridesFixedBaseOnly,
    );
    console.log(
      "groupNameOverrides keys:",
      Object.keys(workspace.groupNameOverrides ?? {}).slice(0, 10),
    );
    console.log(
      "nameOverrides keys:",
      Object.keys(workspace.nameOverrides ?? {}).slice(0, 10),
    );
    console.log("has root.tokens?", !!baseMerged.tokens);

    applyOverridesToTokens(baseMerged, cleanedOverridesBase);
    applyGroupNameOverridesToTokens(baseMerged, groupNameOverrides);
    applyTokenNameOverridesToTokens(baseMerged, nameOverridesFixed);

    rewriteRefsInTokenTreeInPlace(baseMerged, groupNameOverrides);

    rewriteRefsByTokenNameOverrides(
      baseMerged,
      nameOverridesFixed,
      groupNameOverrides,
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
      collectionHasModes(c, allowedModesByCollection),
    );

    const collectionsWithoutModes = collections.filter(
      (c) => !collectionHasModes(c, allowedModesByCollection),
    );
    const exportedKeySet = new Set();

    // Platform preflight on the resolved base view — fail with structured
    // errors before ZIP headers when remBasePx is missing or colors are unsupported.
    if (format !== "json") {
      const preflight = preparePlatformExport(
        format,
        baseMerged,
        platformExportOptions,
      );
      if (!preflight.ok) {
        return res.status(400).json({
          ok: false,
          stage: "platformPreflight",
          message: preflight.errors.map((e) => e.message).join("; "),
          errors: preflight.errors,
          warnings: preflight.warnings,
        });
      }
    }

    const dsSuffix = designSystemId ? `-${designSystemId}` : "";
    const zipName = `tokens${dsSuffix}.${format}.zip`;

    // Build all ZIP entries first. Never start streaming a ZIP until Style
    // Dictionary + the object-fallthrough guard have succeeded, so the UI
    // receives a JSON 400 instead of an invalid download.
    const tmpDir = os.tmpdir();
    const buildBaseRoot = path.join(
      tmpDir,
      `export-${userId}${dsSuffix}-${Date.now()}`,
    );
    fs.mkdirSync(buildBaseRoot, { recursive: true });

    /** @type {{ kind: 'file', absPath: string, name: string } | { kind: 'string', content: string, name: string }[]} */
    const pendingZipEntries = [];
    const exported = new Set();

    /** Destination filename from the format's SD template (tokens.css, etc.). */
    function platformDestinationFile() {
      const probe = createSdConfig(format, path.join(buildBaseRoot, "_probe.json"), path.join(buildBaseRoot, "_probe-build"));
      const platformKey = Object.keys(probe.platforms)[0];
      return probe.platforms[platformKey].files?.[0]?.destination || "tokens.out";
    }
    const originalDestination =
      format === "json" ? "tokens.dtcg.json" : platformDestinationFile();
    if (format === "json" && collectionsWithoutModes.length > 0) {
      const mergedTokens = resolveUploadedDocuments(docs, {});
      pruneDeletedTokens(mergedTokens, deletedPathsFixed);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        overridesFixedBaseOnly,
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);

      applyGroupNameOverridesToTokens(mergedTokens, groupNameOverrides);
      applyTokenNameOverridesToTokens(mergedTokens, nameOverridesFixed);

      for (const col of collectionsWithoutModes) {
        applyWorkspaceEditsForCollectionMode(
          mergedTokens,
          workspaceExport,
          col,
          "default",
        );
      }
      rewriteRefsInTokenTreeInPlace(mergedTokens, groupNameOverrides);
      rewriteRefsByTokenNameOverrides(
        mergedTokens,
        nameOverridesFixed,
        groupNameOverrides,
      );
      if (process.env.DEBUG_EXPORT === "1") {
        const dumpPath = path.join(buildBaseRoot, `debug-nomode-json.json`);
        fs.writeFileSync(
          dumpPath,
          JSON.stringify(mergedTokens, null, 2),
          "utf8",
        );
        console.log("[exportTokens] wrote debug dump:", dumpPath);
      }
      for (const col of collectionsWithoutModes) {
        const colTree = pickCollectionTree(mergedTokens, col);
        const canonical = exportCanonicalJson(colTree);
        exportWarnings.push(...canonical.warnings);
        if (!canonical.ok) {
          exportErrors.push(...canonical.errors);
          continue;
        }
        const entryPath = path.posix.join(col, "default", "tokens.dtcg.json");
        pendingZipEntries.push({
          kind: "string",
          content: canonical.json,
          name: entryPath,
        });
      }
    }

    if (format !== "json" && collectionsWithoutModes.length > 0) {
      const mergedTokens = resolveUploadedDocuments(docs, {});

      pruneDeletedTokens(mergedTokens, deletedPathsFixed);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        overridesFixedBaseOnly,
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);

      applyGroupNameOverridesToTokens(mergedTokens, groupNameOverrides);
      applyTokenNameOverridesToTokens(mergedTokens, nameOverridesFixed);

      for (const col of collectionsWithoutModes) {
        applyWorkspaceEditsForCollectionMode(
          mergedTokens,
          workspaceExport,
          col,
          "default",
        );
      }
      rewriteRefsInTokenTreeInPlace(mergedTokens, groupNameOverrides);

      rewriteRefsByTokenNameOverrides(
        mergedTokens,
        nameOverridesFixed,
        groupNameOverrides,
      );

      if (process.env.DEBUG_EXPORT === "1") {
        const dumpPath = path.join(
          buildBaseRoot,
          `debug-nomode-before-normalize.json`,
        );
        fs.writeFileSync(
          dumpPath,
          JSON.stringify(mergedTokens, null, 2),
          "utf8",
        );
        console.log("[exportTokens] wrote debug dump:", dumpPath);
      }

      const preparedNoMode = preparePlatformExport(
        format,
        mergedTokens,
        platformExportOptions,
      );
      exportWarnings.push(...preparedNoMode.warnings);
      if (!preparedNoMode.ok) {
        exportErrors.push(...preparedNoMode.errors);
        throw Object.assign(
          new Error(
            preparedNoMode.errors.map((e) => e.message).join("; ") ||
              "Platform export failed",
          ),
          { exportErrors, exportWarnings, status: 400 },
        );
      }
      const platformTokensNoMode = preparedNoMode.document;

      const jsonFilePath = path.join(buildBaseRoot, `tokens-nomode.json`);
      fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(platformTokensNoMode, null, 2),
        "utf8",
      );

      const missing = findMissingReferences(platformTokensNoMode);
      if (missing.length) {
        console.error("Missing token references (showing up to 30):");
        for (const m of missing.slice(0, 30)) {
          console.error(
            `- token at "${m.at}" references "{${m.ref}}" (not found)`,
          );
        }
        throw new Error(
          `Reference Error: ${missing.length} token references could not be found.`,
        );
      }

      const buildBase = path.join(buildBaseRoot, `build-nomode`);
      const sdResult = await runStyleDictionaryExport({
        format,
        jsonFilePath,
        buildBase,
        files: collectionsWithoutModes.map((col) => ({
          destination: path.posix.join(col, "default", originalDestination),
          filter: (token) => Array.isArray(token.path) && token.path[0] === col,
        })),
      });
      exportWarnings.push(...sdResult.warnings);
      if (!sdResult.ok) {
        exportErrors.push(...sdResult.errors);
        throw Object.assign(
          new Error(
            sdResult.errors.map((e) => e.message).join("; ") ||
              "Export guard failed: raw object token values",
          ),
          { exportErrors, exportWarnings, status: 400 },
        );
      }
      if (process.env.DEBUG_EXPORT === "1") {
        console.log("[exportTokens] nomode SD diagnostics", sdResult.diagnostics);
      }

      for (const col of collectionsWithoutModes) {
        const destRel = path.posix.join(col, "default", originalDestination);
        const abs = (sdResult.outputFilePaths || []).find((p) =>
          p.replace(/\\/g, "/").endsWith(destRel),
        );
        if (!abs || !fs.existsSync(abs)) continue;
        pendingZipEntries.push({ kind: "file", absPath: abs, name: destRel });
      }
    }


    for (const combo of combos) {
      const variantFolder = makeVariantFolder(combo);

      stage = `resolveTokens:${variantFolder}`;
      let mergedTokens = resolveUploadedDocuments(docs, combo);

      pruneDeletedTokens(mergedTokens, deletedPathsFixed);
      const cleanedOverrides = buildCleanOverrides(
        mergedTokens,
        overridesFixedBaseOnly,
      );
      applyOverridesToTokens(mergedTokens, cleanedOverrides);

      applyGroupNameOverridesToTokens(mergedTokens, groupNameOverrides);
      applyTokenNameOverridesToTokens(mergedTokens, nameOverridesFixed);

      applyValuesByModeToValueInPlace(mergedTokens, combo);
      resolveFigmaIdValuesInPlace(mergedTokens);

      for (const col of collections) {
        if (!isComboAllowedForCollection(combo, col, allowedModesByCollection))
          continue;

        const hasModes = collectionHasModes(col, allowedModesByCollection);
        const modeName = hasModes ? combo?.mode || "default" : "default";

        applyWorkspaceEditsForCollectionMode(
          mergedTokens,
          workspaceExport,
          col,
          modeName,
        );
      }
      rewriteRefsInTokenTreeInPlace(mergedTokens, groupNameOverrides);

      rewriteRefsByTokenNameOverrides(
        mergedTokens,
        nameOverridesFixed,
        groupNameOverrides,
      );
      if (process.env.DEBUG_EXPORT === "1") {
        const dumpPath = path.join(
          buildBaseRoot,
          `debug-${variantFolder}.json`,
        );
        fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
        fs.writeFileSync(
          dumpPath,
          JSON.stringify(mergedTokens, null, 2),
          "utf8",
        );
        console.log("[exportTokens] wrote debug dump:", dumpPath);
      }

      if (!mergedTokens || Object.keys(mergedTokens).length === 0) continue;

      if (format === "json") {
        for (const col of collections) {
          if (
            !isComboAllowedForCollection(combo, col, allowedModesByCollection)
          )
            continue;

          const vf = makeVariantFolderForCollection(
            combo,
            col,
            allowedModesByCollection,
          );
          const exportKey = `${col}__${vf}__json`;
          if (exportedKeySet.has(exportKey)) continue;
          exportedKeySet.add(exportKey);

          const colTree = pickCollectionTree(mergedTokens, col);
          const canonical = exportCanonicalJson(colTree);
          exportWarnings.push(...canonical.warnings);
          if (!canonical.ok) {
            exportErrors.push(...canonical.errors);
            continue;
          }
          const entryPath = path.posix.join(col, vf, "tokens.dtcg.json");
          pendingZipEntries.push({
            kind: "string",
            content: canonical.json,
            name: entryPath,
          });
        }
        continue;
      }

      const preparedVariant = preparePlatformExport(
        format,
        mergedTokens,
        platformExportOptions,
      );
      exportWarnings.push(...preparedVariant.warnings);
      if (!preparedVariant.ok) {
        exportErrors.push(...preparedVariant.errors);
        throw Object.assign(
          new Error(
            preparedVariant.errors.map((e) => e.message).join("; ") ||
              "Platform export failed",
          ),
          {
            exportErrors,
            exportWarnings,
            status: 400,
          },
        );
      }
      mergedTokens = preparedVariant.document;
      const safeVariantKey = String(variantFolder).replace(/[\\/]/g, "__");
      const jsonFilePath = path.join(
        buildBaseRoot,
        `tokens-${safeVariantKey}.json`,
      );
      fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(mergedTokens, null, 2),
        "utf8",
      );

      const buildBase = path.join(buildBaseRoot, `build-${variantFolder}`);

      const allowedCollections = collectionsWithModes.filter((col) =>
        isComboAllowedForCollection(combo, col, allowedModesByCollection),
      );

      const sdFiles = [];
      for (const col of allowedCollections) {
        const colVariantFolder = makeVariantFolderForCollection(
          combo,
          col,
          allowedModesByCollection,
        );

        const dedupeKey = `${format}::${col}::${colVariantFolder}`;
        if (exported.has(dedupeKey)) continue;
        exported.add(dedupeKey);

        sdFiles.push({
          destination: path.posix.join(
            col,
            colVariantFolder,
            originalDestination,
          ),
          filter: (token) => Array.isArray(token.path) && token.path[0] === col,
        });
      }
      if (sdFiles.length === 0) {
        continue;
      }

      const missing = findMissingReferences(mergedTokens);
      if (missing.length) {
        console.error("Missing token references (showing up to 30):");
        for (const m of missing.slice(0, 30)) {
          console.error(
            `- token at "${m.at}" references "{${m.ref}}" (not found)`,
          );
        }
        throw new Error(
          `Reference Error: ${missing.length} token references could not be found.`,
        );
      }

      const sdResult = await runStyleDictionaryExport({
        format,
        jsonFilePath,
        buildBase,
        files: sdFiles,
      });
      exportWarnings.push(...sdResult.warnings);
      if (!sdResult.ok) {
        exportErrors.push(...sdResult.errors);
        throw Object.assign(
          new Error(
            sdResult.errors.map((e) => e.message).join("; ") ||
              "Export guard failed: raw object token values",
          ),
          { exportErrors, exportWarnings, status: 400 },
        );
      }
      if (process.env.DEBUG_EXPORT === "1") {
        console.log(
          "[exportTokens] variant SD diagnostics",
          variantFolder,
          sdResult.diagnostics,
        );
      }

      for (const fileSpec of sdFiles) {
        const destRel = fileSpec.destination;
        const abs = (sdResult.outputFilePaths || []).find((p) =>
          p.replace(/\\/g, "/").endsWith(destRel),
        );
        if (!abs || !fs.existsSync(abs)) continue;
        pendingZipEntries.push({ kind: "file", absPath: abs, name: destRel });
      }
    }


    if (exportErrors.length > 0) {
      return res.status(400).json({
        ok: false,
        stage: "exportGuard",
        message: exportErrors.map((e) => e.message).join("; "),
        errors: exportErrors,
        warnings: exportWarnings,
      });
    }

    if (pendingZipEntries.length === 0) {
      return res.status(400).json({
        ok: false,
        stage: "exportEmpty",
        message: "No exportable token files were produced.",
        errors: [],
        warnings: exportWarnings,
      });
    }

    if (exportWarnings.length > 0) {
      pendingZipEntries.push({
        kind: "string",
        content: JSON.stringify(
          { ok: true, warnings: exportWarnings, errors: [] },
          null,
          2,
        ),
        name: "export-report.json",
      });
    }

    // Only now start the ZIP download — builds and guards have passed.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("ZIP error", err);
      throw err;
    });
    archive.pipe(res);

    for (const entry of pendingZipEntries) {
      if (entry.kind === "file") {
        archive.file(entry.absPath, { name: entry.name });
      } else {
        archive.append(entry.content, { name: entry.name });
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
    return res.status(err?.status && Number.isInteger(err.status) ? err.status : 500).json({
      ok: false,
      stage,
      message: err instanceof Error ? err.message : "Unknown export error",
      errors: err?.exportErrors,
      warnings: err?.exportWarnings,
    });
  }
}
