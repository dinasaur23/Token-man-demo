import { z } from 'zod'

export const Hex = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Expected hex color')

export const Alias = z.string().regex(/^\{[^}]+\}$/, 'Expected alias like {path.to.token}')

export const NumberLeafSchema = z
  .object({
    $type: z.literal('number'),
    $value: z.union([z.number(), Alias]),
  })
  .catchall(z.unknown())

export const StringLeafSchema = z
  .object({
    $type: z.literal('string'),
    $value: z.union([z.string(), Alias]),
  })
  .catchall(z.unknown())

export const BooleanLeafSchema = z
  .object({
    $type: z.literal('boolean'),
    $value: z.union([z.boolean(), Alias]),
  })
  .catchall(z.unknown())

export const ExplicitHexOrAliasToken = z
  .object({
    $type: z.literal('color'),
    $value: z.union([Hex, Alias]),
  })
  .catchall(z.unknown())

export const ExplicitObjectColorToken = z
  .object({
    $type: z.literal('color'),
    $value: z.union([
      z.object({ hex: Hex }).catchall(z.unknown()),
      z.object({ alias: Alias }).catchall(z.unknown()),
    ]),
  })
  .catchall(z.unknown())

const W3cColorObject = z
  .object({
    colorSpace: z.string(),
    components: z.array(z.number()),
    alpha: z.number(),
    hex: Hex,
  })
  .catchall(z.unknown())

export const InheritedColorToken = z
  .object({
    $value: z.union([
      Hex,
      Alias,
      z.object({ hex: Hex }).catchall(z.unknown()),
      z.object({ alias: Alias }).catchall(z.unknown()),
      W3cColorObject,
    ]),
  })
  .catchall(z.unknown())

export const ColorLeafSchema = z.union([
  ExplicitHexOrAliasToken,
  ExplicitObjectColorToken,
  InheritedColorToken,
])

export const LeafTokenSchema = z.union([
  ColorLeafSchema,
  NumberLeafSchema,
  StringLeafSchema,
  BooleanLeafSchema,
])
