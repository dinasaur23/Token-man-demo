# DTCG Multi-Type Migration Handoff

Branch: `cursor/token-row-ordering-087b` (from `main` @ `840332a`)  
Row-ordering fix PR: https://github.com/dinasaur23/Token-man-demo/pull/21  
Merged platform serialization: https://github.com/dinasaur23/Token-man-demo/pull/20 (`840332a`)  
Optional open: https://github.com/dinasaur23/Token-man-demo/pull/18 (Hex/Color columns — do not touch here)  
Do **not** merge: https://github.com/dinasaur23/Token-man-demo/pull/19 (superseded by #20)  
Last completed stage: **Token row-ordering fix (add/duplicate insert-below)**  
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
| **Row ordering** | **Done** | Add/duplicate insert below source; stable `getRowId`; source sibling order authoritative |

---

## Token row-ordering bug (fixed on this branch)

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
- `client/src/utils/dtcg/row-ordering.ts` (new)
- `client/src/utils/dtcg/__tests__/row-ordering.test.ts` (11+ regression cases)
- `client/src/composables/useTokenCrud.ts`
- `client/src/composables/useTokenWorkspaceTable.ts`
- `client/src/components/TokenTableComponent.vue`
- `client/src/utils/dtcg/token-table-types.ts` (`sourceFile` on `TableRow`)

---

## Remaining limitations

1. Hex/Color columns on non-color UI pages (PR #18 still open).
2. SCSS adapters ready; not a ZIP format in the dialog yet.
3. Swift rem uses `basePxFontSize` default 16.
4. Prep + `fontFamily/css` can double-quote some family lists (cosmetic).
5. Redeploy production after merge so Vercel serves this fix.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# 21 files, 178 tests passed (includes row-ordering)

cd client && npm run type-check && npm run lint
# pass

cd server && npm run test:unit
# 60 tests passed

cd server && npm run lint
# pass
```

Manual UI (local): signup → upload `tokens.json` → Color table → duplicate / add-below ×5+ on middle rows; switch Number→Color; new rows always directly below source, never at top.

---

## Exact next task

1. Merge this row-ordering PR to `main` and redeploy frontend (`token-mananger-frontend`) + backend (`token-manager`) if needed.
2. Optional: rebase/merge PR #18 (type-aware columns) separately.
3. Close PR #19 without merging.
4. Do **not** start Figma/`--purge` unless requested.
