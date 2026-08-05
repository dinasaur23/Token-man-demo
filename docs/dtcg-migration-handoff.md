# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-round-trip-cbd6` (continues Stage 8 from `cursor/dtcg-error-taxonomy-e607`)  
Stage 9 PR: _(pending)_  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 9 — Round-trip preservation**  
Date: 2026-08-05

---

## Completed stages

| Stage | Status | Summary |
| --- | --- | --- |
| 1–5 | Done | Characterization, manifest, source/resolved, color registry, reference resolver |
| 6. Effective-type | Done | Explicit / alias / inherited; `MISSING_TYPE`; `ALIAS_TYPE_MISMATCH` |
| 7. Structural validation | Done | `TOKEN_AND_GROUP_CONFLICT`; `$extends` reject; taxonomy helpers |
| 8. Error-taxonomy removal | Done | Live allowlists drop `string`/`boolean`; import gate; report-only script |
| 9. Round-trip preservation | **Done** | Metadata/extensions/aliases on source writes; source-only persist; rebuild resolved |
| 10+. Color compliance / UI / exports / types | **Not started** | Follow Phase 2 incremental order |

---

## Stage 9 changes

### Source write helpers
- [`source-document.ts`](../client/src/utils/dtcg/source-document.ts)
  - `setSourceTokenValueAtPath` — `$value`-only leaf edits; preserves `$type`, `$description`, `$extensions`, `$deprecated`, siblings, group props
  - `mergeColorValuePreservingOptionalFields` — carries forward omitted `alpha` / `hex` from previous color objects
  - `applySourceTokenValueEdit` — immutable map-level single-token edit
  - `rehydrateSourceDocumentsFromPersistence` — round-trip companion to serialize

### CRUD / save path
- [`useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — value / alias / clear-alias updates go through `setSourceTokenValueAtPath`
  - no longer forces `$type` on value-only edits (inherited-type leaves stay typeless)
  - optional color fields preserved when the editor omits them
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — unchanged contract: persist via `serializeSourceDocumentsForPersistence` (source only); rebuild resolved view after edits; never write resolved over source

### Tests
- [`round-trip-preservation.test.ts`](../client/src/utils/dtcg/__tests__/round-trip-preservation.test.ts)
  - **no-edit** serialize → rehydrate deep equality
  - resolved-view mutation must not appear in persistence payload
  - **single-edit** preserves metadata, aliases, hierarchy, group properties, optional color fields
  - inherited-type leaves do not gain invented `$type`

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 9 files, 92 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint -- src/utils/dtcg/source-document.ts src/utils/dtcg/__tests__/round-trip-preservation.test.ts src/composables/useTokenCrud.ts
# Result: pass

cd server && npm run test:unit
# Result: 13 tests passed
```

---

## Exact next task

Per Phase 2 incremental order after round-trip:

1. **Color compliance** (spaces, ranges, `none`, alpha, hex; hex-string → source normalize), then
2. Generic UI + Color nav, export split, then remaining types one-by-one.

Do **not** start Figma plugin refactor. Do **not** add `--purge` to the report script.

---

## Files to read first (for Stage 10+)

- `docs/dtcg-migration-handoff.md`
- `client/src/utils/dtcg/source-document.ts`
- `client/src/utils/dtcg/resolved-view.ts`
- `client/src/utils/dtcg/color-conversion.ts`
- `client/src/utils/dtcg/token-types/color/index.ts`
- `client/src/utils/dtcg/__tests__/round-trip-preservation.test.ts`
- `client/src/utils/dtcg/__tests__/color-characterization.test.ts`
- `client/src/composables/useTokenCrud.ts`
- `client/src/composables/useTokenWorkspaceTable.ts`

---

## Known limitations (through Stage 9)

1. Effective-type / reference-resolver still not fully replacing `dtcg-parser` alias helpers in the live table path.
2. Hex-string normalize-into-source still deferred to color-compliance.
3. Non-color application-supported types are allowed by taxonomy but lack dedicated value validators/UI (registry still Color-only).
4. `uploadedResolver` mode-apply still has string/boolean branches for resolving existing values (not an allowlist).
5. Branches remain stacked; **not merged to `main`**.
