import { HEX_PATTERN } from './color-conversion'
import type { SrgbObject } from './token-table-types'

export function srgbFromHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) return hex

  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  return `srgb(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`
}

export function makeDisplayColor(value: unknown): { srgb: string; hex: string } {
  if (typeof value === 'string' && HEX_PATTERN.test(value)) {
    const hex = value
    const srgb = srgbFromHex(hex)
    return { srgb, hex }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as SrgbObject
    if (
      obj.colorSpace === 'srgb' &&
      Array.isArray(obj.components) &&
      obj.components.length === 3 &&
      obj.components.every((c) => typeof c === 'number')
    ) {
      const comps = obj.components as number[]
      const compStr = comps.map((c) => c.toFixed(3)).join(', ')
      const alphaStr = typeof obj.alpha === 'number' ? `, ${obj.alpha.toFixed(3)}` : ''
      const srgb = `srgb(${compStr}${alphaStr})`
      if (typeof obj.hex === 'string' && HEX_PATTERN.test(obj.hex)) {
        return { srgb, hex: obj.hex }
      }
      const toByteHex = (c: number): string => {
        const clamped = Math.max(0, Math.min(1, c))
        const v = Math.round(clamped * 255)
        return v.toString(16).padStart(2, '0')
      }
      const [r, g, b] = comps
      const hex = `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`
      return { srgb, hex }
    }
  }
  return {
    srgb: typeof value === 'string' ? value : JSON.stringify(value),
    hex: '#000000',
  }
}
