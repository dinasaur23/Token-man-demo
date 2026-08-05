# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-duration-type-7ae8` (continues Stage 14 from `cursor/dtcg-number-type-21a3`)  
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
Last completed stage: **Stage 15 — Duration type**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`
- Duration (§8.5): `{ value, unit: "ms" | "s" }`
- Number (§8.7): JSON number value

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
| 13. Dimension type | Done | Registry + nav + validate/display/editor; CSS stringify; Android rem unchanged |
| 14. Number type | Done | Registry + nav + validate/display/editor; number→number export |
| 15. Duration type | **Done** | Registry + nav + validate/display/editor; duration CSS-string export |
| 16+. Remaining types | **Not started** | fontFamily → fontWeight → cubicBezier |

---

## Stage 15 changes

### Registry
- [`token-types/duration/index.ts`](../client/src/utils/dtcg/token-types/duration/index.ts) — `{ value, unit: "ms"|"s" }` / curly-brace alias; default `{ value: 0, unit: "ms" }`; display `200ms` / `0.3s`; parse `200ms` / `0.3 s` / aliases; `navIcon: mdi-timer-outline`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `duration` beside color + dimension + number

### UI
- Nav includes Duration (`/tokens/duration`)
- Value column uses `parseDurationFromEditor` / `formatDurationForDisplay`
- CRUD row helpers parse/default duration via registry-shaped `{ value, unit: "ms" }`

### Export
- [`durationMapping.js`](../server/src/utils/dtcg/exporters/durationMapping.js) — platforms stringify to `200ms` / `0.3s`; aliases preserved; bad units → `EXPORT_UNSUPPORTED_DURATION`
- [`preparePlatform.js`](../server/src/utils/dtcg/exporters/preparePlatform.js) — duration handled before dimension; heuristics discriminate `ms`/`s` vs `px`/`rem` so shapes are not mis-routed
- Canonical JSON preserves duration objects + aliases as authored

### Tests
- [`token-type-registry.duration.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.duration.test.ts)
- Updated nav / color / dimension / number registry expectations
- Server export-split: duration stringify + structured error + no dimension mis-route

---

## Decisions

1. Duration `$value` is `{ value: number, unit: "ms" | "s" }` (DTCG §8.5); curly-brace aliases accepted as references.
2. Default create value is `{ value: 0, unit: "ms" }`.
3. All platforms emit CSS-like duration strings (`200ms` / `0.3s`); no Android-specific ms-number conversion in this stage.
4. Dimension vs duration heuristics are unit-discriminated (`px`/`rem` vs `ms`/`s`) because both use `{ value, unit }`.
5. No shared `toExportPrimitive`.

---

## Known limitations (through Stage 15)

1. Remaining basic types (fontFamily, fontWeight, cubicBezier) are not registered.
2. Hex/Color grid columns still appear on non-color pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.
6. Android duration export uses CSS-like strings (not native millisecond numbers).

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 15 files, 134 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 33 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 16 — fontFamily type**:

1. Register `fontFamily` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI for font-family string / string-array values per DTCG §8.3.
3. Keep export split boundaries; add per-platform fontFamily mapping.
4. Focused tests for fontFamily validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** skip ahead to fontWeight/cubicBezier before fontFamily.
