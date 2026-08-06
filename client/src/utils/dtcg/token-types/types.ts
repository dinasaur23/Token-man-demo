import type { ApplicationSupportedTokenType } from '../token-type-manifest'

export type TokenTypeId = ApplicationSupportedTokenType

export type TokenValidationIssue = {
  path: string
  message: string
}

export type TokenValueValidationResult =
  | { ok: true; warnings?: TokenValidationIssue[] }
  | { ok: false; errors: TokenValidationIssue[]; warnings?: TokenValidationIssue[] }

export type TokenTypeDefinition = {
  id: TokenTypeId
  label: string
  /** Route segment for per-type navigation, e.g. "color". */
  navPath: string
  /** Optional MDI icon for the nav drawer. */
  navIcon?: string
  validateValue: (value: unknown, path?: string) => TokenValueValidationResult
  createDefaultValue: () => unknown
  formatForDisplay: (value: unknown) => { primary: string; secondary?: string }
  parseFromEditor: (input: string) => { ok: true; value: unknown } | { ok: false; message: string }
}
