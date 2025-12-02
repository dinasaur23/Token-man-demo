const API_URL = "http://localhost:8081";

const API_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MTM0ZjA1M2M4ZDBlMzQ1OGMxMDFhZSIsImlhdCI6MTc2NDY4NTk4OCwiZXhwIjoxNzY0OTQ1MTg4fQ.mEDxSgEXDgVCMaDx67z8f0w6RcpFqqKkoJbn_jj_I54";

function figmaVariablesToDtcg() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();

  const dtcgTokens = {};

  // tiny helper to go 0–255 → 2-digit hex
  function toHexChannel(n) {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  }

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];

    // ----- find collection name ------------------------------------------------
    let collectionName = "default";
    for (let j = 0; j < collections.length; j++) {
      if (collections[j].id === variable.variableCollectionId) {
        collectionName = collections[j].name;
        break;
      }
    }

    // make names safe (no spaces)
    collectionName = collectionName.replace(/\s+/g, "-");
    const nameSegments = variable.name
      .split("/") // ["blue", "50"] etc.
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+/g, "-"));

    const tokenName = `${collectionName}.${nameSegments.join(".")}`;

    // ----- pick first mode value ----------------------------------------------
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
      const color = value; // { r, g, b, a } in 0–1

      const r8 = color.r * 255;
      const g8 = color.g * 255;
      const b8 = color.b * 255;
      const a = color.a != null ? color.a : 1;

      // #RRGGBB
      let hex = "#" + toHexChannel(r8) + toHexChannel(g8) + toHexChannel(b8);

      // if alpha is not 1, add AA → #RRGGBBAA
      if (a < 0.999) {
        const a8 = a * 255;
        hex += toHexChannel(a8);
      }

      token = {
        $type: "color",
        $value: hex,
        $extensions: {
          figma: {
            collection: collectionName,
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
            collection: collectionName,
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
            collection: collectionName,
            variableId: variable.id,
            modeId: modeId,
          },
        },
      };
    }

    dtcgTokens[tokenName] = token;
  }

  return dtcgTokens;
}

async function syncToTokenManager() {
  try {
    var tokens = figmaVariablesToDtcg();

    var response = await fetch(API_URL + "/api/tokens/figma-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + API_TOKEN,
      },
      body: JSON.stringify({ tokens: tokens }),
    });

    if (!response.ok) {
      var text = await response.text();
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

syncToTokenManager();
