# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-number-type-21a3` (continues Stage 13 from `cursor/dtcg-dimension-type-21a3`)  
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
Last completed stage: **Stage 14 — Number type**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`
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
| 14. Number type | **Done** | Registry + nav + validate/display/editor; number→number export |
| 15+. Remaining types | **Not started** | duration → fontFamily → fontWeight → cubicBezier |

---

## Stage 14 changes

### Registry
- [`token-types/number/index.ts`](../client/src/utils/dtcg/token-types/number/index.ts) — finite JSON number / curly-brace alias / JSON Pointer `$ref`; default `0`; display `String(n)`; parse numeric strings + aliases; `navIcon: mdi-numeric`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `number` beside color + dimension
- Removed hard-coded number branch from [`dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts); value checks go through `validateRegisteredTypeSubtree`

### UI
- Nav includes Number (`/tokens/number`)
- Value column uses `parseNumberFromEditor` / `formatNumberForDisplay`
- CRUD row helpers use registry `createDefaultValue()` for registered types

### Export
- [`numberMapping.js`](../server/src/utils/dtcg/exporters/numberMapping.js) — platforms leave finite numbers as numbers; aliases preserved; non-finite → `EXPORT_UNSUPPORTED_NUMBER`
- Canonical JSON preserves numbers + aliases as authored

### Tests
- [`token-type-registry.number.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.number.test.ts)
- Updated nav / color / dimension registry expectations
- Server export-split: number identity + structured error cases

---

## Decisions

1. Number `$value` is a finite JSON number (DTCG §8.7); aliases and JSON Pointer `$ref` accepted as reference forms.
2. Default create value is `0`.
3. Platforms emit numbers as numbers (no stringification).
4. No shared `toExportPrimitive`.

---

## Known limitations (through Stage 14)

1. Remaining basic types (duration, fontFamily, fontWeight, cubicBezier) are not registered.
2. Hex/Color grid columns still appear on non-color pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 14 files, 127 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 29 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 15 — Duration type**:

1. Register `duration` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI for `{ value, unit: "ms"|"s" }`.
3. Keep export split boundaries; add per-platform duration mapping.
4. Focused tests for duration validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** skip ahead to fontFamily/fontWeight/cubicBezier before duration.
