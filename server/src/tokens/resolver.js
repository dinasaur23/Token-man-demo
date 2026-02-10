import fs from "fs/promises";
import path from "path";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMergeDocs(target, source) {
  if (!isObject(target)) return source;
  if (!isObject(source)) return source;

  const out = { ...target };

  for (const key of Object.keys(source)) {
    const tVal = target[key];
    const sVal = source[key];

    if (tVal === undefined) {
      out[key] = sVal;
    } else {
      out[key] = deepMergeDocs(tVal, sVal);
    }
  }

  return out;
}

async function loadJsonFile(filePath, cache) {
  if (cache[filePath]) return cache[filePath];

  const text = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(text);
  cache[filePath] = json;
  return json;
}

async function loadTokenSource(source, resolverDir, cache) {
  if (!isObject(source) || !("$ref" in source)) {
    return source;
  }

  const ref = source.$ref;
  const [fileName] = ref.split("#");

  if (ref.startsWith("#/")) {
    throw new Error(
      `Internal JSON Pointer "${ref}" is not allowed for token sources.`,
    );
  }

  const fullPath = path.resolve(resolverDir, fileName);
  const doc = await loadJsonFile(fullPath, cache);

  if (!isObject(doc)) {
    throw new Error(`Document "${fileName}" is not a JSON object.`);
  }

  return doc;
}

async function resolveSet(set, resolverDir, cache) {
  let result = {};

  for (const src of set.sources) {
    const tokensObject = await loadTokenSource(src, resolverDir, cache);
    result = deepMergeDocs(result, tokensObject);
  }

  return result;
}

async function resolveModifier(name, modifier, resolverDir, cache, input) {
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
    const tokensObject = await loadTokenSource(src, resolverDir, cache);
    result = deepMergeDocs(result, tokensObject);
  }

  return result;
}

export async function resolveTokensFromResolverFile(
  resolverFilePath,
  input = {},
) {
  const resolverDir = path.dirname(resolverFilePath);
  const cache = {};

  const resolverText = await fs.readFile(resolverFilePath, "utf8");
  const resolver = JSON.parse(resolverText);

  if (!Array.isArray(resolver.resolutionOrder)) {
    throw new Error('Resolver document must have a "resolutionOrder" array.');
  }

  const sets = resolver.sets ?? {};
  const modifiers = resolver.modifiers ?? {};

  let result = {};

  for (const entry of resolver.resolutionOrder) {
    const ref = entry.$ref;

    if (ref.startsWith("#/sets/")) {
      const setName = ref.slice("#/sets/".length);
      const set = sets[setName];
      if (!set) throw new Error(`Unknown set "${setName}" in resolutionOrder.`);

      const merged = await resolveSet(set, resolverDir, cache);
      result = deepMergeDocs(result, merged);
    } else if (ref.startsWith("#/modifiers/")) {
      const modifierName = ref.slice("#/modifiers/".length);
      const modifier = modifiers[modifierName];
      if (!modifier)
        throw new Error(
          `Unknown modifier "${modifierName}" in resolutionOrder.`,
        );

      const merged = await resolveModifier(
        modifierName,
        modifier,
        resolverDir,
        cache,
        input,
      );
      result = deepMergeDocs(result, merged);
    } else {
      const pseudoSet = { sources: [{ $ref: ref }] };
      const merged = await resolveSet(pseudoSet, resolverDir, cache);
      result = deepMergeDocs(result, merged);
    }
  }

  return result;
}
