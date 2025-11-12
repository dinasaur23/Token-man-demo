import { z } from 'zod'

// "#RGB", "#RRGGBB", "#RRGGBBAA"
export const Hex = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Expected hex color')

// DTCG-style alias: "{path.to.token}"
export const Alias = z.string().regex(/^\{[^}]+\}$/, 'Expected alias like {path.to.token}')

// ---- leaf variants ---------------------------------------------

// Explicit token: { "$type": "color", "$value": "#AABBCC" | "{...}" }
export const ExplicitHexOrAliasToken = z
  .object({
    $type: z.literal('color'),
    $value: z.union([Hex, Alias]),
  })
  .catchall(z.unknown())

// Explicit object token: { "$type":"color", "$value": { hex:"#..." } | { alias:"{...}" } }
export const ExplicitObjectColorToken = z
  .object({
    $type: z.literal('color'),
    $value: z.union([
      z.object({ hex: Hex }).catchall(z.unknown()),
      z.object({ alias: Alias }).catchall(z.unknown()),
    ]),
  })
  .catchall(z.unknown())

// Inherited leaf inside a color group: { "$value":"#..." | "{...}" } or object with hex/alias
export const InheritedColorToken = z
  .object({
    $value: z.union([
      Hex,
      Alias,
      z.object({ hex: Hex }).catchall(z.unknown()),
      z.object({ alias: Alias }).catchall(z.unknown()),
    ]),
  })
  .catchall(z.unknown())

// Used by the validator while in a "$type: color" subtree
export const ColorLeafSchema = z.union([
  ExplicitHexOrAliasToken,
  ExplicitObjectColorToken,
  InheritedColorToken,
])
