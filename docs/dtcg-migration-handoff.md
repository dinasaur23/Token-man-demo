# DTCG Multi-Type Migration Handoff

Branch: `cursor/create-token-sets-tokens-27c6` (from `main` @ `330f711`)  
Last completed stage: **In-app token set + token creation (NEW TOKEN SET / NEW TOKEN)**  
Date: 2026-08-10

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
| Type-aware columns | Done | Hex/Color columns only on Color pages; modular column factory |
| **In-app creation** | **Done** | NEW TOKEN SET, NEW TOKEN, empty groups, type-tree fallback |

---

## In-app token set + token creation

### Features
1. **NEW TOKEN SET** (top toolbar) — creates an empty `{}` source document in the workspace (no file upload). Filename normalization lives in [`workspace-file-names.ts`](../client/src/utils/dtcg/workspace-file-names.ts) (not `source-document.ts`).
2. **NEW TOKEN** (group toolbar) — inserts a token of the **current route type** into the selected group via shared `insertTokenInGroup` (same path as context-menu **Add row below** when a row is selected; append when not).
3. **NEW GROUP / Child group** — creates **empty** group containers only (`addGroup`). `addGroupWithToken` remains for convenience elsewhere but is not used by toolbar group buttons.
4. **Group-tree fallback** — normally type-filtered; when zero groups match the active type, UI shows the full hierarchy (rows + empty source groups) so users can pick a cross-type destination. Reverts to filtered tree once a token of the active type exists.
5. **Export guard** — Export disabled until the workspace has at least one token leaf.
6. **Empty draft validation** — import still rejects empty external files (`EMPTY_DOCUMENT`); workspace rebuild uses `validateTokensStrict(doc, { allowEmptyDraft: true })`.

### Architecture decisions
- No `isImported` / `isManual` flags — manual and imported sets share the same `files[]` / `uploadedDocs` source model.
- `activeSourceFileName` in `useTokenWorkspaceTable` targets CRUD at the newly created set (no prior active-file concept existed).
- Resolved view remains derived; only source documents persist.
- Registry `createDefaultValue()` is authoritative for all seven basic types.

### Changed files
- [`workspace-file-names.ts`](../client/src/utils/dtcg/workspace-file-names.ts) — filename normalize / empty doc helper
- [`source-group-tree.ts`](../client/src/utils/dtcg/source-group-tree.ts) — empty group paths from source
- [`grouping.ts`](../client/src/utils/dtcg/grouping.ts) — `buildGroupTreeWithTypeFallback`
- [`structural-validation.ts`](../client/src/utils/dtcg/structural-validation.ts) / [`dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts) — `allowEmptyDraft` option
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — `insertTokenInGroup`, `addGroup`, `deleteGroupFromSource`
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — `createTokenSet`, import gate, `activeSourceFileName`
- [`useTokenTableComponent.ts`](../client/src/composables/useTokenTableComponent.ts) — toolbar wiring, tree fallback, grid selection
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — UI buttons/dialogs
- [`TokenExportDialog.vue`](../client/src/components/TokenExportDialog.vue) — `canExport` prop
- Tests: `create-token-set.test.ts`, `group-tree-type-fallback.test.ts`, `insert-token-in-group.test.ts`

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
