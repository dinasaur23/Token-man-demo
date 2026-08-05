# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-filter-group-tree-7ae8` (continues Stage 18 from `cursor/dtcg-cubicbezier-type-7ae8`)  
Post-migration UI PR: _(pending)_  
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
Last completed stage: **Stage 18 — cubicBezier type** + **group-tree type filter UI fix**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–5 | Done | Characterization, manifest, source/resolved, color registry, reference resolver |
| 6. Effective-type | Done | Explicit / alias / inherited; `MISSING_TYPE`; `ALIAS_TYPE_MISMATCH` |
| 7. Structural validation | Done | `TOKEN_AND_GROUP_CONFLICT`; `$extends` reject; taxonomy helpers |
| 8. Error-taxonomy removal | Done | Live allowlists drop `string`/`boolean`; import gate; report-only script |
| 9. Round-trip preservation | Done | Metadata/extensions/aliases on source writes; source-only persist |
| 10. Color compliance | Done | colorSpace/ranges/`none`/alpha/6-digit hex; hex-string → source normalize |
| 11. Generic UI + Color nav | Done | `/tokens/:tokenType`; registry nav; Color-only shell; typed create |
| 12. Export split | Done | Canonical source JSON vs per-platform exporters; remBasePx; structured issues |
| 13–18 | Done | All seven basic types registered (dimension → cubicBezier) |
| UI: group-tree type filter | **Done** | Tree shows only groups with selected-type tokens; empty state |

**All seven application-supported basic DTCG types are registered.**

---

## Post-migration UI fix — group tree type filter

### Behavior
- Group tree is derived from rows whose effective `type` matches the route token type.
- A group is visible only if it (or a descendant) contains at least one matching token; ancestor paths are preserved.
- Groups that hold only other types are hidden.
- Empty state when the workspace has tokens but none of the selected type.
- Source DTCG documents are never mutated; filtering is view-only.
- Switching types recomputes the tree and resets selection to a valid node.

### Changed files
- [`grouping.ts`](../client/src/utils/dtcg/grouping.ts) — `filterRowsByTokenType`, `buildGroupTreeForTokenType`, `applyGroupNameOverrides`, `collectGroupTreeIds`
- [`useTokenTableComponent.ts`](../client/src/composables/useTokenTableComponent.ts) — type-filtered tree + selection sync + empty-state flag
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — empty-state alert; show tree/grid only when selected type has tokens
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — reuse `applyGroupNameOverrides`
- [`group-tree-type-filter.test.ts`](../client/src/utils/dtcg/__tests__/group-tree-type-filter.test.ts)

### Decisions
1. Classification uses each row’s existing effective `type` (from `collectTokensWithPath` / inherited `$type`) — no value-shape inference.
2. Tree is rebuilt from type-filtered rows (not post-pruned from the full tree) so ancestors of nested matches stay naturally.
3. Color CRUD/display paths are unchanged; Color pages simply no longer list unrelated groups.

### Limitations (unchanged)
1. Hex/Color grid columns still appear on non-color pages.
2. Branches remain stacked; **not merged to `main`**.
3. Figma plugin / `--purge` / composites unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 19 files, 156 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 42 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Basic-type migration + group-tree filter complete.** Optional follow-ups (not started):

1. Merge the stacked Stage 6–18 (+ UI filter) PRs to `main` in order.
2. Hide Hex/Color columns on non-color type pages.
3. Figma plugin multi-type sync (intentionally deferred).
4. `--purge` / destructive migration tooling (intentionally deferred).
5. Composite types (`transition`, etc.) if/when product scope expands.

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
