// dtcg-color-schema.ts
export const DTCG_COLOR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'dtcg-color.schema.json',

  $defs: {
    // A single color token (leaf)
    ColorToken: {
      type: 'object',
      required: ['$value'],
      properties: {
        $type: { const: 'color' }, // optional here (inherited)
        $value: { type: 'string' }, // "#RRGGBB", alias string, etc.
        $description: { type: 'string' },
        $extensions: { type: 'object' },
      },
      additionalProperties: true,
    },

    // A color group that explicitly sets $type: "color"
    ColorGroup: {
      type: 'object',
      required: ['$type'],
      properties: { $type: { const: 'color' } },
      patternProperties: {
        '^\\$': {}, // allow meta keys on the group
        '^(?!\\$).*$': {
          anyOf: [
            { $ref: '#/$defs/ColorToken' }, // leaf
            { $ref: '#/$defs/ColorGroup' }, // nested explicit color group
            { $ref: '#/$defs/ColorInheritingGroup' }, // nested inheriting group
          ],
        },
      },
      additionalProperties: true,
    },

    // A group inside a color group that does NOT repeat $type
    ColorInheritingGroup: {
      type: 'object',
      patternProperties: {
        '^\\$': {}, // allow meta keys
        '^(?!\\$).*$': {
          anyOf: [
            { $ref: '#/$defs/ColorToken' }, // leaf
            { $ref: '#/$defs/ColorGroup' }, // explicit color group again
            { $ref: '#/$defs/ColorInheritingGroup' }, // keep nesting
          ],
        },
      },
      additionalProperties: true,
    },
  },

  // root: when you explicitly validate a color subtree,
  // it can be either a group (with $type) or a single token.
  anyOf: [{ $ref: '#/$defs/ColorGroup' }, { $ref: '#/$defs/ColorToken' }],
} as const
