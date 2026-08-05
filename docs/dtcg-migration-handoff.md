# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-generic-ui-nav-cbd6` (continues Stage 10 from `cursor/dtcg-color-compliance-cbd6`)  
Stage 11 PR: _(pending)_  
Stage 10 PR: https://github.com/dinasaur23/Token-man-demo/pull/7  
Stage 9 PR: https://github.com/dinasaur23/Token-man-demo/pull/6  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 11 — Generic UI + Color nav**  
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
| 11. Generic UI + Color nav | **Done** | `/tokens/:tokenType`; registry nav; Color-only shell; typed create |
| 12+. Export split / types | **Not started** | Follow Phase 2 incremental order |

---

## Stage 11 changes

### Routes
- [`routes.ts`](../client/src/router/routes.ts) — `/tokens/:tokenType` → `TokenTypeContentPage`; `/ColorContentPage` redirects to `/tokens/color`
- Unknown nav segments fall back to `color`

### Generic UI shell
- [`TokenTypeContentPage.vue`](../client/src/pages/TokenTypeContentPage.vue) — route-param type page
- [`TokenTableComponent.vue`](../client/src/components/TokenTableComponent.vue) + [`useTokenTableComponent.ts`](../client/src/composables/useTokenTableComponent.ts) — `tokenType` prop; filter `row.type === tokenType`; create flows pass type from nav
- Color hex/picker columns stay in [`useTokenGridColumns.ts`](../client/src/composables/useTokenGridColumns.ts)
- Thin aliases: `ColorContentPage.vue`, `ColorTableComponent.vue`, `useColorTableComponent.ts`

### Registry-driven nav
- [`NavdrawerComponent.vue`](../client/src/components/NavdrawerComponent.vue) — items from `getRegisteredTokenTypeDefinitions()` (Color only)
- [`DefaultLayout.vue`](../client/src/layouts/DefaultLayout.vue) — drawer re-enabled
- Registry: `navIcon`, `getRegisteredTokenTypeDefinitions`, `getTokenTypeDefinitionByNavPath`

### CRUD create
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — `addTokenToGroup` / `addGroupWithToken` / `addSiblingGroupWithToken` take `tokenType`; defaults from `createDefaultValue()`

### Tests
- [`generic-ui-nav.test.ts`](../client/src/utils/dtcg/__tests__/generic-ui-nav.test.ts)

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 11 files, 111 tests passed

cd client && npm run type-check
# Result: pass

cd server && npm run test:unit
# Result: 13 tests passed
```

---

## Exact next task

Per Phase 2 incremental order after generic UI:

1. **Export split** — canonical source JSON export; per-platform exporters + rem option, then
2. Remaining types one-by-one: dimension → number → duration → fontFamily → fontWeight → cubicBezier.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** build full multi-colorSpace visual editors.

---

## Files to read first (for Stage 12+)

- `docs/dtcg-migration-handoff.md`
- `client/src/components/TokenExportDialog.vue`
- `server/src/utils/dtcg/normalizeDtcgForCss.js`
- `client/src/utils/dtcg/source-document.ts`
- `client/src/utils/dtcg/resolved-view.ts`
- `client/src/composables/useTokenWorkspaceTable.ts`
- `shared/dtcg-basic-token-types.json`

---

## Known limitations (through Stage 11)

1. Effective-type / reference-resolver still not fully replacing `dtcg-parser` alias helpers in the live table path.
2. Visual editors remain sRGB-first; non-sRGB / `"none"` tokens are preserved but limited-edit.
3. Nav/UI shell is Color-only until later type stages register additional definitions.
4. Grid columns remain color-oriented (`useTokenGridColumns`); per-type column factories come with later types.
5. Branches remain stacked; **not merged to `main`**.
