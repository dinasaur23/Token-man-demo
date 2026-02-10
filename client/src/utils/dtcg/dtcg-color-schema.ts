export const DTCG_COLOR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'dtcg-color.schema.json',

  $defs: {
    ColorToken: {
      type: 'object',
      required: ['$value'],
      properties: {
        $type: { const: 'color' },
        $value: { type: 'string' },
        $description: { type: 'string' },
        $extensions: { type: 'object' },
      },
      additionalProperties: true,
    },
    ColorGroup: {
      type: 'object',
      required: ['$type'],
      properties: { $type: { const: 'color' } },
      patternProperties: {
        '^\\$': {},
        '^(?!\\$).*$': {
          anyOf: [
            { $ref: '#/$defs/ColorToken' },
            { $ref: '#/$defs/ColorGroup' },
            { $ref: '#/$defs/ColorInheritingGroup' },
          ],
        },
      },
      additionalProperties: true,
    },
    ColorInheritingGroup: {
      type: 'object',
      patternProperties: {
        '^\\$': {},
        '^(?!\\$).*$': {
          anyOf: [
            { $ref: '#/$defs/ColorToken' },
            { $ref: '#/$defs/ColorGroup' },
            { $ref: '#/$defs/ColorInheritingGroup' },
          ],
        },
      },
      additionalProperties: true,
    },
  },
  anyOf: [{ $ref: '#/$defs/ColorGroup' }, { $ref: '#/$defs/ColorToken' }],
} as const
