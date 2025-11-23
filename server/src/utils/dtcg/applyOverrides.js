export function applyOverridesToTokens(root, overrides = {}) {
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
