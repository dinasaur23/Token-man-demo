// ---------------- shared helpers ----------------

const STORAGE_KEYS = {
  apiUrl: "tm_apiUrl", // global for all files
  fileConfig: "tm_fileConfig", // map: { [fileKey]: { designSystemId, jwt } }
};

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

function figmaVariablesToDtcg() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();

  const collectionsById = {};
  for (let i = 0; i < collections.length; i++) {
    collectionsById[collections[i].id] = collections[i];
  }

  const dtcgTokens = {};
  const globalModeKeySet = {};
  const groupModeKeySet = {};
  const variablesById = {};
  const pathMap = {};

  function toHexChannel(n) {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  }

  function colorToHex(color) {
    const r8 = color.r * 255;
    const g8 = color.g * 255;
    const b8 = color.b * 255;
    const a = color.a != null ? color.a : 1;

    let hex = "#" + toHexChannel(r8) + toHexChannel(g8) + toHexChannel(b8);
    if (a < 0.999) {
      hex += toHexChannel(a * 255); // #RRGGBBAA if alpha not 1
    }
    return hex;
  }

  function slugify(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, "-");
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

  function getModeKey(collection, modeId) {
    if (!collection || !collection.modes) return modeId;
    for (let i = 0; i < collection.modes.length; i++) {
      const m = collection.modes[i];
      if (m.modeId === modeId) {
        return slugify(m.name || modeId);
      }
    }
    return modeId;
  }

  function pickDefaultModeKey(modeMap) {
    const keys = Object.keys(modeMap);
    if (keys.length === 0) return null;
    if (keys.indexOf("light") >= 0) return "light";
    return keys[0];
  }

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];
    variablesById[variable.id] = variable;

    if (variable.resolvedType !== "COLOR") {
      continue;
    }

    let collectionName = "default";
    const collection = collectionsById[variable.variableCollectionId];
    if (collection) {
      collectionName = collection.name || collectionName;
    }
    const collectionKey = slugify(collectionName);

    const rawParts = variable.name
      .split("/")
      .map(function (p) {
        return slugify(p);
      })
      .filter(function (p) {
        return !!p;
      });

    if (rawParts.length === 0) continue;

    const tokenKey = rawParts[rawParts.length - 1];
    const groupSegments = rawParts.slice(0, -1);
    const containerPath = [collectionKey].concat(groupSegments);
    const fullPath = containerPath.concat(tokenKey).join(".");

    pathMap[variable.id] = fullPath;
  }

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];

    if (variable.resolvedType !== "COLOR") {
      continue;
    }

    let collectionName = "default";
    const collection = collectionsById[variable.variableCollectionId];
    if (collection) {
      collectionName = collection.name || collectionName;
    }
    const collectionKey = slugify(collectionName);

    const rawParts = variable.name
      .split("/")
      .map(function (p) {
        return slugify(p);
      })
      .filter(function (p) {
        return !!p;
      });

    if (rawParts.length === 0) continue;

    const tokenKey = rawParts[rawParts.length - 1];
    const groupSegments = rawParts.slice(0, -1);
    const containerPath = [collectionKey].concat(groupSegments);

    const valuesByMode = variable.valuesByMode || null;
    const modeIds = valuesByMode ? Object.keys(valuesByMode) : [];
    const hasModes = modeIds.length > 1;

    let token = null;

    if (hasModes) {
      const valueByMode = {};
      const modesExt = {};

      for (let m = 0; m < modeIds.length; m++) {
        const modeId = modeIds[m];
        const raw = valuesByMode[modeId];
        if (!raw) continue;

        const modeKey = getModeKey(collection, modeId);

        let modeValue = null;

        if (raw.type === "VARIABLE_ALIAS") {
          const target = variablesById[raw.id];
          const targetPath = target ? pathMap[target.id] : null;
          if (!target || !targetPath) {
            continue;
          }
          modeValue = "{" + targetPath + "}";
        } else {
          modeValue = colorToHex(raw);
        }

        valueByMode[modeKey] = modeValue;
        modesExt[modeKey] = modeId;
        globalModeKeySet[modeKey] = true;
        if (!groupModeKeySet[collectionKey]) {
          groupModeKeySet[collectionKey] = {};
        }
        groupModeKeySet[collectionKey][modeKey] = true;
      }

      if (Object.keys(valueByMode).length === 0) continue;

      const defaultModeKey = pickDefaultModeKey(valueByMode);

      token = {
        $type: "color",
        $value: defaultModeKey ? valueByMode[defaultModeKey] : null,
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            defaultMode: defaultModeKey,
            modes: modesExt,
            valuesByMode: valueByMode,
          },
        },
      };

      if (token.$value == null) continue;
    } else {
      let value = null;
      if (valuesByMode && modeIds.length > 0) {
        value = valuesByMode[modeIds[0]];
      } else if (variable.value != null) {
        value = variable.value;
      }

      if (value) {
        let finalValue = null;

        if (value.type === "VARIABLE_ALIAS") {
          const target = variablesById[value.id];
          const targetPath = target ? pathMap[target.id] : null;
          if (target && targetPath) {
            finalValue = "{" + targetPath + "}";
          }
        } else {
          finalValue = colorToHex(value);
        }

        if (finalValue) {
          token = {
            $type: "color",
            $value: finalValue,
            $extensions: {
              figma: {
                collection: collectionKey,
                variableId: variable.id,
              },
            },
          };
        }
      }
    }

    if (!token) continue;

    const container = ensureGroup(dtcgTokens, containerPath);
    container[tokenKey] = token;
  }

  const modeKeys = Object.keys(globalModeKeySet);
  let modifiers = {};

  if (modeKeys.length > 0) {
    const defaultMode = modeKeys.indexOf("light") >= 0 ? "light" : modeKeys[0];

    // Build groupModes from groupModeKeySet
    const groupModes = {};
    for (const groupKey in groupModeKeySet) {
      if (!Object.prototype.hasOwnProperty.call(groupModeKeySet, groupKey))
        continue;
      // keys of the per-group mode set, sorted just for stability
      groupModes[groupKey] = Object.keys(groupModeKeySet[groupKey]).sort();
    }

    modifiers = {
      mode: {
        values: modeKeys,
        default: defaultMode,
        groupModes, // <-- dynamic map; no hard-coding
      },
    };
  }

  (function debugSampleToken() {
    const collectionKeys = Object.keys(dtcgTokens);
    if (!collectionKeys.length) {
      console.log("[Plugin][DEBUG] No tokens generated");
      return;
    }
    const firstCollection = collectionKeys[0];
    const group = dtcgTokens[firstCollection];
    const tokenKeys = Object.keys(group);
    if (!tokenKeys.length) {
      console.log("[Plugin][DEBUG] First collection has no tokens");
      return;
    }
    const firstTokenKey = tokenKeys[0];
    const token = group[firstTokenKey];
    console.log(
      "[Plugin][DEBUG] Sample token:",
      firstCollection + "/" + firstTokenKey,
      "type =",
      token.$type,
      "typeof $value =",
      typeof token.$value,
      "value =",
      token.$value,
      "extensions =",
      token.$extensions
    );
  })();

  console.log("[Plugin] DTCG tokens:", dtcgTokens);
  console.log("[Plugin] DTCG modifiers:", modifiers);

  return { tokens: dtcgTokens, modifiers: modifiers };
}

async function syncToTokenManager() {
  try {
    const settings = await getSettingsForCurrentFile();
    const apiUrl = settings.apiUrl;
    const designSystemId = settings.designSystemId;
    const jwt = settings.jwt;

    if (!apiUrl || !designSystemId || !jwt) {
      figma.notify(
        "Token Manager settings missing for this Figma file. Please run Settings first."
      );
      figma.closePlugin();
      return;
    }

    const dtcg = figmaVariablesToDtcg();
    const tokens = dtcg.tokens;
    const modifiers = dtcg.modifiers || {};

    console.log("[Plugin] figmaVariablesToDtcg result:", {
      tokensSample: JSON.stringify(tokens, null, 2).slice(0, 500),
      modifiers,
    });

    const base = apiUrl.replace(/\/$/, "");
    const url =
      base +
      "/api/tokens/figma-sync?designSystemId=" +
      encodeURIComponent(designSystemId);

    const payload = { tokens: tokens };
    if (modifiers && Object.keys(modifiers).length > 0) {
      payload.modifiers = modifiers;
    }

    console.log(
      "[Plugin] Sync payload:",
      JSON.stringify(payload, null, 2).slice(0, 500)
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + jwt,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      figma.notify("Sync failed: " + response.status + " " + text);
    } else {
      const resJson = await response.json().catch(function () {
        return null;
      });
      console.log("Sync OK:", resJson || {});
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
