# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-error-taxonomy-e607` (continues Stage 7 from `cursor/dtcg-structural-validation-e607`)  
Stage 8 PR: _(pending)_  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 8 — Error-taxonomy removal + report script**  
Date: 2026-08-05

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–5 | Done | Characterization, manifest, source/resolved, color registry, reference resolver |
| 6. Effective-type | Done | Explicit / alias / inherited; `MISSING_TYPE`; `ALIAS_TYPE_MISMATCH` |
| 7. Structural validation | Done | `TOKEN_AND_GROUP_CONFLICT`; `$extends` reject; taxonomy helpers |
| 8. Error-taxonomy removal | **Done** | Live allowlists drop `string`/`boolean`; import gate; report-only script |
| 9. Round-trip / color compliance / UI / exports / types | **Not started** | Follow Phase 2 incremental order |

---

## Stage 8 changes

### Client import gate
- [`dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts) — `validateDtcgDocument` / `validateTokensStrict` now:
  - run Stage 7 `validateDocumentStructure`
  - apply `collectDeclaredTypeTaxonomyErrors` (`INVALID_DTCG_TYPE` / `UNSUPPORTED_BY_APPLICATION`)
  - accept application-supported types from the shared manifest (including `dimension`, …)
  - keep color subtree validation; number value shape checks
- Type unions updated: `dtcg-parser`, `token-table-types`, CRUD/grid no longer treat `string`/`boolean` as valid token types

### Server allowlist
- [`TokenController.js`](../server/src/controllers/TokenController.js) uses `APPLICATION_SUPPORTED_TYPES` from shared manifest
- Override path no longer hardcodes `$type: "string"` — preserves existing token `$type`

### Report-only script
- [`server/scripts/report-unsupported-token-types.js`](../server/scripts/report-unsupported-token-types.js)
- Helpers: [`reportUnsupportedTokenTypes.js`](../server/src/utils/dtcg/reportUnsupportedTokenTypes.js), `classifyDeclaredTokenType` in [`allowedTokenTypes.js`](../server/src/utils/dtcg/allowedTokenTypes.js)
- Usage:
  ```bash
  node server/scripts/report-unsupported-token-types.js --file path/to/tokens.json
  node server/scripts/report-unsupported-token-types.js   # requires MONGO_URI
  cd server && npm run report:unsupported-types -- --file ../path.json
  ```
- Output: `{ workspaceId, fileName?, path, $type, classification, message }`
- **`--purge` is rejected** (report-only; no destructive migration)

### Characterization updates
- `dimension` is now **accepted** by import validation (application-supported)
- New tests reject `string` / `boolean` / `typography` with approved public wording

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 8 files, 85 tests passed

cd client && npm run type-check
# Result: pass

cd server && npm run test:unit
# Result: 13 tests passed
```

---

## Exact next task

Per Phase 2 incremental order after taxonomy:

1. **Round-trip preservation tests** (metadata/extensions/aliases on source writes), and/or
2. **Color compliance** (spaces, ranges, `none`, alpha, hex; hex-string → source normalize), then
3. Generic UI + Color nav, export split, then remaining types one-by-one.

Do **not** start Figma plugin refactor. Do **not** add `--purge` to the report script.

---

## Known limitations (through Stage 8)

1. Effective-type / reference-resolver still not fully replacing `dtcg-parser` alias helpers in the live table path.
2. Hex-string normalize-into-source still deferred to color-compliance.
3. Non-color application-supported types are allowed by taxonomy but lack dedicated value validators/UI (registry still Color-only).
4. `uploadedResolver` mode-apply still has string/boolean branches for resolving existing values (not an allowlist).
5. Branches remain stacked; **not merged to `main`**.
