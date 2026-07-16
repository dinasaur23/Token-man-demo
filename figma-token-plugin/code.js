const STORAGE_KEYS = {
  apiUrl: "tm_apiUrl",
  fileConfig: "tm_fileConfig",
  jwt: "tm_jwt",
};

const LOCAL_API_URL = "http://localhost:8081";
const PRODUCTION_API_URL = "https://token-manager-ecru.vercel.app";
const DEFAULT_API_URL = PRODUCTION_API_URL;

function getCurrentFileKey() {
  let key = figma.root.getPluginData("tm_fileKey");
  if (typeof key === "string" && key.length > 0) {
    return key;
  }
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

  const [apiUrl, fileConfig, globalJwt] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl),
    figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig),
    figma.clientStorage.getAsync(STORAGE_KEYS.jwt),
  ]);

  const config =
    fileConfig && typeof fileConfig === "object" ? fileConfig[fileKey] : null;

  const designSystemId = config ? config.designSystemId : null;
  const jwt = globalJwt || (config ? config.jwt : null);

  console.log("TokenManager settings for file (getSettingsForCurrentFile)", {
    fileKey,
    apiUrl,
    designSystemId,
    hasJwt: !!jwt,
    rawFileConfig: fileConfig,
  });

  return {
    apiUrl: (apiUrl || DEFAULT_API_URL).replace(/\/$/, ""),
    designSystemId,
    jwt,
  };
}

function figmaVariablesToDtcg() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();
  const rawVariables = figma.variables.getLocalVariables().map((v) => ({
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode,
    variableCollectionId: v.variableCollectionId,
  }));

  console.log("RAW VARIABLES (PLAIN):", JSON.stringify(rawVariables, null, 2));

  const collectionsById = {};
  for (let i = 0; i < collections.length; i++) {
    collectionsById[collections[i].id] = collections[i];
  }

  const dtcgTokens = {};
  const globalModeKeySet = {};
  const groupModeKeySet = {};
  const variablesById = {};
  const pathMap = {};
  let orderCounter = 0;

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function colorToDtcgColor(color) {
    const r = clamp01(color.r);
    const g = clamp01(color.g);
    const b = clamp01(color.b);
    const a = color.a != null ? clamp01(color.a) : 1;

    const round3 = (n) => Math.round(n * 1000) / 1000;

    const out = {
      colorSpace: "srgb",
      components: [round3(r), round3(g), round3(b)],
    };

    if (a < 0.999) out.alpha = round3(a);

    return out;
  }

  function colorToHex(color) {
    const r = clamp01(color.r);
    const g = clamp01(color.g);
    const b = clamp01(color.b);
    const a = color.a != null ? clamp01(color.a) : 1;

    let hex =
      "#" +
      toHexChannel(r * 255) +
      toHexChannel(g * 255) +
      toHexChannel(b * 255);

    if (a < 0.999) {
      hex += toHexChannel(a * 255);
    }

    return hex;
  }

  function toHexChannel(n) {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  }
  function colorToDtcgColorWithHex(color) {
    const r = clamp01(color.r);
    const g = clamp01(color.g);
    const b = clamp01(color.b);
    const a = color.a != null ? clamp01(color.a) : 1;

    const round3 = (n) => Math.round(n * 1000) / 1000;

    return {
      colorSpace: "srgb",
      components: [round3(r), round3(g), round3(b)],
      alpha: round3(a),
      hex: colorToHex({ r, g, b, a }),
    };
  }

  function slugify(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
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

  function isSupportedResolvedType(t) {
    return t === "COLOR";
  }

  function resolvedTypeToDtcgType(t) {
    if (t === "COLOR") return "color";
    if (t === "FLOAT") return "number";
    if (t === "STRING") return "string";
    if (t === "BOOLEAN") return "boolean";
    return null;
  }

  function rawValueToDtcgValue(resolvedType, raw) {
    if (raw == null) return null;

    if (resolvedType === "COLOR") {
      console.log("[color-raw]", raw);
      return colorToDtcgColorWithHex(raw);
    }

    if (resolvedType === "FLOAT") return raw;
    if (resolvedType === "STRING") return raw;
    if (resolvedType === "BOOLEAN") return raw;

    return null;
  }

  function buildOrderedVariables(collections, variables, collectionsById) {
    const varsById = {};
    for (let i = 0; i < variables.length; i++)
      varsById[variables[i].id] = variables[i];

    const seen = {};
    const ordered = [];

    for (let c = 0; c < collections.length; c++) {
      const col = collections[c];
      const ids = Array.isArray(col.variableIds) ? col.variableIds : [];

      for (let j = 0; j < ids.length; j++) {
        const v = varsById[ids[j]];
        if (v && !seen[v.id]) {
          seen[v.id] = true;
          ordered.push(v);
        }
      }
    }

    for (let i = 0; i < variables.length; i++) {
      const v = variables[i];
      if (!seen[v.id]) ordered.push(v);
    }

    return ordered;
  }
  const orderedVariables = buildOrderedVariables(collections, variables);

  for (let i = 0; i < orderedVariables.length; i++) {
    const variable = orderedVariables[i];
    variablesById[variable.id] = variable;

    if (!isSupportedResolvedType(variable.resolvedType)) continue;

    let collectionName = "default";
    const collection = collectionsById[variable.variableCollectionId];
    if (collection) collectionName = collection.name || collectionName;
    const collectionKey = slugify(collectionName);

    const rawParts = variable.name
      .split("/")
      .map((p) => slugify(p))
      .filter(Boolean);

    if (!rawParts.length) continue;

    const tokenKey = rawParts[rawParts.length - 1];
    const groupSegments = rawParts.slice(0, -1);
    const containerPath = [collectionKey].concat(groupSegments);
    const fullPath = containerPath.concat(tokenKey).join(".");

    pathMap[variable.id] = fullPath;
  }

  for (let i = 0; i < orderedVariables.length; i++) {
    const variable = orderedVariables[i];

    if (!isSupportedResolvedType(variable.resolvedType)) continue;

    const dtcgType = resolvedTypeToDtcgType(variable.resolvedType);
    if (!dtcgType) continue;

    let collectionName = "default";
    const collection = collectionsById[variable.variableCollectionId];
    if (collection) collectionName = collection.name || collectionName;
    const collectionKey = slugify(collectionName);

    const rawParts = variable.name
      .split("/")
      .map((p) => slugify(p))
      .filter(Boolean);

    if (!rawParts.length) continue;

    const tokenKey = rawParts[rawParts.length - 1];
    const groupSegments = rawParts.slice(0, -1);
    const containerPath = [collectionKey].concat(groupSegments);

    const valuesByMode = variable.valuesByMode;
    const modeIds =
      valuesByMode && typeof valuesByMode === "object"
        ? Object.keys(valuesByMode)
        : [];
    const collectionModeCount =
      collection &&
      collection.modes &&
      typeof collection.modes.length === "number"
        ? collection.modes.length
        : 0;
    const hasModes = collectionModeCount > 1;

    let token = null;

    if (hasModes) {
      const valueByMode = {};
      const modesExt = {};

      const modeList =
        collection && Array.isArray(collection.modes) ? collection.modes : [];

      for (let m = 0; m < modeList.length; m++) {
        const modeId = modeList[m].modeId;

        const raw =
          valuesByMode && typeof valuesByMode === "object"
            ? valuesByMode[modeId]
            : undefined;

        if (raw === undefined || raw === null) continue;

        const modeKey = getModeKey(collection, modeId);

        let modeValue = null;
        if (raw.type === "VARIABLE_ALIAS") {
          const target = variablesById[raw.id];
          if (target && target.resolvedType !== "COLOR") continue;
          const targetPath = target ? pathMap[target.id] : null;
          if (!targetPath) continue;
          modeValue = "{" + targetPath + "}";
        } else {
          modeValue = rawValueToDtcgValue(variable.resolvedType, raw);
        }

        if (modeValue == null) continue;

        valueByMode[modeKey] = modeValue;
        modesExt[modeKey] = modeId;

        globalModeKeySet[modeKey] = true;
        if (!groupModeKeySet[collectionKey])
          groupModeKeySet[collectionKey] = {};
        groupModeKeySet[collectionKey][modeKey] = true;
      }

      const defaultModeKey = pickDefaultModeKey(valueByMode);
      if (!defaultModeKey) continue;

      token = {
        $type: dtcgType,
        $value: valueByMode[defaultModeKey],
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            defaultMode: defaultModeKey,
            modes: modesExt,
            valuesByMode: valueByMode,
            order: orderCounter++,
          },
        },
      };
      console.log("[Plugin][mode-debug]", {
        name: variable.name,
        dtcgPath: containerPath.concat(tokenKey).join("."),
        defaultModeKey,
        valuesByModeKeys: Object.keys(
          token.$extensions.figma.valuesByMode || {},
        ),
        sampleChosenType: typeof (token.$extensions.figma.valuesByMode || {})[
          defaultModeKey
        ],
        sampleChosenValue: (token.$extensions.figma.valuesByMode || {})[
          defaultModeKey
        ],
      });
    } else {
      let raw = null;
      if (valuesByMode && modeIds.length) raw = valuesByMode[modeIds[0]];
      else raw = variable.value;

      if (raw === undefined || raw === null) continue;

      let finalValue = null;
      if (raw.type === "VARIABLE_ALIAS") {
        const target = variablesById[raw.id];
        const targetPath = target ? pathMap[target.id] : null;
        if (!targetPath) continue;
        finalValue = "{" + targetPath + "}";
      } else {
        finalValue = rawValueToDtcgValue(variable.resolvedType, raw);
      }

      if (finalValue == null) continue;

      token = {
        $type: dtcgType,
        $value: finalValue,
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            order: orderCounter++,
          },
        },
      };
    }

    const container = ensureGroup(dtcgTokens, containerPath);
    container[tokenKey] = token;
  }

  const modeKeys = Object.keys(globalModeKeySet);
  let modifiers = {};

  if (modeKeys.length) {
    const defaultMode = modeKeys.includes("light") ? "light" : modeKeys[0];
    const groupModes = {};

    for (const k in groupModeKeySet) {
      groupModes[k] = Object.keys(groupModeKeySet[k]).sort();
    }

    modifiers = {
      mode: {
        values: modeKeys,
        default: defaultMode,
        groupModes,
      },
    };
  }

  console.log("[Plugin] DTCG tokens:", dtcgTokens);
  console.log("[Plugin] DTCG modifiers:", modifiers);

  return { tokens: dtcgTokens, modifiers };
}

async function syncToTokenManager() {
  try {
    const settings = await getSettingsForCurrentFile();
    console.log("[Sync] fileKey =", getCurrentFileKey());
    console.log("[Sync] settings =", settings);

    const apiUrl = settings.apiUrl;
    const designSystemId = settings.designSystemId;
    const jwt = settings.jwt;

    if (!apiUrl || !designSystemId || !jwt) {
      figma.notify(
        "Token Manager settings missing for this Figma file. Please run Settings first.",
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
      JSON.stringify(payload, null, 2).slice(0, 500),
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

async function openSettingsUI() {
  const { apiUrl, designSystemId, jwt } = await getSettingsForCurrentFile();

  figma.showUI(__html__, { width: 420, height: 320 });

  figma.ui.postMessage({
    type: "init-settings",
    apiUrl: apiUrl || DEFAULT_API_URL,
    designSystemId: designSystemId || "",
    hasJwt: !!jwt,
  });

  const settings = await getSettingsForCurrentFile();
  if (settings.jwt) {
    try {
      const base = settings.apiUrl.replace(/\/$/, "");
      const res = await fetch(base + "/api/design-systems", {
        headers: { Authorization: "Bearer " + settings.jwt },
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        figma.ui.postMessage({
          type: "design-systems",
          items: Array.isArray(data)
            ? data
            : data && data.items
              ? data.items
              : [],
        });
      } else {
        figma.ui.postMessage({
          type: "design-systems-error",
          message:
            (data && (data.message || data.error)) ||
            "Failed to load design systems.",
        });
      }
    } catch (e) {
      figma.ui.postMessage({
        type: "design-systems-error",
        message: e && e.message ? e.message : String(e),
      });
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "login-success") {
    const jwt = (msg.jwt || "").trim();
    if (!jwt) {
      figma.notify("Login failed (empty token).");
      return;
    }

    await figma.clientStorage.setAsync(STORAGE_KEYS.jwt, jwt);

    const apiUrl =
      (await figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl)) ||
      DEFAULT_API_URL;
    const base = String(apiUrl).replace(/\/$/, "");
    const res = await fetch(base + "/api/design-systems", {
      headers: { Authorization: "Bearer " + jwt },
    });
    const data = await res.json().catch(() => null);

    figma.ui.postMessage({
      type: "design-systems",
      items: Array.isArray(data) ? data : data && data.items ? data.items : [],
    });

    figma.notify("Logged in ✓");
    return;
  }

  if (msg.type === "save-settings") {
    const fileKey = getCurrentFileKey();

    const apiUrl =
      (msg.apiUrl || "").trim().replace(/\/$/, "") || DEFAULT_API_URL;

    const designSystemId = (msg.designSystemId || "").trim();

    if (!designSystemId) {
      figma.notify("Please select a Design System.");
      return;
    }

    let fileConfig =
      (await figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig)) || {};

    if (typeof fileConfig !== "object") fileConfig = {};

    fileConfig[fileKey] = { designSystemId };

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

if (figma.command === "sync") {
  syncToTokenManager();
} else if (figma.command === "settings") {
  openSettingsUI();
} else {
  syncToTokenManager();
}
