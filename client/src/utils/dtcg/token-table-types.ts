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
  type: 'color' | 'number' | 'string' | 'boolean'
  hex?: string
  group: string
  groupPath: string[]
  path: string
  isAlias: boolean
  aliasPath: string | null
}
