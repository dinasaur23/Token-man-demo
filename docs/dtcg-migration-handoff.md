# DTCG Multi-Type Migration Handoff

Branch: `cursor/figma-dtcg-type-import-597e` (from `main`)  
Last completed stage: **Figma import UX onboarding + plugin sync report UI**  
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
| Figma multi-type import | Done | color, dimension, number, fontFamily, fontWeight, duration, cubicBezier |
| **Figma import UX** | **Done (this branch)** | Empty/global Import from Figma help + plugin sync report UI |

---

## Figma import UX (this update)

### Goal
Make Figma import discoverable inside Token Manager without changing mapping rules.

### Web app
- Empty state copy mentions Figma; actions: **DTCG JSON file**, **New token set**, **Import from Figma**.
- Global toolbar (non-empty workspace): Active token set · New token set · **Import from Figma** · Export tokens.
- [`FigmaImportHelpDialog.vue`](../client/src/components/FigmaImportHelpDialog.vue) explains steps, supported types, deferred types, dimension→px note, and collapsed alias/mode notes.
- Detailed sync counts stay in the **Figma plugin** (web does not receive live plugin reports without new polling infra — follow-up).

### Plugin
- Menu: **Sync Figma Variables** opens a compact sync panel (design system, supported types, Sync button).
- After sync: result panel with imported/skipped/notes + **View details**.
- Settings UI also lists supported / not auto-mapped types.

### Unchanged
Mapping priority, validators, aliases, mode persistence, CRUD, export, routes.

---

## Figma → DTCG multi-type import

### Implemented mappings

| Figma | Condition | DTCG |
| --- | --- | --- |
| `COLOR` | — | `color` (sRGB object + alpha + 6-digit hex) |
| `STRING` | scope includes `FONT_FAMILY` | `fontFamily` |
| `FLOAT` | scope includes `FONT_WEIGHT` | `fontWeight` |
| `FLOAT` | dimensional scope | `dimension` with **unit `px`** |
| `FLOAT` | otherwise (e.g. `OPACITY`, `ALL_SCOPES`) | `number` |
| `TIMING` | number (seconds) | `duration` with **unit `s`** |
| `EASING` | explicit `easingFunctionCubicBezier` | `cubicBezier` `[x1,y1,x2,y2]` |

**FLOAT classification priority:** `FONT_WEIGHT` → dimensional scopes → `number`.

**Dimensional scopes:** `WIDTH_HEIGHT`, `GAP`, `CORNER_RADIUS`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`, `STROKE_FLOAT`, `EFFECT_FLOAT`.

**Importer policy:** Figma dimensional variables are normalized to DTCG `px` on import.
Timing (`TIMING`) → DTCG `duration` with unit `"s"`. Easing (`EASING`) → DTCG
`cubicBezier` only when `easingFunctionCubicBezier` control points are present.

### Intentionally skipped
- `BOOLEAN`; `STRING` without `FONT_FAMILY`
- Easing presets / springs / `HOLD` **without** explicit cubic-bezier control points
  (never invent points from names)

### Architecture
```
Figma plugin (snapshots + scopes)
  → shared/figma-dtcg-mapping
  → POST /api/tokens/figma-sync { tokens, modifiers, importReport }
  → server allowlist + value-shape validation
  → files["figma-sync.json"] → client type pages
```

Source of truth: [`shared/figma-dtcg-mapping/index.js`](../shared/figma-dtcg-mapping/index.js).  
Embed: `node scripts/embed-figma-dtcg-mapping.js` (`--check` contract).

### Alias / mode policies
- Aliases preserved as `{path}` refs.
- Multi-mode preserved under Figma extensions; UI live-switches aliases more reliably than concrete number/object values (called out in help Notes + import warnings).

### Follow-ups
1. Optional: surface last Figma import report in the web app after workspace reload (store report on workspace).
2. Optional: client resolver applies concrete `valuesByMode` values (not only string aliases).

---

## Remaining limitations

1. SCSS adapters ready; not a ZIP format in the dialog yet.
2. Swift rem uses `basePxFontSize` default 16.
3. Prep + `fontFamily/css` can double-quote some family lists (cosmetic).
4. Web app does not yet show the live Figma sync report (plugin does).
5. Client UI mode switching for concrete Figma values is incomplete.

---

## Test commands

```bash
node scripts/embed-figma-dtcg-mapping.js --check

cd server && npm run test:unit

cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/ src/components/__tests__/
cd client && npm run type-check && npm run lint && npm run build
```
