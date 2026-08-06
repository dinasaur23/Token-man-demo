# DTCG Multi-Type Migration Handoff

Branch: `cursor/export-serialization-cab3` (continues from `cursor/token-table-columns-cab3`)  
Export serialization PR: https://github.com/dinasaur23/Token-man-demo/pull/19  
Token-table columns PR: https://github.com/dinasaur23/Token-man-demo/pull/18  
Dimension visibility fix PR: https://github.com/dinasaur23/Token-man-demo/pull/17  
Post-migration UI PR: https://github.com/dinasaur23/Token-man-demo/pull/16  
Stage 18 PR: https://github.com/dinasaur23/Token-man-demo/pull/15  
Last completed stage: **Stage 18 + UI fixes + per-platform export serialization**  
Date: 2026-08-06

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–18 | Done | Multi-type architecture through cubicBezier |
| UI: group-tree type filter | Done | Tree shows only groups with selected-type tokens |
| UI: Dimension visibility | Done | `extractGroupPath` no longer empties `spacing.*` |
| UI: type-aware grid columns | Done | Hex/Color columns only on Color pages |
| Export: serialization | **Done** | No `[object Object]`; per-platform mappers + safe SD transforms |

---

## Per-platform export serialization fix

### Root cause
Style Dictionary formatters coerce unknown object `$value`s with `String(value)` → **`[object Object]`**.

1. **CSS / Tailwind** — DTCG dimension/duration objects `{ value, unit }` are not handled by `size/rem`; they pass through as objects and become `[object Object]` in `css/variables` unless preparers stringify first (`16px`, `150ms`).
2. **Android** — `mapDimensionValueForAndroid` left `{ value, unit }` / `{ value, unit: "dp" }` objects; default `size/remToDp` cannot serialize them → `[object Object]` in `<dimen>`.
3. **Swift** — default `size/swift/remToCGFloat` treats numbers/`16px` as rem and multiplies by 16 (`16px` → `CGFloat(256)`); CSS-like strings for cubicBezier/fontFamily were emitted unquoted.

Canonical JSON was already correct (keeps structured values); the bug was platform prep + SD transform mismatch.

### Fix
**Per-platform preparers** (not one universal serializer):

| Type | CSS / Tailwind | Swift | Android |
| --- | --- | --- | --- |
| dimension | `16px` / `1rem` | point number (`16`); rem needs `remBasePx` | `8px` / `16dp` strings |
| duration | `150ms` / `0.3s` | seconds number (`0.15`) | `150ms` / `0.3s` strings |
| cubicBezier | `cubic-bezier(...)` | Swift string literal | same CSS string |
| fontFamily | CSS font list | Swift string literal | CSS font list |
| fontWeight | number | number | number |
| number | number | number | number |
| color | hex (existing) | UIColor via SD (existing) | hex8android (existing) |

**SD configs** drop rem-scaling size transforms for Android/Swift/Tailwind so pre-serialized values are not re-multiplied. CSS keeps `transformGroup: "css"` (stringified dims pass through; `cubicBezier/css` remains a safety net).

**Guard:** after mapping, any remaining non-alias object/array `$value` → `EXPORT_UNSERIALIZED_VALUE` error (never silent `[object Object]`).

### Changed files
- `server/src/utils/dtcg/exporters/android/rem.js` — emit `Npx`/`Ndp` strings
- `server/src/utils/dtcg/exporters/dimensionMapping.js` — Swift point numbers + remBasePx
- `server/src/utils/dtcg/exporters/durationMapping.js` — Swift seconds
- `server/src/utils/dtcg/exporters/cubicBezierMapping.js` — Swift quoted literals
- `server/src/utils/dtcg/exporters/fontFamilyMapping.js` — Swift quoted literals
- `server/src/utils/dtcg/exporters/preparePlatform.js` — Swift dim options + unserialized guard
- `server/src/utils/sd/makeCssConfig.js` / `makeTailwindConfig.js` / `makeSwiftConfig.js` / `makeAndroidConfig.js`
- `server/src/utils/dtcg/__tests__/export-serialization.test.js` — E2E SD regressions
- `server/src/utils/dtcg/__tests__/export-split.test.js` — Android string expectations
- `docs/dtcg-migration-handoff.md`

### Decisions
1. Canonical JSON unchanged — structured objects + aliases preserved.
2. Platform exports may resolve aliases (SD) and serialize per target.
3. Android/Swift rem conversion still requires explicit `remBasePx` (never assume 16).
4. No silent `JSON.stringify` of DTCG objects into CSS.

### Limitations (remaining)
1. Branches remain stacked; **not merged to `main`**.
2. Figma plugin / `--purge` / composites unchanged.
3. Android duration/easing land as `<string>` resources (not typed animators).

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 21 files, 170 tests passed

cd client && npm run type-check && npm run lint
# Result: pass

cd server && npm run test:unit
# Result: 57 tests passed (includes Style Dictionary E2E)

cd server && npm run lint
# Result: pass
```

Inspected generated CSS / Tailwind / Swift / Android for all seven types — no `[object Object]`.

---

## Exact next task

Optional follow-ups (not started):

1. Merge stacked PRs to `main` in order.
2. Figma plugin multi-type sync (deferred).
3. `--purge` / destructive migration tooling (deferred).
4. Richer Android typed resources for duration/motion if product requires it.

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
