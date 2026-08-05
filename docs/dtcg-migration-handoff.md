# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-color-compliance-cbd6` (continues Stage 9 from `cursor/dtcg-round-trip-cbd6`)  
Stage 10 PR: https://github.com/dinasaur23/Token-man-demo/pull/7  
Stage 9 PR: https://github.com/dinasaur23/Token-man-demo/pull/6  
Stage 8 PR: https://github.com/dinasaur23/Token-man-demo/pull/5  
Stage 7 PR: https://github.com/dinasaur23/Token-man-demo/pull/4  
Stage 6 PR: https://github.com/dinasaur23/Token-man-demo/pull/3  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 10 — Color compliance**  
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
| 10. Color compliance | **Done** | colorSpace/ranges/`none`/alpha/6-digit hex; hex-string → source normalize |
| 11+. Generic UI / exports / types | **Not started** | Follow Phase 2 incremental order |

---

## Stage 10 changes

### Color Module 2025.10 validation
- [`token-types/color/color-spaces.ts`](../client/src/utils/dtcg/token-types/color/color-spaces.ts) — supported spaces + component ranges from the Color module table
- [`token-types/color/index.ts`](../client/src/utils/dtcg/token-types/color/index.ts) — `validateColorValue`:
  - allowlisted `colorSpace` (unknown → `INVALID_VALUE`)
  - component arity (3) and per-space ranges
  - exact `"none"` keyword preserved/accepted
  - `alpha` ∈ `[0, 1]`
  - optional `hex` is **6-digit `#RRGGBB` only** on canonical objects
  - plain hex-string `$value` still accepted as documented non-DTCG compat (pre-normalize)

### Hex-string → source normalize
- [`color-conversion.ts`](../client/src/utils/dtcg/color-conversion.ts) — `normalizeHexColorsInSourceDocument` (canonical sRGB object with 6-digit hex)
- [`source-document.ts`](../client/src/utils/dtcg/source-document.ts) — `normalizeHexColorsInSourceDocumentMap`
- [`useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — normalize on file import, sync-from-store, and persist; resolved view never written back

### Tests
- [`color-compliance.test.ts`](../client/src/utils/dtcg/__tests__/color-compliance.test.ts) — spaces, ranges, `none`, alpha, 6-digit hex, hex→source normalize, import gate
- Characterization + round-trip suites remain green

---

## Test commands and results

```bash
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 10 files, 107 tests passed

cd client && npm run type-check
# Result: pass

cd client && npm run lint -- src/utils/dtcg/ src/composables/useTokenWorkspaceTable.ts
# Result: pass

cd server && npm run test:unit
# Result: 13 tests passed
```

---

## Exact next task

Per Phase 2 incremental order after color compliance:

1. **Generic UI + Color nav**, then
2. Export split (canonical source JSON; per-platform exporters), then
3. Remaining types one-by-one: dimension → number → duration → fontFamily → fontWeight → cubicBezier.

Do **not** start Figma plugin refactor. Do **not** add `--purge` to the report script. Do **not** build full multi-colorSpace visual editors (UI remains sRGB-first).

---

## Files to read first (for Stage 11+)

- `docs/dtcg-migration-handoff.md`
- `client/src/utils/dtcg/token-types/color/index.ts`
- `client/src/utils/dtcg/token-types/registry.ts`
- `client/src/utils/dtcg/token-types/types.ts`
- `client/src/composables/useTokenWorkspaceTable.ts`
- `client/src/composables/useTokenCrud.ts`
- `client/src/composables/useTokenGridColumns.ts`
- `client/src/utils/dtcg/__tests__/color-compliance.test.ts`
- `shared/dtcg-basic-token-types.json`

---

## Known limitations (through Stage 10)

1. Effective-type / reference-resolver still not fully replacing `dtcg-parser` alias helpers in the live table path.
2. Visual editors remain sRGB-first; non-sRGB / `"none"` tokens are preserved but limited-edit.
3. Non-color application-supported types are allowed by taxonomy but lack dedicated value validators/UI (registry still Color-only).
4. `uploadedResolver` mode-apply still has string/boolean branches for resolving existing values (not an allowlist).
5. Branches remain stacked; **not merged to `main`**.
