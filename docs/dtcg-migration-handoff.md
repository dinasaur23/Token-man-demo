# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-dimension-type-21a3` (continues Stage 12 from `cursor/dtcg-export-split-21a3`)  
Stage 13 PR: https://github.com/dinasaur23/Token-man-demo/pull/10  
Stage 12 PR: https://github.com/dinasaur23/Token-man-demo/pull/9  
Stage 11 PR: https://github.com/dinasaur23/Token-man-demo/pull/8  
Stage 10 PR: https://github.com/dinasaur23/Token-man-demo/pull/7  
Stage 9 PR: https://github.com/dinasaur23/Token-man-demo/pull/6  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 13 — Dimension type**  
Date: 2026-08-05

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
| 13. Dimension type | **Done** | Registry + nav + validate/display/editor; CSS stringify; Android rem unchanged |
| 14+. Remaining types | **Not started** | number → duration → fontFamily → fontWeight → cubicBezier |

---

## Stage 13 changes

### Registry
- [`token-types/dimension/index.ts`](../client/src/utils/dtcg/token-types/dimension/index.ts) — validate / default `{ value: 0, unit: "px" }` / display `16px` / parse `16px|1rem|{alias}` / `navIcon: mdi-ruler`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `dimension` beside `color`
- Import validation: [`dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts) — `validateRegisteredTypeSubtree` for all registered types

### UI
- Nav drawer auto-includes Dimension via registry (`/tokens/dimension`)
- [`useTokenGridColumns.ts`](../client/src/composables/useTokenGridColumns.ts) — Value column parses dimension via registry
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — display uses `formatDimensionForDisplay`
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — literal/DTCG parse for dimension rows
- Hex / Color picker columns remain color-only

### Export (keeps Stage 12 boundaries)
- [`dimensionMapping.js`](../server/src/utils/dtcg/exporters/dimensionMapping.js) — CSS/Tailwind/Swift emit `Npx`/`Nrem`
- Android rem→dp still requires explicit `remBasePx` (`android/rem.js`)
- Canonical JSON still preserves `{ value, unit }` objects and aliases

### Tests
- [`token-type-registry.dimension.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.dimension.test.ts)
- Updated [`generic-ui-nav.test.ts`](../client/src/utils/dtcg/__tests__/generic-ui-nav.test.ts), color registry test, export-split CSS dimension stringify

---

## Decisions

1. Allowed units are exactly `"px"` and `"rem"` (DTCG §8.2); invalid unit message matches plan wording.
2. Create default is `{ value: 0, unit: "px" }` (unit required at zero).
3. CSS/Tailwind/Swift stringify dimensions; Android keeps object/`remBasePx` policy from Stage 12.
4. No shared `toExportPrimitive` — dimension mapping is per-platform like color.

---

## Known limitations (through Stage 13)

1. Remaining basic types (number, duration, fontFamily, fontWeight, cubicBezier) are not registered.
2. Hex/Color grid columns still appear on Dimension pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 13 files, 120 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 26 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 14 — Number type**:

1. Register `number` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI value editing for JSON numbers.
3. Keep export split boundaries; add per-platform number mapping if needed.
4. Focused tests for number validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** skip ahead to duration/font* before number.
