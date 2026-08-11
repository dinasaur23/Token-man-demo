/**
 * Display-only number formatting for token UI.
 *
 * Does NOT mutate canonical DTCG source values. Rounds for presentation to
 * clear IEEE-754 noise (e.g. Figma float imports) while keeping meaningful
 * precision up to 6 decimal places.
 */

const DISPLAY_DECIMALS = 6

/**
 * Format a finite number for UI display.
 *
 * - integers stay integers: `1` → `"1"`
 * - float noise stripped: `0.4000000059604645` → `"0.4"`
 * - meaningful precision kept: `0.333333` → `"0.333333"`, `1.25` → `"1.25"`
 */
export function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0 || Object.is(value, -0)) return '0'

  let formatted = value.toFixed(DISPLAY_DECIMALS)
  if (formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '')
  }
  if (formatted === '-0') return '0'
  return formatted
}
