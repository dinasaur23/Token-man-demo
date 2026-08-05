# DTCG Multi-Type Migration Handoff

Branch: `cursor/dtcg-basic-token-types-28cb`  
PR: https://github.com/dinasaur23/Token-man-demo/pull/2  
Last completed stage: **Stage 5 — Shared reference resolver**  
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
| 6. Effective-type resolution | **Not started** | Premature commit was reverted; do this next |

---

## Files and modules added or changed (through Stage 5)

### Shared
- [`shared/dtcg-basic-token-types.json`](../shared/dtcg-basic-token-types.json) — application-supported types manifest

### Client — new
- [`client/src/utils/dtcg/token-type-manifest.ts`](../client/src/utils/dtcg/token-type-manifest.ts)
- [`client/src/utils/dtcg/source-document.ts`](../client/src/utils/dtcg/source-document.ts)
- [`client/src/utils/dtcg/resolved-view.ts`](../client/src/utils/dtcg/resolved-view.ts)
- [`client/src/utils/dtcg/token-types/types.ts`](../client/src/utils/dtcg/token-types/types.ts)
- [`client/src/utils/dtcg/token-types/registry.ts`](../client/src/utils/dtcg/token-types/registry.ts)
- [`client/src/utils/dtcg/token-types/color/index.ts`](../client/src/utils/dtcg/token-types/color/index.ts)
- [`client/src/utils/dtcg/token-types/index.ts`](../client/src/utils/dtcg/token-types/index.ts)
- [`client/src/utils/dtcg/reference-resolver.ts`](../client/src/utils/dtcg/reference-resolver.ts) — **Stage 5**
- Tests under [`client/src/utils/dtcg/__tests__/`](../client/src/utils/dtcg/__tests__/)

### Client — modified
- [`client/src/utils/dtcg/dtcg-validator.ts`](../client/src/utils/dtcg/dtcg-validator.ts) — color subtree uses registry `validateColorValue`
- [`client/src/composables/useTokenCrud.ts`](../client/src/composables/useTokenCrud.ts) — color defaults via registry
- [`client/src/composables/useTokenWorkspaceTable.ts`](../client/src/composables/useTokenWorkspaceTable.ts) — persist via `serializeSourceDocumentsForPersistence`
- [`client/vite.config.ts`](../client/vite.config.ts) — allow importing shared manifest from repo root

### Server — new
- [`server/src/utils/dtcg/allowedTokenTypes.js`](../server/src/utils/dtcg/allowedTokenTypes.js)
- [`server/src/utils/dtcg/__tests__/color-export-characterization.test.js`](../server/src/utils/dtcg/__tests__/color-export-characterization.test.js)
- [`server/src/utils/dtcg/__tests__/token-type-manifest.contract.test.js`](../server/src/utils/dtcg/__tests__/token-type-manifest.contract.test.js)

### Server — modified
- [`server/package.json`](../server/package.json) — `test:unit` script

---

## Stage 5: current reference-resolver API

Module: [`client/src/utils/dtcg/reference-resolver.ts`](../client/src/utils/dtcg/reference-resolver.ts)

### Types
- `ReferenceKind`: `'curly-brace' | 'json-pointer'`
- `ReferenceResolutionErrorCode`: `UNRESOLVED_ALIAS` | `CIRCULAR_ALIAS` | `ALIAS_TARGETS_GROUP` | `INVALID_ROOT_USAGE` | `INVALID_VALUE` | `INVALID_POINTER`
- `ReferenceResolutionResult`: `{ ok: true, value, kind, targetPath }` | `{ ok: false, code, message, kind?, targetPath? }`

### Detection helpers
- `isCurlyBraceAlias(value)` — string matching `/{...}/`
- `isJsonPointerRef(value)` — object with string `$ref`
- `isLegacyAliasObject(value)` — object with `alias` string and **no** `$ref`
- `isReferenceValue(value)` — any of the above (including legacy, for callers that need to branch)

### Parsing / navigation
- `parseCurlyBracePath(value)` → inner path or `null`
- `parseJsonPointer(pointer)` → RFC 6901 segments (`#/a/b` or `/a/b`) or `null`
- `tokenPathToSegments` / `segmentsToTokenPath`
- `getNodeAtSegments(root, segments)` — walks objects and array indexes
- `classifyReferenceTarget(root, segments)` → `token` | `group` | `value` | `missing` | `invalid-root`

### Resolution
- `resolveReferenceOnce(root, value, options?)` — one hop
- `resolveReferenceFully(root, value, options?, seen?)` — chains with cycle detection

`ResolveReferenceOptions.requireTokenTargetForCurlyBrace` (default `true`): curly-brace refs that land on a group → `ALIAS_TARGETS_GROUP`.

---

## Supported reference syntax

### Curly-brace token alias (string `$value`)
```json
{ "$value": "{colors.black}" }
{ "$value": "{colors.$root}" }
```
- Targets **tokens** (nodes with `$value`) only.
- `{group}` (group only) → `ALIAS_TARGETS_GROUP` (suggest `{group.$root}`).
- `$root` as the sole path segment → `INVALID_ROOT_USAGE`.

### JSON Pointer reference (object)
```json
{ "$value": { "$ref": "#/colors/black/$value" } }
{ "$value": { "$ref": "#/colors/black/$value/components/0" } }
```
- May address token values, properties, and array elements per DTCG / RFC 6901.
- Unresolved pointer → `UNRESOLVED_ALIAS`.
- Invalid pointer form → `INVALID_POINTER`.

### Legacy non-spec (rejected)
```json
{ "$value": { "alias": "{colors.black}" } }
```
→ `INVALID_VALUE`. Valid `{ "$ref": "..." }` objects are **not** rejected when removing this shape.

---

## Known limitations (Stage 5)

1. **Not wired into the live table/CRUD path yet.** UI still uses `dtcg-parser.ts` `resolveAlias` / `resolveValue`, which still accept legacy `{ alias: "..." }` for characterization backward compatibility. Call-site migration is a later stage (cleanup / round-trip).
2. **Effective-type resolution is not implemented** (Stage 6 — next).
3. **Structural validation** (`$extends` reject, token+group conflict) not yet applied on import (Stage 7).
4. **Hex-string normalize-into-source** still deferred to color-compliance; conversion currently happens on the derived view during populate.
5. **Cross-document references** resolve against the single `root` argument passed in; multi-file merge must be done by the caller (`resolveUploadedDocuments` / resolved view) before invoking this resolver.
6. **`resolveReferenceFully` passthrough** for non-reference values returns `ok: true` with empty `targetPath` and `kind: 'curly-brace'` (convenience); callers should prefer `isCurlyBraceAlias` / `isJsonPointerRef` before resolving when kind matters.

---

## Test commands and results

```bash
# Client (characterization + manifest + source/resolved + registry + reference resolver)
cd client && npm run test:unit -- --run src/utils/dtcg/__tests__/
# Result: 5 files, 48 tests passed (2026-08-05)

cd client && npm run type-check
# Result: pass

cd client && npm run lint -- src/utils/dtcg/reference-resolver.ts src/utils/dtcg/__tests__/reference-resolver.test.ts
# Result: pass (exit 0)

# Server characterization + manifest contract
cd server && npm run test:unit
# Result: 8 tests passed
```

Characterization suite [`color-characterization.test.ts`](../client/src/utils/dtcg/__tests__/color-characterization.test.ts) (20 tests) still passes, including the test that documents current legacy `{alias}` behavior in `dtcg-parser` (to be removed later without breaking Stage 5’s stricter resolver).

---

## Exact next task

**Stage 6 — Effective-type resolution**

Implement [`client/src/utils/dtcg/effective-type.ts`](../client/src/utils/dtcg/effective-type.ts) (do not re-apply the reverted commit blindly; re-implement against the approved plan):

1. Resolve leaf type in order: explicit `$type` → alias/JSON Pointer target type → inherited group `$type` → `MISSING_TYPE`.
2. Preserve `TypeOrigin`: `'explicit' | 'inherited' | 'alias'`.
3. Use the Stage 5 `reference-resolver` for reference hops; do not guess type from value shape.
4. Tests: explicit, inherited, alias (including inherited target), chains, unresolved, circular, JSON Pointer to typed token, `MISSING_TYPE` only after full rules.
5. Do **not** start structural validation or remove `string`/`boolean` in the same change.

---

## Deviations from the approved plan (to date)

1. **Premature Stage 6:** Effective-type was committed then **reverted** so handoff stops cleanly after Stage 5.
2. **Hex-string → source normalize** not done yet (planned for color-compliance); still convert on derived populate path.
3. **Reference resolver not yet replacing** `dtcg-parser` alias helpers in the UI pipeline (additive module + tests only in Stage 5).
4. **PR body updates** via `ManagePullRequest` failed (repo rename casing `token-man-demo` vs `Token-man-demo`); branch is pushed; PR #2 exists.
5. **Server allowlist** loads the shared manifest but live `TokenController.ALLOWED_TOKEN_TYPES` is not switched over yet (error-taxonomy stage).
