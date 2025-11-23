import TokenWorkspace from "../models/TokenWorkspace.js";
import fs from "fs";
import os from "os";
import path from "path";
import StyleDictionary from "style-dictionary";

import { mergeWorkspaceFiles } from "../utils/dtcg/mergeWorkspaceFiles.js";
import { applyOverridesToTokens } from "../utils/dtcg/applyOverrides.js";
import { normalizeDtcgForCss } from "../utils/dtcg/normalizeDtcgForCss.js";
import { createSdConfig } from "../utils/sd/index.js";
import {
  pruneDeletedTokens,
  buildCleanOverrides,
} from "../utils/dtcg/cleanupWorkspaceTokens.js";

function getUserIdFromReq(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?._id) return req.user._id;
  return null;
}

export async function getWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      console.warn("getWorkspace: no user id in token", req.user);
      return res.json({ files: [], modifiers: {}, overrides: {} });
    }

    const workspace = await TokenWorkspace.findOne({ user: userId }).lean();
    console.log("getWorkspace: found?", !!workspace);

    if (!workspace) {
      return res.json({
        files: [],
        modifiers: {},
        overrides: {},
        nameOverrides: {},
        addedRows: [],
        deletedPaths: [],
        rowOrder: [],
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
    });
  } catch (err) {
    console.error("getWorkspace error", err);
    next(err);
  }
}

export async function saveWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      console.error("saveWorkspace: no user id in token", req.user);
      return res
        .status(400)
        .json({ ok: false, message: "No user id in token" });
    }

    const {
      files,
      modifiers,
      overrides,
      nameOverrides,
      addedRows,
      deletedPaths,
      rowOrder,
    } = req.body;

    console.log(
      "saveWorkspace user",
      userId,
      "files:",
      Array.isArray(files) ? files.length : 0
    );

    const workspaceData = {
      user: userId,
      files: Array.isArray(files) ? files : [],
      modifiers: modifiers ?? {},
      overrides: overrides ?? {},
      nameOverrides: nameOverrides ?? {},
      addedRows: Array.isArray(addedRows) ? addedRows : [],
      deletedPaths: Array.isArray(deletedPaths) ? deletedPaths : [],
      rowOrder: Array.isArray(rowOrder) ? rowOrder : [],
    };

    const workspace = await TokenWorkspace.findOneAndUpdate(
      { user: userId },
      workspaceData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      files: workspace.files ?? [],
      modifiers: workspace.modifiers ?? {},
      overrides: workspace.overrides ?? {},
      nameOverrides: workspace.nameOverrides ?? {},
      addedRows: workspace.addedRows,
      deletedPaths: workspace.deletedPaths,
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
    if (!userId) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    stage = "loadWorkspace";
    const workspace = await TokenWorkspace.findOne({ user: userId }).lean();
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

    stage = "mergeTokens";
    const mergedTokens = mergeWorkspaceFiles(workspace.files);

    pruneDeletedTokens(mergedTokens, workspace.deletedPaths ?? []);

    const cleanedOverrides = buildCleanOverrides(
      mergedTokens,
      workspace.overrides ?? {}
    );

    applyOverridesToTokens(mergedTokens, cleanedOverrides);
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
    const jsonFilePath = path.join(tmpDir, `tokens-${userId}.json`);
    fs.writeFileSync(
      jsonFilePath,
      JSON.stringify(mergedTokens, null, 2),
      "utf8"
    );

    stage = "configureStyleDictionary";
    const buildBase = path.join(tmpDir, `build-${userId}`);
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
    const destFileName = platformConfig.files[0].destination;
    const outputFullPath = path.join(platformConfig.buildPath, destFileName);

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
      `attachment; filename="${destFileName}"`
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
