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
    });
  } catch (err) {
    console.error("saveWorkspace error", err);
    next(err);
  }
}

export async function exportTokens(req, res, next) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    const designSystemId = getDesignSystemIdFromReq(req);
    console.log(
      "exportTokens user:",
      userId,
      "designSystemId:",
      designSystemId,
      "params:",
      req.params,
      "query:",
      req.query
    );

    if (!userId) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    stage = "loadWorkspace";
    const query = { user: userId };
    if (designSystemId) {
      query.designSystem = designSystemId;
    }
    console.log("exportTokens query =", query);
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

    const resolverInput = { ...(workspace.modifiers || {}) };

    const activeModifierLabel =
      resolverInput.mode ||
      resolverInput.theme ||
      resolverInput.colorMode ||
      null;

    for (const [key, value] of Object.entries(req.query)) {
      if (key === "format" || key === "designSystemId") continue;
      if (typeof value === "string" && value.trim() !== "") {
        resolverInput[key] = value;
      }
    }

    stage = "buildDocsFromWorkspace";
    const docs = {};
    for (const file of workspace.files) {
      if (!file || !file.name) continue;
      docs[file.name] =
        file.content !== undefined ? file.content : (file.json ?? {});
    }

    stage = "resolveTokens";
    const mergedTokens = resolveUploadedDocuments(docs, resolverInput);

    // stage = "mergeTokens";
    // const mergedTokens = mergeWorkspaceFiles(workspace.files);

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

    if (format === "json") {
      if (!mergedTokens || Object.keys(mergedTokens).length === 0) {
        return res.status(400).json({
          ok: false,
          stage,
          message: "Merged token object is empty – nothing to export",
        });
      }

      let filename = "tokens.dtcg.json";
      if (activeModifierLabel) {
        filename = `tokens.${activeModifierLabel}.dtcg.json`;
      }
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Type", "application/json");

      return res.send(JSON.stringify(mergedTokens, null, 2));
    }

    normalizeDtcgForCss(mergedTokens);

    const sample = mergedTokens?.global?.palette?.neutral?.["50"];
    console.log(
      "Sample token after normalizeDtcgForCss:",
      JSON.stringify(sample, null, 2)
    );

    if (!mergedTokens || Object.keys(mergedTokens).length === 0) {
      return res.status(400).json({
        ok: false,
        stage,
        message: "Merged token object is empty – nothing to export",
      });
    }

    stage = "writeTempFile";
    const tmpDir = os.tmpdir();
    const dsSuffix = designSystemId ? `-${designSystemId}` : "";
    const jsonFilePath = path.join(tmpDir, `tokens-${userId}${dsSuffix}.json`);

    fs.writeFileSync(
      jsonFilePath,
      JSON.stringify(mergedTokens, null, 2),
      "utf8"
    );

    stage = "configureStyleDictionary";
    const buildBase = path.join(tmpDir, `build-${userId}${dsSuffix}`);
    const sdConfig = createSdConfig(format, jsonFilePath, buildBase);

    if (!sdConfig) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    for (const platform of Object.values(sdConfig.platforms)) {
      fs.mkdirSync(platform.buildPath, { recursive: true });
    }

    stage = "buildStyleDictionary";
    const sd = new StyleDictionary(sdConfig);
    await sd.buildAllPlatforms();

    stage = "sendFile";
    const destPlatformKey = Object.keys(sdConfig.platforms)[0];
    const platformConfig = sdConfig.platforms[destPlatformKey];

    const builtFileName = platformConfig.files[0].destination;
    const outputFullPath = path.join(platformConfig.buildPath, builtFileName);
    let downloadFileName = builtFileName;

    if (activeModifierLabel) {
      const extIndex = downloadFileName.lastIndexOf(".");
      if (extIndex !== -1) {
        const base = downloadFileName.slice(0, extIndex);
        const ext = downloadFileName.slice(extIndex);
        downloadFileName = `${base}.${activeModifierLabel}${ext}`;
      } else {
        downloadFileName = `${downloadFileName}.${activeModifierLabel}`;
      }
    }

    if (!fs.existsSync(outputFullPath)) {
      console.error("exportTokens: output file not found", outputFullPath);
      return res.status(500).json({
        ok: false,
        stage,
        message: `Output file not found: ${outputFullPath}`,
      });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFileName}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    res.sendFile(outputFullPath, (err) => {
      if (err) {
        console.error("exportTokens sendFile error", err);
        return next(err);
      }
    });
  } catch (err) {
    console.error("exportTokens error at stage:", stage, err);
    return res.status(500).json({
      ok: false,
      stage,
      message: err instanceof Error ? err.message : "Unknown export error",
    });
  }
}
