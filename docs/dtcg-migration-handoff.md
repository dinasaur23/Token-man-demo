# DTCG Multi-Type Migration Handoff

Branch: `cursor/figma-dtcg-type-import-597e` (from `main`)  
Last completed stage: **Figma import of safe DTCG basic types**  
Date: 2026-08-11

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Figma VariableScope: https://developers.figma.com/docs/plugins/api/VariableScope/

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–18 + UI | Done | Merged to `main` via PR #20 |
| Platform export runtime | Done | `token-manager/*` transforms + guard-before-ZIP |
| Row ordering | Done | Add/duplicate insert below source; stable `getRowId` |
| Type-aware columns | Done | Hex/Color columns only on Color pages |
| In-app creation | Done | NEW TOKEN SET / TOKEN / GROUP |
| Type-scoped groups | Done | Group-level `$type` + typed-empty fallback |
| Global token-set UX | Done | Merged to `main` via PR #23 |
| **Figma multi-type import** | **Done (this branch)** | color, dimension, number, fontFamily, fontWeight via centralized classifier |

---

## Figma → DTCG multi-type import (this branch)

### Goal
Extend Figma variable sync so the Design Token Manager imports all DTCG basic types that map safely from Figma Variables.

### Implemented mappings

| Figma | Condition | DTCG |
| --- | --- | --- |
| `COLOR` | — | `color` (sRGB object + alpha + 6-digit hex) |
| `STRING` | scope includes `FONT_FAMILY` | `fontFamily` |
| `FLOAT` | scope includes `FONT_WEIGHT` | `fontWeight` |
| `FLOAT` | dimensional scope | `dimension` with **unit `px`** |
| `FLOAT` | otherwise (e.g. `OPACITY`, `ALL_SCOPES`) | `number` |

**FLOAT classification priority:** `FONT_WEIGHT` → dimensional scopes → `number`.

**Dimensional scopes:** `WIDTH_HEIGHT`, `GAP`, `CORNER_RADIUS`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`, `STROKE_FLOAT`, `EFFECT_FLOAT`.

**Importer policy:** Figma dimensional variables are normalized to DTCG `px` on import (Figma FLOAT has no DTCG unit).

### Intentionally skipped
- `BOOLEAN` — no supported DTCG basic mapping (`UNSUPPORTED_FIGMA_MAPPING`)
- `STRING` without `FONT_FAMILY` — not restored as generic `string`
- Name-based inference (e.g. `duration/*`, `cubic-bezier(...)`) — never maps to `duration` / `cubicBezier`

### Deferred
- **duration** — Figma has no native duration type/unit
- **cubicBezier** — Figma Variables cannot natively represent `[x1,y1,x2,y2]`

### Architecture
```
Figma plugin (snapshots + scopes)
  → shared/figma-dtcg-mapping (classify + convert + document + report)
  → POST /api/tokens/figma-sync { tokens, modifiers, importReport }
  → server $type allowlist + value-shape validation
  → TokenWorkspace.files["figma-sync.json"]
  → client validateTokensStrict on load → type pages
```

Source of truth: [`shared/figma-dtcg-mapping/index.js`](../shared/figma-dtcg-mapping/index.js).  
Plugin embed: `node scripts/embed-figma-dtcg-mapping.js` (contract-tested; `--check` fails on drift).

### Alias policy
Preserved as DTCG `{collection.group.token}` path refs via `pathMap`. Raw Figma variable IDs are never persisted as aliases. Unresolved targets are skipped with report entries. Alias targets may be any successfully mapped supported type (not COLOR-only).

### Mode policy
Existing multi-mode model preserved: `$extensions.figma.valuesByMode` + `modifiers.mode`. Default/preferred mode (`light` if present) stored in `$value`.

**Explicit limitation (also in import report):** the Token Manager UI currently switches live `$value` only for **string alias** mode values — not concrete number/object values. Mode data is still preserved for export; platform export applies selected modes. Do not assume full live mode-switch UX for concrete values.

### Import report
Structured `{ imported, skipped, warnings }` from the mapper; echoed by `syncFigmaTokens`; summarized in the Figma plugin notify.

### Changed files
- [`shared/figma-dtcg-mapping/index.js`](../shared/figma-dtcg-mapping/index.js)
- [`scripts/embed-figma-dtcg-mapping.js`](../scripts/embed-figma-dtcg-mapping.js)
- [`figma-token-plugin/code.js`](../figma-token-plugin/code.js)
- [`server/src/controllers/TokenController.js`](../server/src/controllers/TokenController.js)
- Tests: `server/.../figma-dtcg-mapping.test.js`, `client/.../figma-import-strict-validation.test.ts`

### Manual test checklist
Create a Figma file with COLOR, GAP/CORNER_RADIUS FLOAT, OPACITY FLOAT, FONT_WEIGHT FLOAT, generic FLOAT, FONT_FAMILY STRING, unsupported STRING/BOOLEAN, one alias, multi-mode collection. Sync via plugin. Verify type pages, canonical JSON, and CSS/platform export. Confirm Duration / Cubic Bézier pages have no auto-inferred tokens.

---

## Remaining limitations

1. SCSS adapters ready; not a ZIP format in the dialog yet.
2. Swift rem uses `basePxFontSize` default 16.
3. Prep + `fontFamily/css` can double-quote some family lists (cosmetic).
4. Client UI mode switching for concrete Figma values is incomplete (see above).
5. Figma `--purge` / composites still unchanged.
6. duration / cubicBezier Figma import deferred.

---

## Test commands

```bash
node scripts/embed-figma-dtcg-mapping.js --check

cd server && npm run test:unit
# includes figma-dtcg-mapping.test.js + embed contract

cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/ src/components/__tests__/
cd client && npm run type-check && npm run lint && npm run build
```

---

## Exact next task

1. Review and merge this Figma multi-type import PR.
2. Optional follow-up: client resolver applies concrete `valuesByMode` values (not only string aliases).
3. Do **not** invent duration/cubicBezier Figma conventions unless explicitly specified.
