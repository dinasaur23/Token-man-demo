import { ColorLeafSchema } from './zod-color-schema'

type J = unknown
type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Walk the document; enter "color mode" when a node has $type:"color".
 * In color mode, any object with $value is validated as a color token.
 */
export function validateColorSubtree(doc: J): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []

  function visit(n: J, inColor: boolean, path: string): void {
    if (!isObj(n)) return

    const nextInColor = inColor || n.$type === 'color'

    if (nextInColor && '$value' in n) {
      const res = ColorLeafSchema.safeParse(n)
      if (!res.success) {
        for (const issue of res.error.issues) {
          const p = issue.path.length ? `${path}.${issue.path.join('.')}` : path || '/'
          errors.push(`${p} ${issue.message}`.trim())
        }
      }
    }

    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('$')) continue
      visit(v, nextInColor, path ? `${path}.${k}` : k)
    }
  }

  visit(doc, false, '')
  return errors.length ? { ok: false, errors } : { ok: true }
}
