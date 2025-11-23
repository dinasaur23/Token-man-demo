export type Json = unknown
type JsonObject = Record<string, Json>

const isObject = (value: Json): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// "#RGB", "#RGBA", "#RRGGBB", "#RRGGBBAA"
export const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export interface DtcgSrgbValue {
  colorSpace: 'srgb'
  components: [number, number, number]
  alpha?: number
  hex?: string
}

const expandHex = (hex: string): string => {
  const raw = hex.slice(1)
  if (raw.length === 3 || raw.length === 4) {
    const doubled = raw
      .split('')
      .map((ch) => ch + ch)
      .join('')
    return `#${doubled}`
  }
  return hex
}

const hexToChannels = (hex: string): { r: number; g: number; b: number; alpha: number } => {
  const norm = expandHex(hex)
  const raw = norm.slice(1)

  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) : 255

  return { r, g, b, alpha: a / 255 }
}

/** Convert a hex string to a W3C DTCG srgb color object */
export const hexToDtcgColorValue = (hex: string): DtcgSrgbValue => {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid hex color: ${hex}`)
  }

  const { r, g, b, alpha } = hexToChannels(hex)
  const hex6 =
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')

  const components: [number, number, number] = [r / 255, g / 255, b / 255]

  const obj: DtcgSrgbValue = {
    colorSpace: 'srgb',
    components,
    hex: hex6,
  }

  if (alpha < 1) {
    obj.alpha = Number(alpha.toFixed(4))
  }

  return obj
}

export function convertHexColorsInDocument(doc: Json): Json {
  return convertNode(doc, false)
}

function convertNode(node: Json, inColor: boolean): Json {
  if (!isObject(node)) return node

  const typeProp = node['$type']
  const nextInColor = inColor || typeProp === 'color'

  const out: JsonObject = {}

  for (const [key, value] of Object.entries(node)) {
    if (nextInColor && key === '$value' && typeof value === 'string' && HEX_PATTERN.test(value)) {
      out[key] = hexToDtcgColorValue(value)
    } else {
      out[key] = convertNode(value, nextInColor)
    }
  }

  return out
}
