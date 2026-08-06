# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-platform-serialization-eb90` (continues from `cursor/dimension-visibility-cab3`)  
Platform serialization PR: https://github.com/dinasaur23/Token-man-demo/pull/20  
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
Last completed stage: **Platform-export runtime path hardened** (`exportTokens` + guard-before-ZIP)  
Date: 2026-08-06

Spec references:
- Format: https://www.designtokens.org/tr/2025.10/format/
- Color module: https://www.designtokens.org/tr/2025.10/color/

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–18 + UI | Done | Basic types, export split, group filter, Dimension visibility |
| Platform SD adapters | Done | `token-manager/*` transforms + SD 5.5.0 |
| **Runtime export path** | **Done** | Real `exportTokens` uses adapters; ZIP only after guard; UI shows errors |

---

## True runtime root cause (Export Tokens button)

### Path the UI actually calls

1. **Frontend** [`TokenExportDialog.vue`](../client/src/components/TokenExportDialog.vue)  
   `GET ${VITE_API_URL}/api/tokens/export/:designSystemId?format=css|tailwind|swift|android|json&bundle=1`
2. **Route** [`TokenRoutes.js`](../server/src/routes/TokenRoutes.js) → `exportTokens`
3. **Controller** [`TokenController.exportTokens`](../server/src/controllers/TokenController.js)

### What the **deployed / `main`** app still runs (bug)

| Step | Code on `main` | Effect |
| --- | --- | --- |
| Prep | `normalizeDtcgForCss` | **Colors only** (hex extract). Dimension/duration objects unchanged. |
| SD config | `createSdConfig` → `transformGroup: "css"` | Built-in group only |
| SD version | `5.1.1` | Dimension objects → `[object Object]`; `time/seconds` matches `time` not `duration` |
| Guard | none | Invalid ZIP still downloads |
| ZIP timing | headers + `archive.pipe(res)` **before** SD build | Failures cannot return clean JSON to the UI |

Proven reproduction of the `main` path (normalize + built-in `css` group) still yields:

```css
--motion-duration-fast: [object Object];
```

(With SD 5.5.0 alone, dimension may serialize natively, but **duration remains broken** without custom transforms.)

### What this branch runs (fix)

| Step | Code | Effect |
| --- | --- | --- |
| Prep | `preparePlatformExport(format, …)` | Stringifies all seven basic types (platform policy) |
| SD config | `transformGroup: "token-manager/<platform>"` | Custom serializers first |
| Registration | `ensureDtcgTransformsRegistered()` on StyleDictionary class + config hooks | Transforms exist before build |
| Build | `runStyleDictionaryExport` | Shared runner used by controller |
| Guard | scans **final generated files** for `[object Object]` / raw objects | Hard fail |
| ZIP | **Only after** all builds + guard succeed | UI gets JSON 400 on failure |
| UI | parses JSON error blob → `v-alert` | Clear message, no silent bad download |

Diagnostics (when `DEBUG_EXPORT=1`): exporter name, `transformGroup`, registered `dtcg/*` transform names, token path/type/value before→after.

### Installed Style Dictionary

**5.5.0** (lockfile). Native dimension objects since 5.4.0; **duration still unsupported natively**.

### Native-support matrix (5.5.0) — unchanged

| Type | Native reliable? | Adapter |
| --- | --- | --- |
| dimension | Yes (5.4+) | `dtcg/*/dimension` kept |
| duration | **No** (`time` ≠ `duration`) | `dtcg/*/duration` required |
| cubicBezier / fontFamily | Yes | kept |
| color / number / fontWeight | Partial / pass-through | kept |

### Remaining limitations

1. Stacked branches not merged to `main` — **production still serves the old `normalizeDtcgForCss` + `css` group path** until merge/deploy.
2. Hex/Color columns on non-color UI pages.
3. SCSS adapters ready; not a ZIP format in the dialog yet.
4. Swift rem uses `basePxFontSize` default 16.
5. Prep + `fontFamily/css` can double-quote some family lists (cosmetic).

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# 20 files, 165 tests passed

cd client && npm run type-check && npm run lint
# pass

cd server && npm run test:unit
# 60 tests passed (includes exportTokens.integration.test.js)

cd server && npm run lint
# pass
```

Integration coverage calls the **real** `exportTokens` controller (mocked `TokenWorkspace.findOne` only): CSS seven types, JSON canonical structure, token-manager groups, JSON 400 without ZIP on prep failure, final-file guard, tailwind/swift/android.

---

## Exact next task

1. Merge stacked PRs through this branch to `main` and redeploy so production leaves `normalizeDtcgForCss` + built-in `css`.
2. Optional: hide Hex/Color columns; SCSS ZIP format; Swift remBasePx productization.
3. Do **not** start Figma/`--purge` unless requested.
