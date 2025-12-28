export function applyOverridesToTokens(root, overrides = {}) {
  if (!root || typeof root !== "object") return;

  for (const [fullKey, newValue] of Object.entries(overrides)) {
    if (typeof fullKey !== "string" || !fullKey.trim()) continue;

    // ✅ DO NOT apply mode-scoped overrides globally
    if (fullKey.includes("::")) continue;

    const fullPath = fullKey; // base-only
    if (!fullPath.includes(".")) continue;

    const segments = fullPath.split(".");
    let node = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (!node[key] || typeof node[key] !== "object") node[key] = {};
      node = node[key];
    }

    const leaf = segments[segments.length - 1];
    const existing = node[leaf];

    if (existing && typeof existing === "object") {
      node[leaf] = { ...existing, $value: newValue };
    } else {
      node[leaf] = { $value: newValue };
    }
  }
}
