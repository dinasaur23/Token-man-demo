import type { ColorRow } from './dtcg-parser'

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
export type TableRow = ColorRow & {
  raw?: unknown
  hex: string
  path: string
  aliasPath: string | null
  isAlias: boolean
}
