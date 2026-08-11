/**
 * CORS origin allowlist for Token Manager API.
 *
 * Allowed:
 * - missing/undefined origin (same-origin, curl, some server-to-server)
 * - http://localhost:5173 (Vite client)
 * - any http(s)://*.vercel.app host (deployed web app) — validated via URL parse
 * - literal "null" (Figma plugin UI iframe origin — browser sends Origin: null)
 *
 * Rejected: arbitrary third-party origins.
 *
 * Note: credentials:true is used at the Express cors layer. We never return
 * Access-Control-Allow-Origin: *; allowed origins are reflected explicitly.
 */

/** Vite client default during local development. */
export const LOCAL_CLIENT_ORIGIN = 'http://localhost:5173'

/**
 * Figma plugin UI iframes use a null origin. The browser sends the header
 * value as the literal string "null".
 * @see https://developers.figma.com/docs/plugins/making-network-requests/
 */
export const FIGMA_PLUGIN_UI_ORIGIN = 'null'

/**
 * @param {unknown} origin
 * @returns {boolean}
 */
export function isAllowedCorsOrigin(origin) {
  if (origin == null || origin === '') return true

  if (typeof origin !== 'string') return false

  if (origin === LOCAL_CLIENT_ORIGIN) return true

  // Figma plugin UI (sandbox iframe). Required for plugin login/fetch from ui.html.
  if (origin === FIGMA_PLUGIN_UI_ORIGIN) return true

  // Deployed web clients on Vercel — parse URL; do not trust a raw string suffix.
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.hostname.endsWith('.vercel.app')) return true
  } catch {
    return false
  }

  return false
}

/**
 * cors package `origin` callback adapter.
 * Uses callback(null, false) for rejected origins (no thrown Error / 500).
 *
 * @param {string | undefined} origin
 * @param {(err: Error | null, allow?: boolean) => void} callback
 */
export function corsOriginDelegate(origin, callback) {
  const allowed = isAllowedCorsOrigin(origin)
  if (!allowed) {
    console.warn('[cors] rejected origin:', origin ?? '(none)')
  }
  callback(null, allowed)
}
