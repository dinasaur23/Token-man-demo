// client/src/utils/dtcg/expandNameOverrides.ts

function buildOverrideRules(overrides: Record<string, string>) {
  return Object.entries(overrides ?? {})
    .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim().length > 0)
    .sort((a, b) => b[0].split('.').length - a[0].split('.').length)
}

function mapPathSegmentsByOverrides(
  pathStr: string,
  overrides: Record<string, string>,
  direction: 'toDisplay' | 'toReal',
): string {
  if (!pathStr || !pathStr.includes('.')) return pathStr

  const seg = pathStr.split('.')
  const rules = buildOverrideRules(overrides)

  for (const [groupId, newLabelRaw] of rules) {
    const newLabel = String(newLabelRaw).trim()
    if (!newLabel) continue

    const gidSeg = groupId.split('.')
    const parentSeg = gidSeg.slice(0, -1)
    const oldKey = gidSeg[gidSeg.length - 1]
    const idx = parentSeg.length

    let parentMatches = true
    for (let i = 0; i < parentSeg.length; i++) {
      if (seg[i] !== parentSeg[i]) {
        parentMatches = false
        break
      }
    }
    if (!parentMatches) continue
    if (idx >= seg.length) continue

    if (direction === 'toDisplay') {
      if (seg[idx] === oldKey) seg[idx] = newLabel
    } else {
      if (seg[idx] === newLabel) seg[idx] = oldKey
    }
  }

  return seg.join('.')
}

export function expandNameOverrides(
  nameOverrides: Record<string, string> = {},
  groupNameOverrides: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [oldPath, newPathRaw] of Object.entries(nameOverrides ?? {})) {
    if (typeof oldPath !== 'string' || typeof newPathRaw !== 'string') continue

    const newPath = newPathRaw.trim()
    if (!newPath) continue

    // if UI stored only "1000test", expand to full path using same parent
    if (!newPath.includes('.')) {
      const parent = oldPath.split('.').slice(0, -1).join('.')
      out[oldPath] = parent ? `${parent}.${newPath}` : newPath
    } else {
      out[oldPath] = newPath
    }
  }

  // apply groupNameOverrides to both sides so mapping matches the display tree
  if (groupNameOverrides && typeof groupNameOverrides === 'object') {
    const normalized: Record<string, string> = {}
    for (const [a, b] of Object.entries(out)) {
      const bb = mapPathSegmentsByOverrides(b, groupNameOverrides, 'toDisplay')
      normalized[a] = bb
    }
    return normalized
  }

  return out
}
