// ---------------- shared helpers ----------------

const STORAGE_KEYS = {
  apiUrl: "tm_apiUrl",
  designSystemId: "tm_designSystemId",
  jwt: "tm_jwt",
};

async function getSettings() {
  const [apiUrl, designSystemId, jwt] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl),
    figma.clientStorage.getAsync(STORAGE_KEYS.designSystemId),
    figma.clientStorage.getAsync(STORAGE_KEYS.jwt),
  ]);

  return { apiUrl, designSystemId, jwt };
}

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

    // ----- collection name (top-level group) -----
    let collectionName = "default";
    for (let j = 0; j < collections.length; j++) {
      if (collections[j].id === variable.variableCollectionId) {
        collectionName = collections[j].name;
        break;
      }
    }
    const collectionKey = slugify(collectionName); // e.g. "Collection-1"

    // ----- variable name → group path + token name -----
    // e.g. "blue/50" → groups ["blue"], tokenKey "50"
    const rawParts = variable.name
      .split("/")
      .map((p) => slugify(p))
      .filter(Boolean);
    if (rawParts.length === 0) continue;

    const tokenKey = rawParts[rawParts.length - 1]; // "50"
    const groupSegments = rawParts.slice(0, -1); // ["blue"]
    const containerPath = [collectionKey, ...groupSegments];

    // ----- pick value (mode) -----
    const modeIds = variable.valuesByMode
      ? Object.keys(variable.valuesByMode)
      : [];
    const modeId = modeIds.length > 0 ? modeIds[0] : null;

    let value;
    if (variable.valuesByMode && modeId) {
      value = variable.valuesByMode[modeId];
    } else if (variable.value !== undefined && variable.value !== null) {
      value = variable.value;
    } else {
      value = null;
    }

    let token;

    if (variable.resolvedType === "COLOR" && value) {
      const color = value; // { r,g,b,a } in 0–1
      const r8 = color.r * 255;
      const g8 = color.g * 255;
      const b8 = color.b * 255;
      const a = color.a != null ? color.a : 1;

      // #RRGGBB or #RRGGBBAA
      let hex = "#" + toHexChannel(r8) + toHexChannel(g8) + toHexChannel(b8);
      if (a < 0.999) {
        hex += toHexChannel(a * 255);
      }

      token = {
        $type: "color",
        $value: hex, // Token Manager converts hex → sRGB
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

    // ----- write into nested DTCG object -----
    const container = ensureGroup(dtcgTokens, containerPath);
    container[tokenKey] = token; // e.g. dtcgTokens.Collection-1.blue["50"]
  }

  return dtcgTokens;
}

async function syncToTokenManager() {
  try {
    const { apiUrl, designSystemId, jwt } = await getSettings();

    if (!apiUrl || !designSystemId || !jwt) {
      figma.notify(
        "Token Manager settings missing. Please open the settings command first."
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
      figma.notify("Tokens synced to Token Manager ✓");
    }
  } catch (err) {
    figma.notify("Error: " + err.message);
  } finally {
    figma.closePlugin();
  }
}

// --------------- SETTINGS UI -----------------

async function openSettingsUI() {
  const { apiUrl, designSystemId, jwt } = await getSettings();

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
    // msg.settings comes from UI
    await figma.clientStorage.setAsync("tokenManagerSettings", msg.settings);
    figma.notify("Settings saved ✓");
    figma.closePlugin();
  }
};

figma.ui &&
  figma.ui.onmessage &&
  (figma.ui.onmessage = async (msg) => {
    if (msg.type === "save-settings") {
      await figma.clientStorage.setAsync(
        STORAGE_KEYS.apiUrl,
        msg.apiUrl.trim()
      );
      await figma.clientStorage.setAsync(
        STORAGE_KEYS.designSystemId,
        msg.designSystemId.trim()
      );
      await figma.clientStorage.setAsync(STORAGE_KEYS.jwt, msg.jwt.trim());

      figma.notify("Token Manager settings saved");
      figma.closePlugin();
    }
  });

if (figma.command === "sync") {
  syncToTokenManager();
} else if (figma.command === "settings") {
  openSettingsUI();
} else {
  syncToTokenManager();
}
