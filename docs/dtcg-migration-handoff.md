# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-fontweight-type-7ae8` (continues Stage 16 from `cursor/dtcg-fontfamily-type-7ae8`)  
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
Last completed stage: **Stage 17 — fontWeight type**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`
- Font family (§8.3): string | string[]
- Font weight (§8.4): number [1,1000] | named aliases
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
| 16. fontFamily type | Done | Registry + nav + validate/display/editor; CSS font-family list export |
| 17. fontWeight type | **Done** | Registry + nav + validate/display/editor; named→number export |
| 18. Remaining type | **Not started** | cubicBezier |

---

## Stage 17 changes

### Registry
- [`token-types/fontWeight/index.ts`](../client/src/utils/dtcg/token-types/fontWeight/index.ts) — number in [1,1000] / exact-case DTCG names / curly-brace alias; default `400`; display as authored; parse number / name / alias; `navIcon: mdi-format-bold`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `fontWeight` beside prior types

### UI
- Nav includes Font Weight (`/tokens/fontWeight`)
- Value column uses `parseFontWeightFromEditor` / `formatFontWeightForDisplay`
- CRUD row helpers parse/default fontWeight via `400` fallback

### Export
- [`fontWeightMapping.js`](../server/src/utils/dtcg/exporters/fontWeightMapping.js) — platforms emit numeric weights; named aliases resolved to numbers; curly-brace aliases preserved; invalid → `EXPORT_UNSUPPORTED_FONTWEIGHT`
- Canonical JSON preserves numbers / names / aliases as authored

### Tests
- [`token-type-registry.fontWeight.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.fontWeight.test.ts)
- Updated nav / prior registry expectations
- Server export-split: named→number resolution + structured error cases

---

## Decisions

1. Font weight `$value` is a finite number in [1, 1000] or an exact-case DTCG name (DTCG §8.4); curly-brace aliases accepted as references.
2. Default create value is `400`.
3. Platforms emit numeric weights; named aliases are resolved to their DTCG numeric equivalents for CSS compatibility.
4. Named aliases are case-sensitive (`bold` ok, `Bold` rejected).
5. No shared `toExportPrimitive`.

---

## Known limitations (through Stage 17)

1. Remaining basic type (`cubicBezier`) is not registered.
2. Hex/Color grid columns still appear on non-color pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 17 files, 144 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 39 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 18 — cubicBezier type**:

1. Register `cubicBezier` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI for `[P1x, P1y, P2x, P2y]` arrays per DTCG §8.6 (x in [0,1]).
3. Keep export split boundaries; add per-platform cubicBezier mapping.
4. Focused tests for cubicBezier validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`.
