import TokenWorkspace from "../models/TokenWorkspace.js";
import fs from "fs";
import os from "os";
import path from "path";
import StyleDictionary from "style-dictionary";

function getUserIdFromReq(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?._id) return req.user._id;
  return null;
}

function applyOverridesToTokens(root, overrides = {}) {
  if (!root || typeof root !== "object") return;
  for (const [fullPath, newValue] of Object.entries(overrides)) {
    if (!fullPath) continue;
    const segments = fullPath.split(".");
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (!node[key] || typeof node[key] !== "object") {
        node[key] = {};
      }
      node = node[key];
    }
    const leaf = segments[segments.length - 1];

    // DTCG token object: { $type: 'color', $value: ... }
    const existing = node[leaf];
    if (existing && typeof existing === "object") {
      node[leaf] = {
        ...existing,
        $value: newValue,
      };
    } else {
      node[leaf] = { $value: newValue };
    }
  }
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
function mergeWorkspaceFiles(files) {
  const root = {};
  if (!Array.isArray(files)) return root;

  for (const f of files) {
    if (f && f.content && typeof f.content === "object") {
      Object.assign(root, f.content);
    }
  }
  return root;
}

function extractPrimitiveColor(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;

  if (typeof value.hex === "string") return value.hex;

  if (typeof value.srgb === "string") return value.srgb;

  if (
    value.hex &&
    typeof value.hex === "object" &&
    typeof value.hex.$value === "string"
  ) {
    return value.hex.$value;
  }
  if (
    value.srgb &&
    typeof value.srgb === "object" &&
    typeof value.srgb.$value === "string"
  ) {
    return value.srgb.$value;
  }

  return null;
}

function normalizeDtcgForCss(node, path = []) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach((item, idx) =>
      normalizeDtcgForCss(item, path.concat(String(idx)))
    );
    return;
  }
  if ("$value" in node) {
    const before = node.$value;
    const primitive = extractPrimitiveColor(before);
    if (primitive && before !== primitive) {
      console.log(
        "normalizeDtcgForCss: converted",
        path.join("."),
        "from",
        JSON.stringify(before),
        "to",
        primitive
      );
      node.$value = primitive;
    }
  }

  for (const [key, value] of Object.entries(node)) {
    normalizeDtcgForCss(value, path.concat(key));
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
    applyOverridesToTokens(mergedTokens, workspace.overrides);
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
    const sdConfig = {
      source: [jsonFilePath],
      platforms: {},
    };

    if (format === "css") {
      sdConfig.platforms.css = {
        transformGroup: "css",
        buildPath: path.join(buildBase, "css/"),
        files: [
          {
            destination: "tokens.css",
            format: "css/variables",
          },
        ],
      };
    } else if (format === "tailwind") {
      sdConfig.platforms.tailwind = {
        transformGroup: "js", // JS module for Tailwind config
        buildPath: path.join(buildBase, "tailwind/"),
        files: [
          {
            destination: "tailwind.tokens.js",
            format: "javascript/module",
            options: {
              outputReferences: false,
              showFileHeader: true,
            },
          },
        ],
      };
    } else if (format === "swift") {
      sdConfig.platforms.ios = {
        transformGroup: "ios-swift",
        buildPath: path.join(buildBase, "ios/"),
        files: [
          {
            destination: "Colors.swift",
            format: "ios-swift/colors-swift",
          },
        ],
      };
    } else {
      return res.status(400).json({
        ok: false,
        stage,
        message: `Unsupported export format: ${format}`,
      });
    }

    // Ensure the build path exists
    for (const platform of Object.values(sdConfig.platforms)) {
      fs.mkdirSync(platform.buildPath, { recursive: true });
    }

    // 4) Run Style Dictionary – v5 Node API
    stage = "buildStyleDictionary";
    const sd = new StyleDictionary(sdConfig);
    await sd.buildAllPlatforms();

    // 5) Determine which file to send back
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
      // optional cleanup here
    });
  } catch (err) {
    console.error("exportTokens error at stage:", stage, err);
    // instead of next(err) send JSON with details so frontend can read it
    return res.status(500).json({
      ok: false,
      stage,
      message: err instanceof Error ? err.message : "Unknown export error",
    });
  }
}
