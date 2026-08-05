# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-cubicbezier-type-7ae8` (continues Stage 17 from `cursor/dtcg-fontweight-type-7ae8`)  
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
Last completed stage: **Stage 18 — cubicBezier type**  
Date: 2026-08-05

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/
- Dimension (§8.2): `{ value, unit: "px" | "rem" }`
- Font family (§8.3): string | string[]
- Font weight (§8.4): number [1,1000] | named aliases
- Duration (§8.5): `{ value, unit: "ms" | "s" }`
- Cubic Bézier (§8.6): `[P1x, P1y, P2x, P2y]`
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
| 17. fontWeight type | Done | Registry + nav + validate/display/editor; named→number export |
| 18. cubicBezier type | **Done** | Registry + nav + validate/display/editor; CSS cubic-bezier() export |

**All seven application-supported basic DTCG types are now registered.**

---

## Stage 18 changes

### Registry
- [`token-types/cubicBezier/index.ts`](../client/src/utils/dtcg/token-types/cubicBezier/index.ts) — `[P1x, P1y, P2x, P2y]` with x in [0,1] / curly-brace alias; default CSS ease `[0.25, 0.1, 0.25, 1]`; display `cubic-bezier(...)`; parse CSS / JSON / comma-list / alias; `navIcon: mdi-vector-curve`
- [`registry.ts`](../client/src/utils/dtcg/token-types/registry.ts) — registers `cubicBezier` (completes basic-type set)

### UI
- Nav includes Cubic Bézier (`/tokens/cubicBezier`)
- Value column uses `parseCubicBezierFromEditor` / `formatCubicBezierForDisplay`
- CRUD row helpers parse/default via ease fallback `[0.25, 0.1, 0.25, 1]`

### Export
- [`cubicBezierMapping.js`](../server/src/utils/dtcg/exporters/cubicBezierMapping.js) — platforms emit `cubic-bezier(P1x, P1y, P2x, P2y)`; aliases preserved; bad arrays → `EXPORT_UNSUPPORTED_CUBICBEZIER`
- Canonical JSON preserves arrays + aliases as authored

### Tests
- [`token-type-registry.cubicBezier.test.ts`](../client/src/utils/dtcg/__tests__/token-type-registry.cubicBezier.test.ts)
- Updated nav / prior registry expectations
- Server export-split: CSS stringify + structured error cases

---

## Decisions

1. Cubic Bézier `$value` is a 4-number array `[P1x, P1y, P2x, P2y]` (DTCG §8.6); P1x/P2x in [0,1]; P1y/P2y any finite number; curly-brace aliases accepted.
2. Default create value is CSS `ease` `[0.25, 0.1, 0.25, 1]`.
3. All platforms emit CSS `cubic-bezier(...)` strings.
4. No shared `toExportPrimitive`.

---

## Known limitations (through Stage 18)

1. Composite / out-of-scope DTCG types (e.g. `transition`, `shadow`, typography composites) are not registered.
2. Hex/Color grid columns still appear on non-color pages (empty for non-color rows).
3. Platform exporters still leave curly-brace aliases for Style Dictionary.
4. Branches remain stacked; **not merged to `main`**.
5. Figma plugin / `--purge` / multi-colorSpace editors unchanged.

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 18 files, 149 tests passed

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

**Basic-type migration complete.** Optional follow-ups (not started):

1. Merge the stacked Stage 6–18 PRs to `main` in order.
2. Figma plugin multi-type sync (intentionally deferred).
3. `--purge` / destructive migration tooling (intentionally deferred).
4. Composite types (`transition`, etc.) if/when product scope expands.
5. UX polish: hide Hex/Color columns on non-color type pages.

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
