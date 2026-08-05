# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-structural-validation-e607` (continues Stage 6 from `cursor/dtcg-effective-type-e607`)  
Stage 7 PR: _(pending)_  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 7 — Structural validation (+ taxonomy helpers)**  
Date: 2026-08-05

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1. Characterization tests | Done | Lock current color convert/validate/parse/alias/display + server CSS flatten |
| 2. Shared type manifest | Done | `shared/dtcg-basic-token-types.json` + client/server loaders + contract tests |
| 3. Source vs resolved model | Done | `source-document.ts` / `resolved-view.ts`; persist source only |
| 4. Color-only registry | Done | `token-types/` with Color registered; validator/CRUD wired; characterization green |
| 5. Reference resolver | Done | Curly-brace + JSON Pointer; reject legacy `{alias}`; `$root`; cycles |
| 6. Effective-type resolution | Done | Explicit / alias / inherited origins; `MISSING_TYPE`; `ALIAS_TYPE_MISMATCH`; chains |
| 7. Structural validation | **Done** | `TOKEN_AND_GROUP_CONFLICT`; `$extends`/`$ref` group reject; taxonomy helpers; ref structural codes |
| 8. Error-taxonomy removal | **Not started** | Next: apply `INVALID_DTCG_TYPE` / remove `string`/`boolean` from live allowlists; report script |

---

## Files and modules added or changed (through Stage 7)

### Shared
- [`shared/dtcg-basic-token-types.json`](../shared/dtcg-basic-token-types.json)

### Client — Stage 7 new
- [`client/src/utils/dtcg/token-validation-error.ts`](../client/src/utils/dtcg/token-validation-error.ts) — taxonomy codes + public message helpers
- [`client/src/utils/dtcg/structural-validation.ts`](../client/src/utils/dtcg/structural-validation.ts) — structural walk
- [`client/src/utils/dtcg/__tests__/structural-validation.test.ts`](../client/src/utils/dtcg/__tests__/structural-validation.test.ts)

### Client — earlier stages
- `effective-type.ts`, `reference-resolver.ts`, `source-document.ts`, `resolved-view.ts`, `token-types/`, characterization + contract tests

---

## Stage 7: structural validation + taxonomy API

### Taxonomy — [`token-validation-error.ts`](../client/src/utils/dtcg/token-validation-error.ts)
- `TokenValidationError` / `TokenValidationErrorCode`
- `classifyDeclaredTokenType(type)` → `INVALID_DTCG_TYPE` (string/boolean/unknown) or `UNSUPPORTED_BY_APPLICATION` (typography, …) or `null` if supported
- Message helpers with approved Phase 2 public wording
- `formatTokenValidationError` → `path: CODE — message`

### Structural — [`structural-validation.ts`](../client/src/utils/dtcg/structural-validation.ts)
- `validateDocumentStructure(doc)` — collect-all, fail-closed result
- `TOKEN_AND_GROUP_CONFLICT` — `$value` + non-`$` children
- `UNSUPPORTED_BY_APPLICATION` — group `$extends` or group-level `$ref` (no target inspection)
- Reference one-hop checks via Stage 5 resolver: `ALIAS_TARGETS_GROUP`, `INVALID_ROOT_USAGE`, `UNRESOLVED_ALIAS`, `INVALID_POINTER`, `INVALID_VALUE` (legacy `{alias}`)
- `EMPTY_DOCUMENT` — non-object root or no `$value` leaves
- `collectDeclaredTypeTaxonomyErrors(doc)` — **opt-in** type taxonomy pass (not applied by structural validation yet)

### Explicitly not done in Stage 7
- Live `dtcg-validator` / CRUD allowlists still accept `string`/`boolean`
- Structural module **not** wired into `validateTokensStrict` / import UI yet
- No report-only migration script yet
- No color compliance / UI / exporters / additional types

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 7 files, 79 tests passed (2026-08-05)

cd client && npm run type-check
# Result: pass

cd client && npm run lint -- src/utils/dtcg/structural-validation.ts src/utils/dtcg/token-validation-error.ts src/utils/dtcg/__tests__/structural-validation.test.ts
# Result: pass

cd server && npm run test:unit
# Result: 8 tests passed
```

---

## Exact next task

**Stage 8 — Error-taxonomy removal (string/boolean) + report script**

1. Wire `classifyDeclaredTokenType` / taxonomy into import validation (`validateTokensStrict` or successor).
2. Remove `string`/`boolean` from live client/server allowlists with precise `INVALID_DTCG_TYPE` messages.
3. Add report-only migration script (`report-unsupported-token-types.js`); **no `--purge`**.
4. Keep characterization updated for the new rejection behavior.
5. Do **not** start color compliance, generic UI, export split, or non-color token types unless the stage brief expands.

---

## Deviations from the approved plan (to date)

1. Plan item 7 bundled structural + taxonomy removal + report script; this stage delivered **structural + taxonomy helpers only**, leaving live string/boolean removal for Stage 8 (per Stage 6 handoff guidance).
2. Hex-string → source normalize still deferred to color-compliance.
3. Reference resolver / effective-type / structural modules still additive (not fully replacing `dtcg-parser` / `dtcg-validator` in the UI pipeline).
4. Server `TokenController.ALLOWED_TOKEN_TYPES` not switched to shared manifest yet.
5. Migration branches are stacked (`…-28cb` → `…-e607` Stage 6 → `…-e607` Stage 7); **not merged to `main`**.
