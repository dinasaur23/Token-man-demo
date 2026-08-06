# DTCG Multi-Type Migration Handoff

<<<<<<< HEAD
Branch: `cursor/token-table-columns-cab3` (from `main` @ `ffad34a`)  
Token-table columns PR: https://github.com/dinasaur23/Token-man-demo/pull/18  
Row-ordering fix PR: https://github.com/dinasaur23/Token-man-demo/pull/21 (merged)  
Merged platform serialization: https://github.com/dinasaur23/Token-man-demo/pull/20 (`840332a`)  
Do **not** merge: https://github.com/dinasaur23/Token-man-demo/pull/19 (superseded by #20)  
Last completed stage: **Type-aware token-table columns (Hex/Color only on Color pages)**  
=======
Branch: `cursor/token-table-columns-cab3` (continues from `cursor/dimension-visibility-cab3`)  
Token-table columns PR: https://github.com/dinasaur23/Token-man-demo/pull/18  
Dimension visibility fix PR: https://github.com/dinasaur23/Token-man-demo/pull/17  
Post-migration UI PR: https://github.com/dinasaur23/Token-man-demo/pull/16  
Stage 18 PR: https://github.com/dinasaur23/Token-man-demo/pull/15  
Stage 17 PR: https://github.com/dinasaur23/Token-man-demo/pull/14  
Stage 16 PR: https://github.com/dinasaur23/Token-man-demo/pull/13  
Stage 15 PR: https://github.com/dinasaur23/Token-man-demo/pull/12  
Stage 14 PR: https://github.com/dinasaur23/Token-man-demo/pull/11  
Stage 13 PR: https://github.com/dinasaur23/Token-man-demo/pull/10  
Stage 12 PR: https://github.com/dinasaur23/Token-man-demo/pull/9  
Stage 11 PR: https://github.com/dinasaur23/Token-man-demo/pull/8  
Stage 10 PR: https://github.com/dinasaur23/Token-man-demo/pull/7  
Stage 9 PR: https://github.com/dinasaur23/Token-man-demo/pull/6  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 18 + group-tree filter + Dimension visibility + type-aware columns**  
>>>>>>> 9a95a55 (Document type-aware columns PR link.)
Date: 2026-08-06

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–18 + UI | Done | Merged to `main` via PR #20 |
| Platform export runtime | Done | `token-manager/*` transforms + guard-before-ZIP |
| Row ordering | Done | Add/duplicate insert below source; stable `getRowId`; source sibling order authoritative |
| **Type-aware columns** | **Done** | Hex/Color columns only on Color pages; modular column factory |

---

## Platform export runtime (merged via PR #20)

Production export path uses `preparePlatformExport` + `token-manager/<platform>` Style Dictionary transforms (5.5.0), final-file `[object Object]` guard, and ZIP only after successful build. Canonical JSON preserves structured values and aliases; platform exports stringify per target.

See PR #20 / merge `840332a` for full runtime path details.

---

## Token row-ordering bug (fixed via PR #21)

### Symptom
After repeated **Add row below** / **Duplicate row**, the new token sometimes appeared at the **top** of the AG Grid table instead of directly below the selected/source row (all token types).

### Root cause
1. **First incorrect ordering point — source sibling keys:** `parent[newKey] = newToken` always appended the key at the end of the parent object, so source-document order did not match “insert below”.
2. **Intermittent top-of-table — stale/empty `rowOrder`:** insert used `idx = rowOrder.indexOf(path)` then `insertIndex = idx >= 0 ? idx + 1 : order.length`. When `rowOrder` was empty or missing the reference path (route remount, partial seed, rebuild race), `insertIndex` became `0`, so the new path alone sat at the front of `rowOrder` while every other token fell back to `Number.MAX_SAFE_INTEGER` in the display sort → **new row at top**.
3. **Unstable grid identity:** no `getRowId`; AG Grid keyed rows by object identity across full `rowData` rebuilds.

### Fix
- `insertSiblingKeyAfter` — rebuild parent object keys so the new sibling sits immediately after the source key (**source order authoritative**).
- `insertPathAfterInRowOrder` — if the reference path is missing/empty, reconcile against authoritative source paths **before** splicing so the new path cannot jump to index 0.
- `ensureRowOrderContainsSourcePaths` on populate — fill missing paths without reshuffling existing order.
- Stable AG Grid `getRowId` = `buildStableTokenRowId(sourceFile, path)` (`fileName::full.path`).
- Fallback when there is **no** selected/reference row: **append** (documented; same as historical complete-list append).

### Files
- `client/src/utils/dtcg/row-ordering.ts`
- `client/src/utils/dtcg/__tests__/row-ordering.test.ts`
- `client/src/composables/useTokenCrud.ts`
- `client/src/composables/useTokenWorkspaceTable.ts`
- `client/src/components/TokenTableComponent.vue` (`getRowId` retained alongside type-aware columns)
- `client/src/utils/dtcg/token-table-types.ts` (`sourceFile` on `TableRow`)

---

## Type-aware token-table columns (this branch)

### Root cause
`useTokenGridColumns` always built a static column set that included **Hex** and **Color** (preview picker). Non-color pages (`/tokens/dimension`, `/tokens/cubicBezier`, …) still rendered those Color-specific columns (empty cells).

### Fix
- Pure factory [`token-grid-columns.ts`](../client/src/utils/dtcg/token-grid-columns.ts) builds columns from the active `tokenType`.
- Shared columns for every type: Name, Value, Alias path, Actions.
- Hex + Color preview only when `tokenType === "color"`.
- Value editing still uses registry parse/format per row type (dimension `16px`/`1rem`, duration, fontFamily, fontWeight, cubicBezier, number).
- `useTokenGridColumns` takes a reactive `tokenType` and returns `computed` columnDefs.
- `TokenTableComponent` passes `tokenType`, keys the grid on type (`:key="tokenType"`), and **retains** `:getRowId="getRowId"` from PR #21.
- Color behavior unchanged on `/tokens/color`.

### Changed files
- [`token-grid-columns.ts`](../client/src/utils/dtcg/token-grid-columns.ts) — modular column factory
- [`useTokenGridColumns.ts`](../client/src/composables/useTokenGridColumns.ts) — reactive wrapper
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — pass tokenType; `:key="tokenType"`; keep `getRowId`
- [`token-grid-columns.test.ts`](../client/src/utils/dtcg/__tests__/token-grid-columns.test.ts) — regressions

### Decisions
1. One shared table component; columns vary by factory — no per-type table duplication.
2. Type-specific value shapes stay in the shared Value column (formatted via registry), not extra unit columns.
3. Color-only columns gated on registry id `"color"` (route `/tokens/color`).

---

## Remaining limitations

1. SCSS adapters ready; not a ZIP format in the dialog yet.
2. Swift rem uses `basePxFontSize` default 16.
3. Prep + `fontFamily/css` can double-quote some family lists (cosmetic).
4. Figma plugin / `--purge` / composites unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# 22 files, 183 tests passed (includes row-ordering + token-grid-columns)

cd client && npm run type-check && npm run lint
# pass

cd server && npm run test:unit
# 60 tests passed

cd server && npm run lint
# pass
```

Manual UI: Color page shows Hex + Color preview; Dimension/Number/Duration/Font Family/Font Weight/Cubic Bézier hide them; route switch remounts columns; duplicate/add-below still inserts below source row.

---

## Exact next task

1. Merge this PR to `main` and redeploy frontend (`token-mananger-frontend`).
2. Close PR #19 without merging.
3. Do **not** start Figma/`--purge` unless requested.
