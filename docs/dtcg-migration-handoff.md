# DTCG Multi-Type Migration Handoff

Branch: `cursor/dimension-visibility-cab3` (continues from `cursor/dtcg-filter-group-tree-7ae8`)  
Dimension visibility fix PR: *(this branch)*  
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
Last completed stage: **Stage 18 — cubicBezier type** + **group-tree type filter** + **Dimension visibility fix**  
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
| UI: Dimension visibility | **Done** | Fix empty Dimension tree/rows caused by `extractGroupPath` stripping |

**All seven application-supported basic DTCG types are registered.**

---

## Dimension visibility fix

### Root cause
`extractGroupPath` treated names like `spacing` / `colors` as Tokens Studio **type suffixes** and stripped them even when they were the **sole** DTCG top-level group segment.

For common Dimension docs such as:

```json
{ "spacing": { "$type": "dimension", "md": { "$value": { "value": 8, "unit": "px" } } } }
```

path `spacing.md` became `groupPath: []`. `buildGroupTree` skips empty paths, so `/tokens/dimension` showed **no groups and no rows** even though import validation and row typing succeeded. Other types typically use non-suffix group names (or deeper nesting), so they still appeared.

### Fix
Only strip `GENERIC_SUFFIXES` when a parent collection segment remains (slash paths like `MyCollection/spacing.md`). DTCG-native roots such as `spacing.md` / `colors.brand.primary` keep their first segment.

### Changed files
- [`grouping.ts`](../client/src/utils/dtcg/grouping.ts) — suffix strip requires `collectionSegments.length > 1`
- [`dimension-visibility.test.ts`](../client/src/utils/dtcg/__tests__/dimension-visibility.test.ts) — full-pipeline regressions
- [`docs/dtcg-migration-handoff.md`](../docs/dtcg-migration-handoff.md) — this handoff

### Decisions
1. Classification remains effective `type === "dimension"` (registry id / route param); label `"Dimension"` is display-only.
2. Source documents are never mutated; filtering stays view-only.
3. Slash-path Tokens Studio collection/type-suffix behavior is preserved.

### Limitations (unchanged)
1. Hex/Color grid columns still appear on non-color pages.
2. Branches remain stacked; **not merged to `main`**.
3. Figma plugin / `--purge` / composites unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 20 files, 165 tests passed

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

**Basic-type migration + group-tree filter + Dimension visibility complete.** Optional follow-ups (not started):

1. Merge the stacked Stage 6–18 (+ UI filter + Dimension visibility) PRs to `main` in order.
2. Hide Hex/Color columns on non-color type pages.
3. Figma plugin multi-type sync (intentionally deferred).
4. `--purge` / destructive migration tooling (intentionally deferred).
5. Composite types (`transition`, etc.) if/when product scope expands.

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
