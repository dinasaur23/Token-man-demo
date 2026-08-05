# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-fontfamily-type-7ae8` (continues Stage 15 from `cursor/dtcg-duration-type-7ae8`)  
Stage 16 PR: _(pending)_  
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
Last completed stage: **Stage 16 — fontFamily type**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`
- Font family (§8.3): string | string[]
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
| 15. Duration type | Done | Registry + nav + validate/display/editor; duration CSS-string export |
| 16. fontFamily type | **Done** | Registry + nav + validate/display/editor; CSS font-family list export |
| 17+. Remaining types | **Not started** | fontWeight → cubicBezier |

---

## Stage 16 changes

### Registry
- [`token-types/fontFamily/index.ts`](../client/src/utils/dtcg/token-types/fontFamily/index.ts) — non-empty string / non-empty string[] / curly-brace alias; default `"sans-serif"`; display joins arrays with `, `; parse name / comma-list / JSON array / alias; `navIcon: mdi-format-font`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `fontFamily` beside prior types

### UI
- Nav includes Font Family (`/tokens/fontFamily`)
- Value column uses `parseFontFamilyFromEditor` / `formatFontFamilyForDisplay`
- CRUD row helpers parse/default fontFamily via `"sans-serif"` fallback

### Export
- [`fontFamilyMapping.js`](../server/src/utils/dtcg/exporters/fontFamilyMapping.js) — platforms emit CSS font-family list strings (quote names with spaces); aliases preserved; empty/invalid → `EXPORT_UNSUPPORTED_FONTFAMILY`
- Canonical JSON preserves string / string[] / aliases as authored

### Tests
- [`token-type-registry.fontFamily.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.fontFamily.test.ts)
- Updated nav / color / dimension / number / duration registry expectations
- Server export-split: fontFamily CSS list + structured error cases

---

## Decisions

1. Font family `$value` is a non-empty string or non-empty string[] (DTCG §8.3); curly-brace aliases accepted as references.
2. Default create value is `"sans-serif"`.
3. All platforms emit a CSS font-family list string; arrays are joined and names with spaces are quoted.
4. Font-family array entries must be plain names (aliases inside arrays are rejected).
5. No shared `toExportPrimitive`.

---

## Known limitations (through Stage 16)

1. Remaining basic types (fontWeight, cubicBezier) are not registered.
2. Hex/Color grid columns still appear on non-color pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.
6. Android/Swift fontFamily export uses CSS-like list strings (not platform-native font descriptors).

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 16 files, 141 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 36 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 17 — fontWeight type**:

1. Register `fontWeight` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI for numeric [1,1000] and DTCG named weight aliases per §8.4.
3. Keep export split boundaries; add per-platform fontWeight mapping.
4. Focused tests for fontWeight validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** skip ahead to cubicBezier before fontWeight.
