# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-platform-serialization-eb90` (continues from `cursor/dimension-visibility-cab3`)  
Platform serialization PR: _(this PR)_  
Dimension visibility fix PR: https://github.com/dinasaur23/Token-man-demo/pull/17  
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
Last completed stage: **Platform-export DTCG serialization** (Style Dictionary adapters + export guard)  
Date: 2026-08-06

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
| 12. Export split | Done | Canonical source JSON vs per-platform exporters; remBasePx; structured issues |
| 13–18 | Done | All seven basic types registered (dimension → cubicBezier) |
| UI: group-tree type filter | Done | Tree shows only groups with selected-type tokens; empty state |
| UI: Dimension visibility | Done | Fix empty Dimension tree/rows caused by `extractGroupPath` stripping |
| **Platform-export serialization** | **Done** | SD adapters for all 7 basics + object-fallthrough export guard |

**All seven application-supported basic DTCG types are registered and platform-serialized.**

---

## Platform-export serialization fix

### Installed Style Dictionary version

- **Before:** `5.1.1` (`package.json` `^5.1.1`)
- **After:** **`5.5.0`** (exact lockfile install)

### Upgrade proposal and migration risks (applied)

Upgraded `5.1.1` → `5.5.0` because **5.4.0+** adds native DTCG 2025.10 **dimension object** handling in built-in size transforms.

Risks accepted / mitigated:

1. **ios `size/remToPt` unit fix (5.4.0):** previously emitted `f` instead of `pt`; we **omit** rem size transforms from `token-manager/ios-swift` and own rem→`CGFloat` via `basePxFontSize`.
2. **Android/Swift rem scaling:** built-in `size/remToDp` / `size/swift/remToCGFloat` treat the numeric part as rem and multiply by 16 even for `px`/`dp` objects — **unsafe for DTCG**. Custom groups omit those transforms.
3. **Duration still broken natively on 5.5.0** (`time/seconds` matches `$type === "time"`, not `"duration"`). Custom `dtcg/*/duration` transforms are required.
4. Prep layer (`preparePlatformExport`) remains defense-in-depth; SD adapters also handle **raw** DTCG input.

### Native-support matrix (Style Dictionary **5.5.0**)

| DTCG type | Native CSS transform group | Reliable for DTCG 2025.10 objects? | Our adapter |
| --- | --- | --- | --- |
| color | `color/css` | Partial (hex / Color() strings; DTCG objects often need hex extract) | `dtcg/*/color` |
| dimension | `size/rem` | **Yes** since 5.4.0 for `{value,unit}` | `dtcg/*/dimension` (kept) |
| duration | `time/seconds` | **No** — filter is `time`, not `duration` → `[object Object]` | `dtcg/*/duration` (**required**) |
| fontFamily | `fontFamily/css` | Yes for string/array | `dtcg/*/fontFamily` |
| fontWeight | _(none)_ | Pass-through primitives only | `dtcg/*/fontWeight` |
| number | _(none)_ | Pass-through finite numbers | `dtcg/*/number` |
| cubicBezier | `cubicBezier/css` | Yes for `[x1,y1,x2,y2]` arrays | `dtcg/*/cubicBezier` |

SCSS: same CSS-compatible serializers (`token-manager/scss`). Not yet a ZIP export format in `TokenController`, but config + adapters are wired.

### Root cause

DTCG object-valued tokens reached Style Dictionary and were stringified with `String(value)` → **`[object Object]`**.

Trace (Dimension `spacing.sm = { value: 8, unit: "px" }`, Duration `motion.duration.fast = { value: 150, unit: "ms" }`):

1. **Source** — canonical DTCG JSON keeps structured `$value` objects / alias strings.
2. **Resolved view / prep** — `preparePlatformExport` can stringify, but Android still leaves some dimension objects for SD; raw paths skip prep.
3. **Style Dictionary input** — `usesDtcg: true`; group `$type` delegated onto leaves.
4. **Transforms (5.1.1 / stock css group):**
   - `size/rem`: `` `${object}`.match(/[^0-9.-]+$/) `` matches `"[object Object]"` and **returns the object unchanged**.
   - `time/seconds`: filter is `$type === "time"` — **duration never matches**.
   - `cubicBezier/css`: arrays → `cubic-bezier(...)` (explains why easing looked fine).
5. **`dictionary.allTokens` / CSS format** — remaining objects become `[object Object]`.

### Custom transforms / groups added

| Transform group | Used by | Notes |
| --- | --- | --- |
| `token-manager/css` | CSS ZIP export | DTCG serializers first, then safe built-ins |
| `token-manager/scss` | ready / tests | Same serializers as CSS |
| `token-manager/tailwind` | Tailwind ZIP | JS module + DTCG serializers; keeps `size/rem`/`color/hex` after |
| `token-manager/android` | Android ZIP | **Omits** `size/remToDp` / `size/remToSp` |
| `token-manager/ios-swift` | Swift ZIP | **Omits** `size/swift/remToCGFloat`; `basePxFontSize: 16` default |

Files:

- `server/src/utils/sd/dtcgValueSerializers.js` — pure serializers (no `JSON.stringify` CSS fallback)
- `server/src/utils/sd/dtcgTransforms.js` — SD hooks + transform groups
- `server/src/utils/sd/exportGuard.js` — fails build on raw object values / `[object Object]` in output
- `server/src/utils/sd/buildPlatformWithDtcgGuards.js` — build + guard helper
- `TokenController` — runs export guard after each `buildAllPlatforms()`

### Remaining limitations

1. Hex/Color grid columns still appear on non-color UI pages.
2. Branches remain stacked; **not merged to `main`**.
3. Figma plugin / `--purge` / composites unchanged.
4. Swift rem→`CGFloat` still uses platform `basePxFontSize` (default 16) — productize explicit `remBasePx` like Android when ready.
5. Android maps `px`→`dp` 1:1 in the SD adapter; rem still requires prep `remBasePx`.
6. SCSS is adapter-ready but not exposed as a first-class export format in the ZIP API yet.

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
# Result: 54 tests passed (includes platform-export-serialization)

cd server && npm run lint
# Result: pass
```

---

## Exact next task

Platform-export object-fallthrough is fixed. Optional follow-ups:

1. Merge the stacked Stage 6–18 (+ UI + Dimension visibility + this serialization) PRs to `main` in order.
2. Hide Hex/Color columns on non-color type pages.
3. Expose SCSS as a ZIP export format using `token-manager/scss`.
4. Productize Swift `remBasePx` (stop relying on SD default 16).
5. Figma plugin multi-type sync / `--purge` / composites (deferred).

Do **not** start Figma plugin refactor or `--purge` unless explicitly requested.
