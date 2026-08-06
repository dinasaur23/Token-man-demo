/**
 * Resolved workspace view — derived state only.
 * MUST NOT replace source documents in persistence (Pinia files / Mongo).
 */

import type { JsonValue, ResolverInput } from './resolver'
import { resolveUploadedDocuments } from './resolver'
import {
  cloneSourceDocument,
  cloneSourceDocumentMap,
  type SourceDocument,
  type SourceDocumentMap,
} from './source-document'

export type ResolvedDocument = SourceDocument

export type ResolvedWorkspaceView = {
  /** Deep clone of the source map used as the derivation input (not for persistence). */
  sourceSnapshot: SourceDocumentMap
  /**
   * Result of multi-file / modifier resolution (existing resolver pipeline).
   * Alias string values may still be present; callers resolve aliases for display.
   */
  mergedDocument: ResolvedDocument
}

/**
 * Build a derived resolved view from authoritative source documents.
 * The returned objects are detached clones — mutating them must never be
 * written back as workspace files.
 */
export function buildResolvedWorkspaceView(
  sourceDocs: SourceDocumentMap,
  resolverInput: ResolverInput = {},
): ResolvedWorkspaceView {
  const sourceSnapshot = cloneSourceDocumentMap(sourceDocs)
  const mergedDocument = resolveUploadedDocuments(
    sourceSnapshot as Record<string, JsonValue>,
    resolverInput,
  ) as ResolvedDocument

  return {
    sourceSnapshot,
    mergedDocument: cloneSourceDocument(mergedDocument),
  }
}
