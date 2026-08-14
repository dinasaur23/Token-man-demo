# Architecture

Token Manager stores **source DTCG documents** and derives everything else.

```text
Source DTCG documents
        ↓
Reference resolution
        ↓
Effective type resolution
        ↓
Resolved workspace view
        ↓
UI / platform exporters
```

## Source vs resolved

| | Source | Resolved |
| --- | --- | --- |
| What it is | The JSON you import, edit, or sync from Figma | Tokens after following aliases and inheriting `$type` |
| Persistence | Yes — this is what MongoDB stores | No — computed in memory |
| Canonical JSON export | Yes | No |
| Platform export (CSS, Tailwind, Swift, Android) | No | Yes |
| Token table | Edits write back to source | Display uses resolved values |

Only source is authoritative. Reloading a workspace re-derives the resolved view.

## Token type registry

Supported types are listed once in [`shared/dtcg-basic-token-types.json`](../shared/dtcg-basic-token-types.json):

- application types: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`
- invalid non-DTCG: `string`, `boolean`
- known composites out of scope: `typography`, `border`, `shadow`, `gradient`, `transition`, `strokeStyle`
- deferred group features: `$extends`

The Vue client loads that manifest and registers one module per type under [`client/src/utils/dtcg/token-types/`](../client/src/utils/dtcg/token-types/) (validate, default value, editor parse/format). The server uses a copied manifest for allowlists. Figma import uses the same seven types.

## References

Implemented today:

**Curly-brace aliases** — `$value` is `"{path.to.token}"`. Resolution takes the target leaf’s `$value`. Targeting a group requires `"{group.$root}"`, where `$root` is a **child token** of that group.

**JSON Pointer `$ref`** — the resolver accepts `{ "$ref": "#/path" }` as a token `$value` (RFC 6901). Import validators only treat that object as a valid **typed** `$value` for `number`. Other registered types expect a concrete value or a curly-brace string at import (see [DTCG Import](dtcg-import.md)).

**Group `$extends` and group-level `$ref`** — valid DTCG, rejected on import (not implemented).

**Cycles and missing refs** — unresolved aliases are `UNRESOLVED_ALIAS`. Circular aliases are detected when fully resolving for the UI (`CIRCULAR_ALIAS`). Import structural checks resolve one hop for alias-to-group / `$root` usage.

**Effective type** — a leaf’s type is, in order: its own `$type`, else the referenced token’s type, else the nearest parent group `$type`. Mismatched alias types are `ALIAS_TYPE_MISMATCH`.

## Figma mapping

Source of truth: [`shared/figma-dtcg-mapping/index.js`](../shared/figma-dtcg-mapping/index.js).

[`scripts/embed-figma-dtcg-mapping.js`](../scripts/embed-figma-dtcg-mapping.js) copies it into:

- [`figma-token-plugin/code.js`](../figma-token-plugin/code.js) (generated IIFE)
- [`server/src/utils/figma-dtcg-mapping/`](../server/src/utils/figma-dtcg-mapping/) (vendored for the Vercel server bundle)

Check: `npm run test:figma-mapping-sync` in `server/` (`node ../scripts/embed-figma-dtcg-mapping.js --check`).

The plugin reads local variable collections, maps them, and `POST`s `/api/tokens/figma-sync`. The server re-validates with the same mapping helpers before writing `figma-sync.json`.

## Persistence

MongoDB (`MONGO_URI`, optional `MONGO_DB`).

```text
User
 └── DesignSystem (name, per user)
      └── TokenWorkspace (one per user + Design System)
           └── files[]  { name, content }   ← token sets
```

`files[].name` is the token-set filename (`Brand.json`, `figma-sync.json`). `content` is the source JSON object.

The workspace document also stores UI/session fields (modifiers, token name display overrides, leftover `groupNameOverrides` from older sessions, row order, last Figma payload). Those are not DTCG source.

**Active token set** is client-only (`activeSourceFileName`). It is not a Mongo field. Export still walks every file in `files[]`.

## Type-scoped groups

The group tree on `/tokens/:tokenType` is filtered to the route type: matching token rows plus typed-empty source groups whose group `$type` equals that type.

A Figma collection can produce **one physical source path** that holds several types (for example `primary` with color, dimension, and cubicBezier children). Each type page may show that path. Mutations still use the **active route type**:

- **New group / Child group** write an empty container with `$type` equal to the current page, in the active token set. They are visible only on that type until other types receive tokens there.
- **Rename** mutates source. If the group is exclusive to the current type, the JSON key is renamed in place. If it is mixed, only the current-type slice moves to the new key; other types remain on the original path. Aliases for moved leaves are updated. A successful rename also drops leftover `groupNameOverrides` for that path so a stale display overlay cannot globally rename other types on export.

Do not treat UI group names as a type-blind overlay. Persistence is source JSON.
