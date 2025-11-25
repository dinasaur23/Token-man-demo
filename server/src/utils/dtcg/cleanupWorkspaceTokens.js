export function pruneDeletedTokens(root, deletedPaths = []) {
  if (!root || typeof root !== "object") return;

  const deletedSet = new Set(deletedPaths);

  function visit(node, prefix) {
    if (!node || typeof node !== "object") return;

    const isToken =
      Object.prototype.hasOwnProperty.call(node, "$value") ||
      Object.prototype.hasOwnProperty.call(node, "$type");

    if (isToken) {
      const fullPath = prefix.join(".");
      if (deletedSet.has(fullPath)) {
        return "__DELETE__";
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      const result = visit(value, prefix.concat(key));
      if (result === "__DELETE__") {
        delete node[key];
      }
    }
  }

  visit(root, []);
}

export function buildCleanOverrides(root, overrides = {}) {
  const validPaths = collectTokenPaths(root);
  const cleaned = {};

  for (const [path, value] of Object.entries(overrides)) {
    if (!validPaths.has(path)) continue;
    if (path.includes("-copy-") || path.includes("-new-")) continue;
    cleaned[path] = value;
  }

  return cleaned;
}

function collectTokenPaths(node, prefix = [], out = new Set()) {
  if (!node || typeof node !== "object") return out;

  const isToken =
    Object.prototype.hasOwnProperty.call(node, "$value") ||
    Object.prototype.hasOwnProperty.call(node, "$type");

  if (isToken) {
    out.add(prefix.join("."));
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "$value" || key === "$type") continue;
    collectTokenPaths(value, prefix.concat(key), out);
  }

  return out;
}
