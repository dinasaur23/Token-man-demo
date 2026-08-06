import type { ApplicationSupportedTokenType } from './token-type-manifest'

export type GroupNode = {
  id: string
  title: string
  children?: GroupNode[]
}
export type SrgbObject = {
  colorSpace?: unknown
  components?: unknown
  alpha?: unknown
  hex?: unknown
}
export type TableRow = {
  name: string
  value: string
  raw: unknown
  type: ApplicationSupportedTokenType
  hex?: string
  group: string
  groupPath: string[]
  path: string
  /** Uploaded file name, or a mode-added sentinel — used for stable AG Grid row ids. */
  sourceFile: string
  isAlias: boolean
  aliasPath: string | null
}
