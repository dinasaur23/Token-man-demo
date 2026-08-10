/**
 * Workspace-level token-set file naming (not DTCG source-document concerns).
 */

export type NormalizeTokenSetFileNameResult =
  | { ok: true; fileName: string }
  | { ok: false; error: string }

/** Trim, reject empty, append `.json` when missing. */
export function normalizeTokenSetFileName(rawName: string): NormalizeTokenSetFileNameResult {
  const trimmed = rawName.trim()
  if (!trimmed) {
    return { ok: false, error: 'Token set name is required.' }
  }

  const fileName = trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`
  return { ok: true, fileName }
}

export function tokenSetFileNameConflict(
  fileName: string,
  existingNames: readonly string[],
): string | null {
  if (existingNames.includes(fileName)) {
    return `A token set named "${fileName}" already exists in this workspace.`
  }
  return null
}

/** Canonical empty DTCG source document for app-created token sets. */
export function createEmptyTokenSetDocument(): Record<string, never> {
  return {}
}
