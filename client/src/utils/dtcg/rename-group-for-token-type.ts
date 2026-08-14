/**
 * Type-scoped group rename / move for DTCG source documents.
 *
 * Exclusive groups (only the current token type) rename the physical key in place.
 * Mixed groups split: current-type nodes move to the new key; other types stay.
 */

import { resolveEffectiveTypeAtPath } from './effective-type'
import { isJsonRecord, type JsonRecord } from './json-path-helpers'
import type { JsonValue } from './resolver'
import type { ApplicationSupportedTokenType } from './token-type-manifest'

export type RenameGroupForTokenTypeResult =
  | {
      ok: true
      mode: 'noop' | 'exclusive' | 'split'
      oldGroupPath: string[]
      newGroupPath: string[]
      /** Absolute token leaf paths that moved with the current-type slice. */
      movedLeafPaths: Array<{ from: string; to: string }>
    }
  | {
      ok: false
      reason: string
    }

function isTokenLeafNode(node: JsonRecord): boolean {
  return Object.prototype.hasOwnProperty.call(node, '$value')
}

function childKeys(node: JsonRecord): string[] {
  return Object.keys(node).filter((key) => !key.startsWith('$'))
}

function readLocalType(node: JsonRecord): string | undefined {
  return typeof node.$type === 'string' ? node.$type : undefined
}

function hasTokenLeafInSubtree(node: JsonRecord): boolean {
  if (isTokenLeafNode(node)) return true
  for (const key of childKeys(node)) {
    const child = node[key]
    if (isJsonRecord(child) && hasTokenLeafInSubtree(child)) return true
  }
  return false
}

function effectiveTypeAt(
  root: JsonRecord,
  absolutePath: string[],
  node: JsonRecord,
  inheritedType: string | undefined,
): string | undefined {
  if (isTokenLeafNode(node)) {
    const resolved = resolveEffectiveTypeAtPath(root, absolutePath)
    if (resolved.ok) return resolved.type
    return readLocalType(node) ?? inheritedType
  }
  return readLocalType(node) ?? inheritedType
}

type SliceResult = {
  extracted: JsonRecord | null
  remainder: JsonRecord | null
  movedLeafPaths: string[]
}

/**
 * Recursively split `node` into a current-type slice and a leftover slice.
 * Leaves and exclusive subgroups are moved by reference (never duplicated).
 * Mixed-split group metadata: non-$type `$` props stay on remainder only.
 */
function splitNodeForTokenType(
  root: JsonRecord,
  node: JsonRecord,
  absolutePath: string[],
  inheritedType: string | undefined,
  tokenType: string,
): SliceResult {
  if (isTokenLeafNode(node)) {
    const type = effectiveTypeAt(root, absolutePath, node, inheritedType)
    if (type === tokenType) {
      return { extracted: node, remainder: null, movedLeafPaths: [absolutePath.join('.')] }
    }
    return { extracted: null, remainder: node, movedLeafPaths: [] }
  }

  const localType = readLocalType(node)
  const effectiveGroupType = localType ?? inheritedType
  const keys = childKeys(node)

  // Typed empty group of the current type — move whole node (metadata included).
  if (keys.length === 0) {
    if (!hasTokenLeafInSubtree(node) && effectiveGroupType === tokenType) {
      return { extracted: node, remainder: null, movedLeafPaths: [] }
    }
    return { extracted: null, remainder: node, movedLeafPaths: [] }
  }

  const extractedChildren: JsonRecord = {}
  const remainderChildren: JsonRecord = {}
  const movedLeafPaths: string[] = []
  let extractedCount = 0
  let remainderCount = 0

  for (const key of keys) {
    const child = node[key]
    if (!isJsonRecord(child)) {
      remainderChildren[key] = child
      remainderCount += 1
      continue
    }

    const childPath = [...absolutePath, key]
    const slice = splitNodeForTokenType(
      root,
      child,
      childPath,
      effectiveGroupType,
      tokenType,
    )

    if (slice.extracted) {
      extractedChildren[key] = slice.extracted
      extractedCount += 1
    }
    if (slice.remainder) {
      remainderChildren[key] = slice.remainder
      remainderCount += 1
    }
    movedLeafPaths.push(...slice.movedLeafPaths)
  }

  // Exclusive: every child went to extracted — move the original node as-is.
  if (extractedCount > 0 && remainderCount === 0) {
    return { extracted: node, remainder: null, movedLeafPaths }
  }

  // Other-type only.
  if (extractedCount === 0) {
    return { extracted: null, remainder: node, movedLeafPaths: [] }
  }

  // Mixed split: build new containers. Do not duplicate non-$type group metadata.
  const extracted: JsonRecord = { ...extractedChildren }
  // Destination $type only when valid for the moved slice.
  extracted.$type = tokenType

  const remainder: JsonRecord = { ...remainderChildren }
  for (const [k, v] of Object.entries(node)) {
    if (!k.startsWith('$')) continue
    if (k === '$type') continue
    // Stay on the original physical group only.
    remainder[k] = v
  }

  const originalType = readLocalType(node)
  if (originalType && originalType !== tokenType) {
    remainder.$type = originalType
  }
  // If original $type was the type being moved away, omit it so leftover
  // tokens are not incorrectly re-typed via inheritance.

  return { extracted, remainder, movedLeafPaths }
}

function renameKeyPreservingOrder(
  parent: JsonRecord,
  oldKey: string,
  newKey: string,
  value: JsonValue,
): void {
  const keys = Object.keys(parent)
  const rebuilt: JsonRecord = {}
  for (const k of keys) {
    if (k === oldKey) {
      rebuilt[newKey] = value
    } else if (k !== newKey) {
      rebuilt[k] = parent[k]
    }
  }
  if (!(newKey in rebuilt)) {
    rebuilt[newKey] = value
  }
  for (const k of Object.keys(parent)) {
    delete parent[k]
  }
  Object.assign(parent, rebuilt)
}

function replaceKeyWithSplit(
  parent: JsonRecord,
  oldKey: string,
  newKey: string,
  extracted: JsonRecord,
  remainder: JsonRecord,
): void {
  const keys = Object.keys(parent)
  const rebuilt: JsonRecord = {}
  for (const k of keys) {
    if (k === oldKey) {
      // Renamed current-type group takes the original slot; leftover follows.
      rebuilt[newKey] = extracted
      rebuilt[oldKey] = remainder
    } else if (k !== newKey) {
      rebuilt[k] = parent[k]
    }
  }
  if (!(newKey in rebuilt)) {
    rebuilt[newKey] = extracted
  }
  if (!(oldKey in rebuilt)) {
    rebuilt[oldKey] = remainder
  }
  for (const k of Object.keys(parent)) {
    delete parent[k]
  }
  Object.assign(parent, rebuilt)
}

function mapMovedPaths(
  movedLeafPaths: string[],
  oldGroupPath: string[],
  newGroupPath: string[],
): Array<{ from: string; to: string }> {
  const oldPrefix = oldGroupPath.join('.')
  const newPrefix = newGroupPath.join('.')
  return movedLeafPaths.map((from) => {
    if (from === oldPrefix) {
      return { from, to: newPrefix }
    }
    if (from.startsWith(oldPrefix + '.')) {
      return { from, to: newPrefix + from.slice(oldPrefix.length) }
    }
    return { from, to: from }
  })
}

/**
 * Remove legacy path-only groupNameOverrides for a group path and its nested keys.
 * Does not touch unrelated overrides.
 */
export function clearGroupNameOverridesForPath(
  overrides: Record<string, string>,
  groupPathId: string,
): void {
  if (!groupPathId) return
  delete overrides[groupPathId]
  for (const key of Object.keys(overrides)) {
    if (key.startsWith(groupPathId + '.')) {
      delete overrides[key]
    }
  }
}

/**
 * Mutate `root` to rename `groupPath`'s last segment to `newName` for `tokenType` only.
 */
export function renameGroupForTokenType(args: {
  root: JsonRecord
  groupPath: string[]
  newName: string
  tokenType: ApplicationSupportedTokenType | string
}): RenameGroupForTokenTypeResult {
  const { root, groupPath, tokenType } = args
  const trimmed = args.newName.trim()

  if (groupPath.length === 0) {
    return { ok: false, reason: 'empty group path' }
  }
  if (!trimmed) {
    return { ok: false, reason: 'empty group name' }
  }

  const oldKey = groupPath[groupPath.length - 1]!
  const parentPath = groupPath.slice(0, -1)
  const newGroupPath = [...parentPath, trimmed]

  if (trimmed === oldKey) {
    return {
      ok: true,
      mode: 'noop',
      oldGroupPath: groupPath,
      newGroupPath,
      movedLeafPaths: [],
    }
  }

  let parent: JsonRecord = root
  for (const seg of parentPath) {
    const next = parent[seg]
    if (!isJsonRecord(next)) {
      return { ok: false, reason: `parent path not found: ${parentPath.join('.')}` }
    }
    parent = next
  }

  const groupNode = parent[oldKey]
  if (!isJsonRecord(groupNode) || isTokenLeafNode(groupNode)) {
    return { ok: false, reason: `group not found: ${groupPath.join('.')}` }
  }

  if (Object.prototype.hasOwnProperty.call(parent, trimmed)) {
    return { ok: false, reason: `sibling group already exists: ${trimmed}` }
  }

  // Inherited type from ancestors of the group being renamed.
  let inheritedType: string | undefined
  let cursor: JsonRecord = root
  for (const seg of parentPath) {
    const next = cursor[seg]
    if (!isJsonRecord(next)) break
    if (typeof next.$type === 'string') inheritedType = next.$type
    cursor = next
  }

  const slice = splitNodeForTokenType(
    root,
    groupNode,
    groupPath,
    inheritedType,
    tokenType,
  )

  if (!slice.extracted) {
    return { ok: false, reason: `no ${tokenType} content under ${groupPath.join('.')}` }
  }

  const movedLeafPaths = mapMovedPaths(slice.movedLeafPaths, groupPath, newGroupPath)

  if (!slice.remainder) {
    renameKeyPreservingOrder(parent, oldKey, trimmed, slice.extracted)
    return {
      ok: true,
      mode: 'exclusive',
      oldGroupPath: groupPath,
      newGroupPath,
      movedLeafPaths,
    }
  }

  replaceKeyWithSplit(parent, oldKey, trimmed, slice.extracted, slice.remainder)
  return {
    ok: true,
    mode: 'split',
    oldGroupPath: groupPath,
    newGroupPath,
    movedLeafPaths,
  }
}
