# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-export-split-21a3` (continues Stage 11 from `cursor/dtcg-generic-ui-nav-cbd6`)  
Stage 12 PR: (pending)  
Stage 11 PR: https://github.com/dinasaur23/Token-man-demo/pull/8  
Stage 10 PR: https://github.com/dinasaur23/Token-man-demo/pull/7  
Stage 9 PR: https://github.com/dinasaur23/Token-man-demo/pull/6  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 12 — Export split**  
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
| 12. Export split | **Done** | Canonical source JSON vs per-platform exporters; remBasePx; structured issues |
| 13+. Remaining types | **Not started** | dimension → number → duration → fontFamily → fontWeight → cubicBezier |

---

## Stage 12 changes

### Export split architecture
- Canonical DTCG JSON serializes the **source** document (aliases, hierarchy, metadata, `$extensions`, group `$type` as authored; no color flatten; no invented leaf `$type`)
- CSS / Tailwind / Swift / Android exporters consume the **resolved** view via `preparePlatformExport(platform, doc, options)`
- Shared `normalizeDtcgForCss` is no longer used by live export (kept only for Stage 1 characterization)

### New modules (`server/src/utils/dtcg/exporters/`)
- `exportResult.js` — structured `{ ok, document, warnings[], errors[] }`
- `canonicalJson.js` — `exportCanonicalJson`
- `preparePlatform.js` — per-platform preparers
- `colorMapping.js` — per-platform color→hex mapping with `EXPORT_LOSSY_COLOR` / `EXPORT_UNSUPPORTED_COLOR`
- `android/rem.js` — rem→dp requires explicit `remBasePx` (`EXPORT_REM_BASE_REQUIRED` / `EXPORT_LOSSY_REM`)
- `walkTokens.js` — shared leaf walker

### Controller / UI wiring
- [`TokenController.js`](../server/src/controllers/TokenController.js) — JSON → canonical; platforms → preparers; `remBasePx` query; platform preflight before ZIP headers; `export-report.json` in ZIP when issues exist
- [`TokenExportDialog.vue`](../client/src/components/TokenExportDialog.vue) — Android rem base field; passes `remBasePx`
- [`uploadedResolver.js`](../server/src/utils/dtcg/uploadedResolver.js) — mode value apply no longer special-cases `string`/`boolean` `$type`

### Tests
- [`export-split.test.js`](../server/src/utils/dtcg/__tests__/export-split.test.js) — canonical, platform, aliases, structured errors, Android rem
- [`export-split.test.ts`](../client/src/utils/dtcg/__tests__/export-split.test.ts) — source serialization vs resolved view

---

## Decisions

1. Canonical JSON and platform export are separate entry points; JSON is never described as “resolved.”
2. Lossy platform mappings emit structured warnings; unsupported mappings emit errors and abort (never silent omit/convert).
3. Android rem conversion never assumes `16`; callers must pass `remBasePx`.
4. Each platform owns color mapping call sites (shared hex helper is incidental, not a universal `toExportPrimitive`).
5. Dimension type UI/registry is **not** added in this stage; rem handling exists only in the Android exporter path.

---

## Known limitations (through Stage 12)

1. Platform exporters still leave curly-brace aliases for Style Dictionary to resolve (merged/mode-resolved view, not fully dereferenced).
2. Color→hex for SD remains the current platform emission; alpha / non-sRGB use warnings or errors rather than full multi-space emitters.
3. Visual editors remain sRGB-first; nav/UI shell is Color-only until later type stages.
4. Grid columns remain color-oriented (`useTokenGridColumns`).
5. Branches remain stacked; **not merged to `main`**.
6. `normalizeDtcgForCss` remains for characterization only — do not rewire live export to it.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 12 files, 113 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 25 tests passed

cd server && npm run lint
# Result: pass
```

---

## Exact next task

**Stage 13 — Dimension type** (first remaining basic type):

1. Register `dimension` in the token-type registry (validate / defaults / display / nav).
2. Extend generic UI columns/editors for dimension values (`{ value, unit }`).
3. Keep export split boundaries (canonical source vs platform policy); extend Android/CSS dimension mapping as needed.
4. Focused tests for dimension validate/create/display and export interactions.

Do **not** start Figma plugin refactor. Do **not** add `--purge`. Do **not** build full multi-colorSpace visual editors. Do **not** skip ahead to number/duration/font* before dimension.
