# DTCG Multi-Type Migration Handoff

Branch: `cursor/token-table-columns-cab3` (continues from `cursor/dimension-visibility-cab3`)  
Token-table columns PR: *(this branch)*  
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
Date: 2026-08-06

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`

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
| UI: group-tree type filter | Done | Tree shows only groups with selected-type tokens; empty state |
| UI: Dimension visibility | Done | Fix empty Dimension tree/rows caused by `extractGroupPath` stripping |
| UI: type-aware grid columns | **Done** | Hex/Color columns only on Color pages; modular column factory |

**All seven application-supported basic DTCG types are registered.**

---

## Type-aware token-table columns

### Root cause
`useTokenGridColumns` always built a static column set that included **Hex** and **Color** (preview picker). Non-color pages (`/tokens/dimension`, `/tokens/cubicBezier`, …) still rendered those Color-specific columns (empty cells).

### Fix
- Pure factory [`token-grid-columns.ts`](../client/src/utils/dtcg/token-grid-columns.ts) builds columns from the active `tokenType`.
- Shared columns for every type: Name, Value, Alias path, Actions.
- Hex + Color preview only when `tokenType === "color"`.
- Value editing still uses registry parse/format per row type (dimension `16px`/`1rem`, duration, fontFamily, fontWeight, cubicBezier, number).
- `useTokenGridColumns` takes a reactive `tokenType` and returns `computed` columnDefs.
- `TokenTableComponent` passes `tokenType` and keys the grid on type so route switches remount columns immediately.
- Color behavior unchanged on `/tokens/color`.

### Changed files
- [`token-grid-columns.ts`](../client/src/utils/dtcg/token-grid-columns.ts) — modular column factory
- [`useTokenGridColumns.ts`](../client/src/composables/useTokenGridColumns.ts) — reactive wrapper
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) — pass tokenType; `:key="tokenType"`
- [`token-grid-columns.test.ts`](../client/src/utils/dtcg/__tests__/token-grid-columns.test.ts) — regressions
- [`docs/dtcg-migration-handoff.md`](../docs/dtcg-migration-handoff.md) — this handoff

### Decisions
1. One shared table component; columns vary by factory — no per-type table duplication.
2. Type-specific value shapes stay in the shared Value column (formatted via registry), not extra unit columns.
3. Color-only columns gated on registry id `"color"` (route `/tokens/color`).

### Limitations (remaining)
1. Branches remain stacked; **not merged to `main`**.
2. Figma plugin / `--purge` / composites unchanged.

---

## Prior fix — Dimension visibility

`extractGroupPath` only strips Tokens Studio type suffixes when a parent collection segment remains, so DTCG-native `spacing.md` keeps `groupPath: ["spacing"]`.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 21 files, 170 tests passed

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

**Basic-type migration + group-tree filter + Dimension visibility + type-aware columns complete.** Optional follow-ups (not started):

1. Merge the stacked Stage 6–18 (+ UI fixes) PRs to `main` in order.
2. Figma plugin multi-type sync (intentionally deferred).
3. `--purge` / destructive migration tooling (intentionally deferred).
4. Composite types (`transition`, etc.) if/when product scope expands.

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
