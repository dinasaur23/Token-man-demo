export const DIMENSIONAL_SCOPES: readonly string[]
export const FIGMA_IMPORTABLE_DTCG_TYPES: readonly string[]
export const SKIP_REASON: Readonly<Record<string, string>>
export const WARNING_CODE: Readonly<Record<string, string>>

export function classifyFigmaVariable(variable: {
  resolvedType?: string
  scopes?: string[]
  name?: string
}): {
  status: 'supported' | 'unsupported'
  dtcgType?: string
  mappingReason?: string
  skipDetail?: string
  warning?: string
}

export function convertFigmaValueToDtcg(
  variable: { resolvedType?: string; scopes?: string[] },
  raw: unknown,
  classification?: { dtcgType?: string },
): {
  ok: boolean
  value?: unknown
  reason?: string
  message?: string
  warning?: string
}

export function figmaVariablesToDtcgDocument(
  collections: unknown[],
  variables: unknown[],
): {
  tokens: Record<string, unknown>
  modifiers: Record<string, unknown>
  importReport: {
    imported: Array<Record<string, unknown>>
    skipped: Array<Record<string, unknown>>
    warnings: Array<Record<string, unknown>>
  }
}

export function countImportedByType(report: {
  imported?: Array<{ dtcgType?: string }>
}): Record<string, number>

export function formatImportReportSummary(report: unknown): string

export function validateFigmaImportTokenTree(
  node: unknown,
  path?: string,
): { ok: boolean; path?: string; message?: string }

export function validateFigmaImportDtcgValue(
  dtcgType: string,
  value: unknown,
): { ok: boolean; message?: string }
