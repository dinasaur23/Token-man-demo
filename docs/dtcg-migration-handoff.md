# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-effective-type-e607` (continues Stage 5 from `cursor/dtcg-basic-token-types-28cb`)  
Prior PR (Stages 1–5): https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 6 — Effective-type resolution**  
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
| 6. Effective-type resolution | **Done** | Explicit / alias / inherited origins; `MISSING_TYPE`; `ALIAS_TYPE_MISMATCH`; chains |
| 7. Structural validation | **Not started** | Next: `$extends` reject, token+group conflict, wire taxonomy |

---

## Files and modules added or changed (through Stage 6)

### Shared
- [`shared/dtcg-basic-token-types.json`](../shared/dtcg-basic-token-types.json) — application-supported types manifest

### Client — new
- [`client/src/utils/dtcg/token-type-manifest.ts`](../client/src/utils/dtcg/token-type-manifest.ts)
- [`client/src/utils/dtcg/source-document.ts`](../client/src/utils/dtcg/source-document.ts)
- [`client/src/utils/dtcg/resolved-view.ts`](../client/src/utils/dtcg/resolved-view.ts)
- [`client/src/utils/dtcg/token-types/`](../client/src/utils/dtcg/token-types/) — Color-only registry
- [`client/src/utils/dtcg/reference-resolver.ts`](../client/src/utils/dtcg/reference-resolver.ts) — Stage 5
- [`client/src/utils/dtcg/effective-type.ts`](../client/src/utils/dtcg/effective-type.ts) — **Stage 6**
- Tests under [`client/src/utils/dtcg/__tests__/`](../client/src/utils/dtcg/__tests__/)

### Client — modified (earlier stages)
- [`client/src/utils/dtcg/dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts)
- [`client/src/composables/useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts)
- [`client/src/composables/useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts)
- [`client/vite.config.ts`](../client/vite.config.ts)

### Server — new / modified (earlier stages)
- [`server/src/utils/dtcg/allowedTokenTypes.js`](../server/src/utils/dtcg/allowedTokenTypes.js)
- Server characterization + manifest contract tests; `test:unit` script

---

## Stage 5 reminder: reference-resolver API

Module: [`client/src/utils/dtcg/reference-resolver.ts`](../client/src/utils/dtcg/reference-resolver.ts)

- Detection: `isCurlyBraceAlias` / `isJsonPointerRef` / `isLegacyAliasObject` / `isReferenceValue`
- Navigation: `parseJsonPointer`, `getNodeAtSegments`, `classifyReferenceTarget`
- Resolution: `resolveReferenceOnce`, `resolveReferenceFully`
- Errors: `UNRESOLVED_ALIAS` | `CIRCULAR_ALIAS` | `ALIAS_TARGETS_GROUP` | `INVALID_ROOT_USAGE` | `INVALID_VALUE` | `INVALID_POINTER`

Source vs resolved boundary: persist **source** only (`source-document.ts`); rebuild derived view via `buildResolvedWorkspaceView` (`resolved-view.ts`). Never write resolved trees back to Pinia/Mongo.

---

## Stage 6: effective-type API

Module: [`client/src/utils/dtcg/effective-type.ts`](../client/src/utils/dtcg/effective-type.ts)

### Types
- `TypeOrigin`: `'explicit' | 'inherited' | 'alias'`
- `EffectiveTypeErrorCode`: `MISSING_TYPE` | `UNRESOLVED_ALIAS` | `CIRCULAR_ALIAS` | `ALIAS_TARGETS_GROUP` | `ALIAS_TYPE_MISMATCH` | `INVALID_VALUE` | `INVALID_ROOT_USAGE` | `INVALID_POINTER`
- `EffectiveTypeResult`: `{ ok: true, type, origin }` | `{ ok: false, code, message }`

### API
- `getInheritedTypeAtPath(root, pathSegments)` — nearest parent group `$type`
- `resolveEffectiveTypeForLeaf(root, leaf, inheritedType, seen?)` — core resolution
- `resolveEffectiveTypeAtPath(root, pathSegments)` — path convenience wrapper

### Resolution order
1. Explicit leaf `$type` → `origin: 'explicit'`
2. Else reference (curly-brace or JSON Pointer to token / token `$value`) → target effective type → `origin: 'alias'` (chains + cycles via Stage 5 resolver)
3. Else nearest parent group `$type` → `origin: 'inherited'`
4. Else `MISSING_TYPE`

### Type-mismatch
When the leaf has an explicit `$type` **and** `$value` is a resolvable reference whose target effective type differs → `ALIAS_TYPE_MISMATCH`. Matching explicit + alias still returns `origin: 'explicit'`.

Does **not** guess type from value shape. Does **not** start structural validation or remove `string`/`boolean`.

---

## Known limitations (through Stage 6)

1. **Not wired into the live table/CRUD/validator path yet.** UI still uses `dtcg-parser` alias helpers and simple `localType ?? inheritedType` (no alias-type origin).
2. **Structural validation** (`$extends` reject, token+group conflict) not yet applied on import (Stage 7).
3. **Hex-string normalize-into-source** still deferred to color-compliance.
4. **Cross-document references** resolve against the single `root` argument; multi-file merge remains the caller’s job.
5. **JSON Pointer type aliases** only accept pointers to a token object or its `$value` (not deep value properties).

---

## Test commands and results

```bash
# Client (characterization + manifest + source/resolved + registry + reference resolver + effective-type)
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 6 files, 64 tests passed (2026-08-05)

cd client && npm run type-check
# Result: pass

cd client && npm run lint -- src/utils/dtcg/effective-type.ts src/utils/dtcg/__tests__/effective-type.test.ts
# Result: pass (exit 0)

# Server characterization + manifest contract
cd server && npm run test:unit
# Result: 8 tests passed
```

---

## Exact next task

**Stage 7 — Structural validation + error taxonomy (partial)**

Per approved Phase 2 plan (do not expand into UI / exporters / additional types):

1. Structural errors: `TOKEN_AND_GROUP_CONFLICT`; `$extends` → `UNSUPPORTED_BY_APPLICATION`; invalid `$root` / alias-to-group already partially in resolver.
2. Begin wiring validation taxonomy (`INVALID_DTCG_TYPE` vs `UNSUPPORTED_BY_APPLICATION`); **or** stop after structural checks if the stage brief says so.
3. Do **not** remove `string`/`boolean` from live allowlists unless the stage brief explicitly includes error-taxonomy removal.
4. Do **not** start color compliance, generic UI, export split, or non-color token types.

---

## Deviations from the approved plan (to date)

1. **Premature Stage 6** was committed then reverted on the Stage 5 branch; Stage 6 was **re-implemented** on `cursor/dtcg-effective-type-e607` against the approved plan (not a blind restore of `959c3a9`).
2. **Hex-string → source normalize** not done yet (planned for color-compliance).
3. **Reference resolver + effective-type** not yet replacing `dtcg-parser` / validator inheritance in the UI pipeline (additive modules + tests).
4. **PR body updates** via `ManagePullRequest` previously failed on repo casing (`token-man-demo` vs `Token-man-demo`); Stages 1–5 live on PR #2.
5. **Server allowlist** loads the shared manifest but live `TokenController.ALLOWED_TOKEN_TYPES` is not switched over yet.
6. **Conflict with `main`:** Stages 1–5 are **not merged** to `main`. This Stage 6 branch is based on `cursor/dtcg-basic-token-types-28cb`, not `main`.
