/**
 * DTCG Color Module 2025.10 supported color spaces and component ranges.
 * @see https://www.designtokens.org/tr/2025.10/color/
 */

export type ComponentRange =
  | { kind: 'closed'; min: number; max: number }
  | { kind: 'hue' } // [0, 360)
  | { kind: 'unbounded' } // any finite number
  | { kind: 'nonNegative' } // [0, +∞)

export type ColorSpaceDefinition = {
  id: string
  /** Always 3 for Color Module 2025.10 listed spaces. */
  componentCount: 3
  components: [ComponentRange, ComponentRange, ComponentRange]
}

const rgb01: [ComponentRange, ComponentRange, ComponentRange] = [
  { kind: 'closed', min: 0, max: 1 },
  { kind: 'closed', min: 0, max: 1 },
  { kind: 'closed', min: 0, max: 1 },
]

const xyz01: [ComponentRange, ComponentRange, ComponentRange] = [
  { kind: 'closed', min: 0, max: 1 },
  { kind: 'closed', min: 0, max: 1 },
  { kind: 'closed', min: 0, max: 1 },
]

/**
 * Supported `colorSpace` identifiers from Design Tokens Color Module 2025.10 §4.2.
 */
export const SUPPORTED_COLOR_SPACES: readonly ColorSpaceDefinition[] = [
  { id: 'srgb', componentCount: 3, components: rgb01 },
  { id: 'srgb-linear', componentCount: 3, components: rgb01 },
  {
    id: 'hsl',
    componentCount: 3,
    components: [
      { kind: 'hue' },
      { kind: 'closed', min: 0, max: 100 },
      { kind: 'closed', min: 0, max: 100 },
    ],
  },
  {
    id: 'hwb',
    componentCount: 3,
    components: [
      { kind: 'hue' },
      { kind: 'closed', min: 0, max: 100 },
      { kind: 'closed', min: 0, max: 100 },
    ],
  },
  {
    id: 'lab',
    componentCount: 3,
    components: [
      { kind: 'closed', min: 0, max: 100 },
      { kind: 'unbounded' },
      { kind: 'unbounded' },
    ],
  },
  {
    id: 'lch',
    componentCount: 3,
    components: [
      { kind: 'closed', min: 0, max: 100 },
      { kind: 'nonNegative' },
      { kind: 'hue' },
    ],
  },
  {
    id: 'oklab',
    componentCount: 3,
    components: [
      { kind: 'closed', min: 0, max: 1 },
      { kind: 'unbounded' },
      { kind: 'unbounded' },
    ],
  },
  {
    id: 'oklch',
    componentCount: 3,
    components: [
      { kind: 'closed', min: 0, max: 1 },
      { kind: 'nonNegative' },
      { kind: 'hue' },
    ],
  },
  { id: 'display-p3', componentCount: 3, components: rgb01 },
  { id: 'a98-rgb', componentCount: 3, components: rgb01 },
  { id: 'prophoto-rgb', componentCount: 3, components: rgb01 },
  { id: 'rec2020', componentCount: 3, components: rgb01 },
  { id: 'xyz-d65', componentCount: 3, components: xyz01 },
  { id: 'xyz-d50', componentCount: 3, components: xyz01 },
] as const

export const SUPPORTED_COLOR_SPACE_IDS: readonly string[] = SUPPORTED_COLOR_SPACES.map(
  (s) => s.id,
)

const COLOR_SPACE_BY_ID = new Map(SUPPORTED_COLOR_SPACES.map((s) => [s.id, s]))

export function getColorSpaceDefinition(id: string): ColorSpaceDefinition | undefined {
  return COLOR_SPACE_BY_ID.get(id)
}

export function isSupportedColorSpace(id: string): boolean {
  return COLOR_SPACE_BY_ID.has(id)
}

export function isNoneKeyword(value: unknown): value is 'none' {
  return value === 'none'
}

export function isComponentInRange(value: number, range: ComponentRange): boolean {
  if (!Number.isFinite(value)) return false
  switch (range.kind) {
    case 'closed':
      return value >= range.min && value <= range.max
    case 'hue':
      return value >= 0 && value < 360
    case 'unbounded':
      return true
    case 'nonNegative':
      return value >= 0
  }
}

export function describeComponentRange(range: ComponentRange): string {
  switch (range.kind) {
    case 'closed':
      return `[${range.min}, ${range.max}]`
    case 'hue':
      return '[0, 360)'
    case 'unbounded':
      return 'any finite number'
    case 'nonNegative':
      return '[0, Infinity)'
  }
}
