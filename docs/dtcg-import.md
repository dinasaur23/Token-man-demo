# DTCG import

Import DTCG JSON when a Design System has **no token sets yet**.

1. Open a Design System (you land on **Color tokens**).
2. In the empty state, use **DTCG JSON file**.
3. Select one or more `.json` files. Each file becomes a token set named after the file.
4. Invalid JSON or invalid DTCG is rejected; nothing is saved from that picker action.

The picker accepts **multiple** files. Empty `{}` documents are **not** valid imports — create those with **New token set**.

Import runs `validateTokensStrict`: structural checks, allowed `$type`s, then per-type `$value` checks.

Sample files: [`examples/`](../examples/README.md).

## Small file with all seven types

[`examples/all-basic-types.json`](../examples/all-basic-types.json) is a complete importable document. Structure:

```json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.2, 0.4, 1],
        "alpha": 1
      }
    }
  },
  "spacing": {
    "$type": "dimension",
    "md": {
      "$value": {
        "value": 16,
        "unit": "px"
      }
    }
  },
  "opacity": {
    "$type": "number",
    "disabled": {
      "$value": 0.8
    }
  },
  "motion": {
    "duration": {
      "$type": "duration",
      "fast": {
        "$value": {
          "value": 0.25,
          "unit": "s"
        }
      }
    },
    "easing": {
      "$type": "cubicBezier",
      "standard": {
        "$value": [0.4, 0, 0.2, 1]
      }
    }
  },
  "typography": {
    "family": {
      "$type": "fontFamily",
      "body": {
        "$value": "Inter"
      }
    },
    "weight": {
      "$type": "fontWeight",
      "bold": {
        "$value": 700
      }
    }
  }
}
```

Group `$type` is inherited by child tokens that omit their own `$type`.

## Aliases

### Curly-brace references

The supported alias form is a string `$value`:

```json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.2, 0.4, 1],
        "alpha": 1
      }
    }
  },
  "semantic": {
    "$type": "color",
    "primary": {
      "$value": "{color.primary}"
    }
  }
}
```

See [`examples/aliases.json`](../examples/aliases.json).

Rules the importer enforces:

| Situation | Code | What you see |
| --- | --- | --- |
| Target missing | `UNRESOLVED_ALIAS` | `Unresolved reference "{path}"` |
| Target is a group, not a token | `ALIAS_TARGETS_GROUP` | Use `"{path.$root}"` to reference the group’s root token |
| `{ $root }` with no group | `INVALID_ROOT_USAGE` | `Invalid $root usage in reference "{$root}"` |
| Legacy `{ "alias": "{path}" }` | `INVALID_VALUE` | Use a curly-brace string or a JSON Pointer object |

`$root` is a **child token name**, not the document root. This is valid:

```json
{
  "color": {
    "$type": "color",
    "$root": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0, 0, 0],
        "alpha": 1
      }
    },
    "on-accent": {
      "$value": "{color.$root}"
    }
  }
}
```

### JSON Pointer `$ref`

The reference resolver understands token `$value` objects of the form `{ "$ref": "#/path/to/property" }` (JSON Pointer, `#/` or `/`).

**Import `$value` validators are not uniform:**

| `$type` | Curly-brace `{path}` | JSON Pointer `{ "$ref": "#/..." }` as `$value` |
| --- | --- | --- |
| `number` | Accepted | Accepted by the number validator |
| `color`, `dimension`, `duration`, `fontFamily`, `fontWeight`, `cubicBezier` | Accepted | **Not** accepted as a typed `$value` shape (fails value validation) |

A number token may look like:

```json
{
  "opacity": {
    "$type": "number",
    "full": { "$value": 1 },
    "copy": { "$value": { "$ref": "#/opacity/full/$value" } }
  }
}
```

Group-level `$ref` (extending another group) is **not** implemented. See below.

## Unsupported input

Errors are formatted `path: CODE — message`. The UI summarizes them as structural or value errors and logs details in the browser console.

### `string` and `boolean`

These are not application token types (`INVALID_DTCG_TYPE`):

> `"$type" "boolean" is not supported. This application accepts only DTCG 2025.10 basic types: color, dimension, fontFamily, fontWeight, duration, cubicBezier, number.`

(The same wording is used for `string` and other unknown `$type`s.)

### Composite DTCG types

`typography`, `border`, `shadow`, `gradient`, `transition`, and `strokeStyle` are valid DTCG composites but out of scope (`UNSUPPORTED_BY_APPLICATION`):

> `"$type" "typography" is a valid DTCG composite type but is outside the current application scope.`

### `$extends` and group `$ref`

Both are valid DTCG group features that this app does not implement (`UNSUPPORTED_BY_APPLICATION`):

- `group "$extends" is valid DTCG but is not implemented; remove "$extends" or flatten inherited tokens before import.`
- `group-level "$ref" extension is valid DTCG but is not implemented; remove group "$ref" or flatten inherited tokens before import.`

### Malformed values

Bad `$value`s are `INVALID_VALUE`. Examples:

| Type | Rejected example | Typical message |
| --- | --- | --- |
| dimension | `"16px"` | Expected a DTCG dimension object `{ value, unit }` or a curly-brace alias |
| dimension | `"unit": "em"` | unit must be `"px"` or `"rem"` |
| duration | `"200ms"` | Expected `{ value, unit }` |
| number | `"0.8"` | Expected a JSON number or a curly-brace alias |
| color | unknown `colorSpace` | lists supported spaces |
| cubicBezier | `P1x` outside `[0, 1]` | P1x must be in the range `[0, 1]` |

Other structural failures:

| Code | Meaning |
| --- | --- |
| `TOKEN_AND_GROUP_CONFLICT` | A node has both `$value` and non-`$` children |
| `EMPTY_DOCUMENT` | No nodes with `$value` (empty files must use **New token set**) |
| `INVALID_POINTER` | Malformed JSON Pointer string |

## After import

The first imported file is active. Open each **Category** page to see tokens of that type. Then you can edit, alias, or [export](exporting.md).
