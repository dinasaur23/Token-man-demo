// // src/utils/dtcg/dtcg-validator.ts
// import Ajv2020 from 'ajv/dist/2020'
// import addFormats from 'ajv-formats'
// import type { ErrorObject } from 'ajv'
// import { DTCG_COLOR_SCHEMA } from './dtcg-color-schema'

// // --- JSON types (no "any")
// export type JsonValue = string | number | boolean | null | JsonObject | JsonArray
// export type JsonArray = JsonValue[]
// export interface JsonObject {
//   [k: string]: JsonValue
// }

// function isJsonObject(x: unknown): x is JsonObject {
//   return typeof x === 'object' && x !== null && !Array.isArray(x)
// }

// // --- AJV setup
// const ajv = new Ajv2020({ allErrors: true, strict: false })
// addFormats(ajv)

// // root anyOf in schema handles token vs group
// const validateColorGroup = ajv.compile(DTCG_COLOR_SCHEMA)

// /**
//  * Walk the document and validate only color subtrees:
//  *  - groups with $type === "color"
//  *  - leaf tokens with $value and $type === "color"
//  */
// export function validateDtcgColorsInDoc(
//   doc: JsonValue,
// ): { ok: true } | { ok: false; errors: string[] } {
//   const errors: string[] = []

//   function visit(node: JsonValue, path: string): void {
//     if (!isJsonObject(node)) return

//     // 1) Color group
//     if (node.$type === 'color') {
//       const ok = validateColorGroup(node)
//       if (!ok) pushErrors(path, validateColorGroup.errors)
//       // keep walking to catch nested color groups/tokens
//     }

//     // 2) Explicit color token (not in a color group)
//     if ('$value' in node && node.$type === 'color') {
//       const ok = validateColorGroup(node)
//       if (!ok) pushErrors(path, validateColorGroup.errors)
//     }

//     // Recurse into non-$ keys
//     for (const [k, v] of Object.entries(node)) {
//       if (k.startsWith('$')) continue
//       visit(v, path ? `${path}.${k}` : k)
//     }
//   }

//   function pushErrors(prefix: string, ajvErrors: readonly ErrorObject[] | null | undefined): void {
//     for (const e of ajvErrors ?? []) {
//       const instPath = (e.instancePath || '/').replace(/^\//, '') // AJV JSON Pointer
//       const fullPath = [prefix, instPath].filter(Boolean).join(instPath ? '.' : '')
//       errors.push(`${fullPath || '/'} ${e.message ?? ''}`.trim())
//     }
//   }

//   visit(doc, '')

//   return errors.length ? { ok: false, errors } : { ok: true }
// }

// src/utils/dtcg/zod-color-validator.ts

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
