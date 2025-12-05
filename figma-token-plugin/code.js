// ---------------- shared helpers ----------------

const STORAGE_KEYS = {
  apiUrl: "tm_apiUrl", // global for all files
  fileConfig: "tm_fileConfig", // map: { [fileKey]: { designSystemId, jwt } }
};

// create / read a *per-file* key, stored in this Figma file's pluginData
function getCurrentFileKey() {
  let key = figma.root.getPluginData("tm_fileKey");
  if (typeof key === "string" && key.length > 0) {
    return key;
  }

  // generate a new random key and store it on this file
  key =
    "file-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);

  figma.root.setPluginData("tm_fileKey", key);
  console.log("[TokenManager] Generated new fileKey for this file:", key);
  return key;
}

async function getSettingsForCurrentFile() {
  const fileKey = getCurrentFileKey();

  const [apiUrl, fileConfig] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl),
    figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig),
  ]);

  const config =
    fileConfig && typeof fileConfig === "object" ? fileConfig[fileKey] : null;

  const designSystemId = config ? config.designSystemId : null;
  const jwt = config ? config.jwt : null;

  console.log("TokenManager settings for file (getSettingsForCurrentFile)", {
    fileKey,
    apiUrl,
    designSystemId,
    hasJwt: !!jwt,
    rawFileConfig: fileConfig,
  });

  return { apiUrl, designSystemId, jwt };
}

// -------------------------------------------------
//               Figma → DTCG converter
// -------------------------------------------------

function figmaVariablesToDtcg() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();

  const dtcgTokens = {};

  function toHexChannel(n) {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  }

  function slugify(name) {
    return name.trim().replace(/\s+/g, "-");
  }

  function ensureGroup(root, segments) {
    let obj = root;
    for (let i = 0; i < segments.length; i++) {
      const key = segments[i];
      if (!obj[key] || typeof obj[key] !== "object") {
        obj[key] = {};
      }
      obj = obj[key];
    }
    return obj;
  }

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];

    // ----- collection name ----- //
    let collectionName = "default";
    for (let j = 0; j < collections.length; j++) {
      if (collections[j].id === variable.variableCollectionId) {
        collectionName = collections[j].name;
        break;
      }
    }
    const collectionKey = slugify(collectionName);

    // groups + token name
    const rawParts = variable.name
      .split("/")
      .map((p) => slugify(p))
      .filter(Boolean);
    if (rawParts.length === 0) continue;

    const tokenKey = rawParts[rawParts.length - 1];
    const groupSegments = rawParts.slice(0, -1);
    const containerPath = [collectionKey, ...groupSegments];

    // value
    const modeIds = variable.valuesByMode
      ? Object.keys(variable.valuesByMode)
      : [];
    const modeId = modeIds.length > 0 ? modeIds[0] : null;

    let value;
    if (variable.valuesByMode && modeId) value = variable.valuesByMode[modeId];
    else if (variable.value !== undefined) value = variable.value;
    else value = null;

    let token;

    if (variable.resolvedType === "COLOR" && value) {
      const color = value;
      const r8 = color.r * 255;
      const g8 = color.g * 255;
      const b8 = color.b * 255;
      const a = color.a != null ? color.a : 1;

      let hex = "#" + toHexChannel(r8) + toHexChannel(g8) + toHexChannel(b8);
      if (a < 0.999) hex += toHexChannel(a * 255);

      token = {
        $type: "color",
        $value: hex,
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            modeId: modeId,
          },
        },
      };
    } else if (variable.resolvedType === "FLOAT") {
      token = {
        $type: "dimension",
        $value: value,
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            modeId: modeId,
          },
        },
      };
    } else {
      token = {
        $type: "string",
        $value: String(value),
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            modeId: modeId,
          },
        },
      };
    }

    const container = ensureGroup(dtcgTokens, containerPath);
    container[tokenKey] = token;
  }

  return dtcgTokens;
}

async function syncToTokenManager() {
  try {
    const { apiUrl, designSystemId, jwt } = await getSettingsForCurrentFile();

    if (!apiUrl || !designSystemId || !jwt) {
      figma.notify(
        "Token Manager settings missing for this Figma file. Please run Settings first."
      );
      figma.closePlugin();
      return;
    }

    const tokens = figmaVariablesToDtcg();

    const base = apiUrl.replace(/\/$/, "");
    const url =
      base +
      "/api/tokens/figma-sync?designSystemId=" +
      encodeURIComponent(designSystemId);

    console.log("Syncing to TokenManager", { url, designSystemId });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ tokens }),
    });

    if (!response.ok) {
      const text = await response.text();
      figma.notify("Sync failed: " + response.status + " " + text);
    } else {
      const text = await response.text();
      console.log("Sync OK:", text);
      figma.notify("Tokens synced to Token Manager ✓");
    }
  } catch (err) {
    console.error(err);
    figma.notify("Error: " + err.message);
  } finally {
    figma.closePlugin();
  }
}

// --------------- SETTINGS UI -----------------

async function openSettingsUI() {
  const { apiUrl, designSystemId, jwt } = await getSettingsForCurrentFile();

  figma.showUI(__html__, { width: 420, height: 260 });

  figma.ui.postMessage({
    type: "init-settings",
    apiUrl: apiUrl || "http://localhost:8081",
    designSystemId: designSystemId || "",
    jwt: jwt || "",
  });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "save-settings") {
    const fileKey = getCurrentFileKey();

    const apiUrl =
      (msg.apiUrl || "").trim().replace(/\/$/, "") || "http://localhost:8081";
    const designSystemId = (msg.designSystemId || "").trim();
    const jwt = (msg.jwt || "").trim();

    if (!designSystemId || !jwt) {
      figma.notify("Please enter Design System ID and JWT.");
      return;
    }

    let fileConfig =
      (await figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig)) || {};

    if (typeof fileConfig !== "object") fileConfig = {};

    fileConfig[fileKey] = { designSystemId, jwt };

    await Promise.all([
      figma.clientStorage.setAsync(STORAGE_KEYS.apiUrl, apiUrl),
      figma.clientStorage.setAsync(STORAGE_KEYS.fileConfig, fileConfig),
    ]);

    console.log("Saved TokenManager settings", {
      fileKey,
      apiUrl,
      designSystemId,
      fileConfig,
    });

    figma.notify("Token Manager settings saved for this Figma file ✓");
    figma.closePlugin();
  }
};

// --------------- entry point -----------------

if (figma.command === "sync") {
  syncToTokenManager();
} else if (figma.command === "settings") {
  openSettingsUI();
} else {
  // default: sync
  syncToTokenManager();
}
