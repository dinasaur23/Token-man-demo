export function mergeWorkspaceFiles(files) {
  const root = {};
  if (!Array.isArray(files)) return root;

  for (const f of files) {
    if (f && f.content && typeof f.content === "object") {
      Object.assign(root, f.content);
    }
  }
  return root;
}
