function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMergeDocs(target, source) {
  if (!isJsonObject(target)) return source;
  if (!isJsonObject(source)) return source;

  const tObj = target;
  const sObj = source;
  const out = { ...tObj };

  for (const key of Object.keys(sObj)) {
    const tVal = tObj[key];
    const sVal = sObj[key];

    let merged;
    if (tVal === undefined) {
      merged = sVal;
    } else if (sVal === undefined) {
      merged = tVal;
    } else {
      merged = deepMergeDocs(tVal, sVal);
    }

    out[key] = merged;
  }

  return out;
}

function mergeAllDocs(docs) {
  const values = Object.values(docs);
  if (values.length === 0) return {};

  let result = {};
  for (const doc of values) {
    result = deepMergeDocs(result, doc);
  }

  return isJsonObject(result) ? result : {};
}

function isResolverDocument(value) {
  if (!isJsonObject(value)) return false;
  return Array.isArray(value.resolutionOrder);
}

function isSourceRef(source) {
  return isJsonObject(source) && typeof source.$ref === "string";
}

function loadTokenSource(source, docs) {
  if (!isSourceRef(source)) {
    return source;
  }

  const ref = source.$ref;
  const [fileName] = ref.split("#");

  if (ref.startsWith("#/")) {
    throw new Error(
      `Internal JSON Pointer "${ref}" is not allowed for token sources.`,
    );
  }

  const doc = docs[fileName];

  if (!doc) {
    throw new Error(
      `No uploaded document found for $ref "${ref}". Expected key "${fileName}".`,
    );
  }
  if (!isJsonObject(doc)) {
    throw new Error(`Document "${fileName}" is not a JSON object.`);
  }

  return doc;
}

function resolveSet(set, docs) {
  let result = {};

  for (const src of set.sources) {
    const tokensObject = loadTokenSource(src, docs);
    result = deepMergeDocs(result, tokensObject);
  }

  return isJsonObject(result) ? result : {};
}

function resolveModifier(name, modifier, docs, input) {
  const value = input[name] ?? modifier.default;
  if (!value) {
    throw new Error(
      `Missing value for modifier "${name}" and no default defined.`,
    );
  }

  const contextSources = modifier.contexts[value];
  if (!contextSources) {
    const allowed = Object.keys(modifier.contexts).join(", ");
    throw new Error(
      `Invalid value "${value}" for modifier "${name}". Allowed values: ${allowed}.`,
    );
  }

  let result = {};

  for (const src of contextSources) {
    const tokensObject = loadTokenSource(src, docs);
    result = deepMergeDocs(result, tokensObject);
  }

  return isJsonObject(result) ? result : {};
}

// --- Figma mode handling: applySelectedContextsToDoc -------------------------
function pickSelectedModeForToken(fig, input) {
  if (!fig || typeof fig !== "object") return null;
  const valuesByMode = fig.valuesByMode;
  if (!valuesByMode || typeof valuesByMode !== "object") return null;

  if (typeof input.mode === "string" && input.mode in valuesByMode)
    return input.mode;

  for (const [k, v] of Object.entries(input)) {
    if (k === "scopedModifiers") continue;
    if (typeof v === "string" && v in valuesByMode) return v;
  }
  return null;
}
function applySelectedContextsToDoc(doc, input) {
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);

    if (isJsonObject(value)) {
      const obj = value;
      const out = {};

      for (const [key, v] of Object.entries(obj)) out[key] = visit(v);

      if (obj.$extensions && isJsonObject(obj.$extensions)) {
        const fig = obj.$extensions.figma;
        const selectedMode = pickSelectedModeForToken(fig, input);

        if (selectedMode && fig && typeof fig === "object") {
          const valuesByMode = fig.valuesByMode;
          if (valuesByMode && typeof valuesByMode === "object") {
            const defaultMode = fig.defaultMode;
            const keys = Object.keys(valuesByMode);

            const chosen =
              valuesByMode[selectedMode] ??
              (defaultMode ? valuesByMode[defaultMode] : undefined) ??
              (keys.length ? valuesByMode[keys[0]] : undefined);

            // Apply the mode value without inventing or corrupting `$type`.
            // Do not special-case legacy non-DTCG types (string/boolean).
            if (chosen !== undefined) {
              out.$value = chosen;
            }
          }
        }
      }

      return out;
    }

    return value;
  }

  return visit(doc);
}

function resolveWithResolverDocument(resolver, docs, input = {}) {
  let result = {};

  for (const entry of resolver.resolutionOrder) {
    const ref = entry.$ref;

    if (ref.startsWith("#/sets/")) {
      const setName = ref.slice("#/sets/".length);
      const set = resolver.sets?.[setName];
      if (!set) throw new Error(`Unknown set "${setName}" in resolutionOrder.`);
      const merged = resolveSet(set, docs);
      result = deepMergeDocs(result, merged);
    } else if (ref.startsWith("#/modifiers/")) {
      const modifierName = ref.slice("#/modifiers/".length);
      const modifier = resolver.modifiers?.[modifierName];
      if (!modifier)
        throw new Error(
          `Unknown modifier "${modifierName}" in resolutionOrder.`,
        );
      const merged = resolveModifier(modifierName, modifier, docs, input);
      result = deepMergeDocs(result, merged);
    } else {
      const pseudoSet = { sources: [{ $ref: ref }] };
      const merged = resolveSet(pseudoSet, docs);
      result = deepMergeDocs(result, merged);
    }
  }

  return isJsonObject(result) ? result : {};
}

export function resolveUploadedDocuments(docs, input = {}) {
  const resolverEntry = Object.entries(docs).find(([, value]) =>
    isResolverDocument(value),
  );

  if (!resolverEntry) {
    const merged = mergeAllDocs(docs);
    return applySelectedContextsToDoc(merged, input);
  }

  const resolverDoc = resolverEntry[1];
  const resolved = resolveWithResolverDocument(resolverDoc, docs, input);

  return applySelectedContextsToDoc(resolved, input);
}
