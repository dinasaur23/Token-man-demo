# Figma plugin

The **Token Manager Sync** plugin copies **local Figma Variables** into a Token Manager Design System as a DTCG source document (`figma-sync.json`).

```text
Figma Variables  →  plugin mapping  →  Token Manager API  →  DTCG token set
```

You need:

- Figma **Desktop** (development plugins)
- a Token Manager account and Design System
- the API running (local or deployed)

## Install the development plugin

1. Open **Figma Desktop**.
2. Menu: **Plugins → Development → Import plugin from manifest…**
3. Choose:

```text
figma-token-plugin/manifest.json
```

The plugin menu has two commands:

- **Token Manager settings** — API URL, login, Design System
- **Sync Figma Variables** — run the import

After you change `code.js` or `ui.html`, use **Plugins → Development → Reload** (or re-import the manifest).

## Connect the plugin

Open **Token Manager settings**.

### API URL

The field placeholder is the deployed API. For local work, set:

```text
http://localhost:8081
```

Use the **API** origin, not the Vite app (`5173`). The plugin must be allowed to reach that host:

| Environment | URL | Manifest field |
| --- | --- | --- |
| Local | `http://localhost:8081` | `devAllowedDomains` |
| Deployed | `https://token-manager-ecru.vercel.app` | `allowedDomains` |

### Login

Use the same **email** and **password** as the web app. The plugin `POST`s `/api/auth/login` and stores the returned JWT in Figma `clientStorage` (`tm_jwt`). It does not store your password.

### Select a Design System

After login, the plugin loads `GET /api/design-systems`. Pick the Design System you created in the web app.

### Save settings

**Save settings** stores:

- API URL (`tm_apiUrl`)
- JWT (`tm_jwt`)
- Design System id for **this Figma file** (`tm_fileConfig`)

Then run **Sync Figma Variables**. Reload the Token Manager workspace to see `figma-sync.json` as a token set.

## Supported Figma mappings

Mapping uses **resolvedType + scopes only**, never the variable name. Shared source: [`shared/figma-dtcg-mapping/`](../shared/figma-dtcg-mapping/).

| Figma | DTCG |
| --- | --- |
| COLOR | `color` |
| FLOAT + dimensional scope | `dimension` |
| remaining FLOAT | `number` |
| STRING + FONT_FAMILY | `fontFamily` |
| FLOAT + FONT_WEIGHT | `fontWeight` |
| TIMING | `duration` |
| explicit cubic-bezier easing with actual control points | `cubicBezier` |

FLOAT priority: `FONT_WEIGHT` first, then dimensional scopes, otherwise `number`.

**Dimensional FLOAT** scopes (`WIDTH_HEIGHT`, `GAP`, `CORNER_RADIUS`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`, `STROKE_FLOAT`, `EFFECT_FLOAT`) become `{ "value": n, "unit": "px" }`. Figma has no DTCG unit; import warns `DIMENSION_NORMALIZED_TO_PX`.

**TIMING** values are Figma seconds and are stored as `{ "value": n, "unit": "s" }` (not converted to milliseconds).

**EASING** becomes DTCG `cubicBezier` only when Figma exposes explicit control points (`easingFunctionCubicBezier` with numeric `x1`, `y1`, `x2`, `y2`, typically `CUSTOM_CUBIC_BEZIER`):

```text
x1, y1, x2, y2
→
[x1, y1, x2, y2]
```

COLOR is stored as sRGB objects (`colorSpace: "srgb"`, components 0–1, optional alpha, 6-digit `hex`). Variable aliases become curly-brace paths such as `{primitives.brand.primary}`.

## Unsupported Figma mappings

These are **skipped** with a structured reason (`UNSUPPORTED_FIGMA_MAPPING` or similar). They are not silently converted.

| Figma | Why it is skipped |
| --- | --- |
| Boolean | No supported DTCG basic mapping |
| Generic String (no `FONT_FAMILY` scope, including `FONT_STYLE` / `TEXT_CONTENT`) | No supported DTCG basic mapping |
| Spring easing | No lossless cubic-bezier control points |
| HOLD | No lossless cubic-bezier control points |
| Preset easing without explicit control points | Named presets are not invented as Bézier points |

Other skip reasons: `INVALID_VALUE`, `UNRESOLVED_ALIAS` (alias target not in this import), `EMPTY_NAME`, `NO_VALUE`.

A duration-like **name** on a generic FLOAT does **not** become `duration`. A cubic-bezier-like **string** does **not** become `cubicBezier`.

## Example Figma test collection

Create a collection named **Brand** with these variables, then sync.

| Variable name | Figma type | Scope / kind | Value |
| --- | --- | --- | --- |
| `brand/primary` | COLOR | — | `#3079B0` |
| `spacing/md` | FLOAT | GAP | `16` |
| `opacity/disabled` | FLOAT | OPACITY | `0.8` |
| `typography/family/body` | STRING | FONT_FAMILY | `Inter` |
| `typography/weight/bold` | FLOAT | FONT_WEIGHT | `700` |
| `motion/duration/fast` | TIMING | — | `0.25s` |
| `motion/easing/custom` | EASING | CUSTOM_CUBIC_BEZIER with points | `0.4, 0, 0.2, 1` |

Expected Token Manager pages:

| Variable | DTCG `$type` | Page |
| --- | --- | --- |
| `brand/primary` | `color` | Color |
| `spacing/md` | `dimension` | Dimension (`16px`) |
| `opacity/disabled` | `number` | Number |
| `typography/family/body` | `fontFamily` | Font Family |
| `typography/weight/bold` | `fontWeight` | Font Weight |
| `motion/duration/fast` | `duration` | Duration (`0.25` + unit `s`) |
| `motion/easing/custom` | `cubicBezier` | Cubic Bézier `[0.4, 0, 0.2, 1]` |

The collection name becomes the top-level JSON group (slugified). Variable path segments nest under it. Syncing **Brand** + `brand/primary` therefore yields `brand.brand.primary`. A ready-made file with this shape: [`examples/figma-like-tokens.json`](../examples/figma-like-tokens.json).

## Troubleshooting

### `Failed to fetch`

The plugin UI cannot reach the API URL. Check:

- API URL spelling and scheme (`http` vs `https`)
- server actually running on that host/port
- local vs production URL (below)
- Figma network allowlist in `manifest.json`

### Plugin login fails

Use credentials that work on the web app. Sign up in the browser first; the plugin only logs in. After login, Design Systems must already exist (create them on StartPage).

### CORS `Origin: null`

Figma plugin UI iframes send `Origin: null`. The API allowlist includes that origin. If you run a custom API that is not this server, login/sync fetches will fail even when the URL is reachable.

### Wrong Design System selected

Settings are **per Figma file**. Open **Token Manager settings**, pick the Design System, **Save settings**, then sync. Sync writes `figma-sync.json` in that Design System only.

### Unsupported variable type

Open the plugin sync report. Skipped variables list a reason. Boolean, generic strings, springs, HOLD, and presets without control points will not appear as tokens.

### Local vs production API URL

| Goal | API URL |
| --- | --- |
| Local server | `http://localhost:8081` |
| Deployed backend | `https://token-manager-ecru.vercel.app` |

A local plugin pointed at production will not see local Design Systems, and vice versa.

### Development plugin reload

After pulling mapping changes, reload the plugin (or re-import the manifest). Mapping is embedded from [`shared/figma-dtcg-mapping/`](../shared/figma-dtcg-mapping/) via [`scripts/embed-figma-dtcg-mapping.js`](../scripts/embed-figma-dtcg-mapping.js); do not hand-edit the generated block in `code.js`.
