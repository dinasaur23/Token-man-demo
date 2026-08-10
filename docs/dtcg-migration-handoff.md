# DTCG Multi-Type Migration Handoff

Branch: `cursor/global-token-set-ux-61d6` (from `main`)  
Last completed stage: **Global token-set UX + isolated per-document resolution**  
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
| **Type-scoped groups** | **Done** | Group-level `$type` on NEW GROUP; typed-empty fallback only; toolbar layout |
| **Global token-set UX** | **Done** | Active token-set toolbar/selector; isolated per-document table resolution; path-collision-safe CRUD |

---

## Global token-set UX (this branch)

### Problem
`New token set` lived in the same toolbar as token-type pages, implying token sets were per-type. Display merged all workspace files via `mergeAllDocs`, so colliding paths across files could not be switched reliably.

### Fix
- **Global toolbar:** `Active token set: <file>`, `New token set`, `Export tokens` (export still downloads **all** workspace files).
- **Type-scoped header:** `Token set: <file>` + registry label (`Color tokens`, etc.) above group toolbar.
- **Empty state:** `No token set selected` with import + new token set when workspace has no files.
- **Dialog copy:** `Create token set` + DTCG source-document helper + `File: …json` preview.
- **Isolated resolution:** table/group tree resolve **only** `{ [activeSourceFileName]: doc }` — not post-merge row filtering.
- **Active-aware CRUD:** `findDocContainingPathPreferActive` for edit/delete/duplicate when paths collide across files.
- **`hasAnyTokens`:** counts leaves across all `uploadedDocs` (export guard unchanged semantically).

### Data flow
```
uploadedDocs → activeSourceFileName → single-doc resolve → type filter → group tree + grid
```

### Changed files
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — `resolveAndPopulateActiveSource`, `setActiveSourceFileName`
- [`useTokenTableComponent.ts`](../client/src/composables/useTokenTableComponent.ts) — selector wiring, `activeSourceDocs` for tree fallback
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — prefer-active path lookup
- [`json-path-helpers.ts`](../client/src/utils/dtcg/json-path-helpers.ts) — `findDocContainingPathPreferActive`
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — global toolbar, type header, empty state
- [`TokenExportDialog.vue`](../client/src/components/TokenExportDialog.vue) — “Exports all token sets in this workspace.”
- Tests: `active-token-set-resolution.test.ts`, `json-path-prefer-active.test.ts`, `TokenTableComponent.test.ts`

### Limitations
- Export exports all workspace token sets, not just the active one (UI states this).
- Cross-file aliases unsupported; single-doc resolve does not pull from other files.
- Import replaces entire workspace (unchanged).
- Resolver JSON workspaces with multi-file `$ref` may need dedicated per-file handling in a future task.

### UI polish (layout-only follow-up)
- Global toolbar uses a single flex row with vertically centered active-token-set chip/select, buttons, and export.
- Type heading uses consistent 22px / weight-500 typography; group toolbar spans full content width so **New token** stays far right on desktop.
- Empty-state file input and **New token set** share one aligned flex row; type heading has ~28px top spacing below the global toolbar.

---

## Type-scoped empty groups (this fix)

### Symptom
Creating an empty group (e.g. `primary`) on `/tokens/color` also appeared on Dimension, Number, and every other token-type page.

### Root cause
1. **`addGroup` wrote untyped `{}` containers** — no group-level `$type` in source.
2. **`buildGroupTreeWithTypeFallback` fell back to `buildFullGroupTree`** — which included **all** empty source groups on every type page when no rows matched the active type.
3. **Unfiltered workspace auto-select watch** could fight the type-filtered selection watch.

### Fix
- **`addGroup`** sets DTCG group-level `$type` from the active route token type when creating empty groups (does not overwrite pre-existing `$type` on imported groups).
- **`buildGroupTreeWithTypeFallback`** now falls back **only** to empty source groups whose effective group `$type` matches the active token type. It does **not** expose groups from other types as cross-type creation destinations.
- Row-based **`buildGroupTreeForTokenType`** still handles mixed-type imported groups, ancestor preservation, and groups that gain tokens of another type later.
- Removed unfiltered `groupTreeItems` auto-select watch from `useTokenWorkspaceTable` (selection owned by `useTokenTableComponent`).
- **Toolbar:** `Child group` + `New group` left; `New token` right (`d-flex` + `v-spacer`).

### Changed files
- [`grouping.ts`](../client/src/utils/dtcg/grouping.ts) — typed-empty fallback logic
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — `addGroup(..., tokenType)`
- [`useTokenTableComponent.ts`](../client/src/composables/useTokenTableComponent.ts) — pass route type; new fallback API
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — remove conflicting watch
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — toolbar flex layout
- Tests: [`group-tree-type-fallback.test.ts`](../client/src/utils/dtcg/__tests__/group-tree-type-fallback.test.ts), [`TokenTableComponent.test.ts`](../client/src/components/__tests__/TokenTableComponent.test.ts)

---

## In-app token set + token creation

### Features
1. **NEW TOKEN SET** (top toolbar) — creates an empty `{}` source document in the workspace (no file upload). Filename normalization lives in [`workspace-file-names.ts`](../client/src/utils/dtcg/workspace-file-names.ts) (not `source-document.ts`).
2. **NEW TOKEN** (group toolbar) — inserts a token of the **current route type** into the selected group via shared `insertTokenInGroup` (same path as context-menu **Add row below** when a row is selected; append when not).
3. **NEW GROUP / Child group** — creates **empty** group containers with group-level `$type` set from the active route token type (`addGroup`). `addGroupWithToken` remains for convenience elsewhere but is not used by toolbar group buttons.
4. **Group-tree fallback** — normally type-filtered via token rows; when zero groups match the active type, UI shows **only empty source groups whose group-level `$type` matches the route** (not groups from other types). Reverts to row-based filtered tree once a token of the active type exists under a group.
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
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/ src/components/__tests__/
# 28 files, 221 tests passed

cd client && npm run type-check && npm run lint && npm run build
# pass
```

Manual UI: empty Color group visible on Color only; Dimension page empty until NEW GROUP or a dimension token is added; mixed-type imported groups still appear on all relevant pages; toolbar shows New token on the right.

---

## Exact next task

1. Review and merge PR for global token-set UX to `main`.
2. Do **not** start Figma/`--purge` unless requested.
