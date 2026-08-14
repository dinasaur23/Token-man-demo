# Token Manager

Token Manager is a web app for creating, editing, and exporting **DTCG design tokens** (W3C Design Tokens Format, 2025.10 basic types).

You can **import DTCG JSON** or **create token sets in the app**. From there you can:

- create and edit tokens (CRUD)
- organize tokens into **groups**
- use **aliases** (references)
- keep multiple **token sets** in one Design System
- export **canonical DTCG JSON**
- export platform files (CSS, Tailwind, Swift, Android)
- **sync Figma Variables** into Token Manager via a development plugin

## Documentation

| Guide | Who it is for |
| --- | --- |
| [Getting Started](docs/getting-started.md) | Run the app locally |
| [User Guide](docs/user-guide.md) | Use the Token Manager web app |
| [DTCG Import](docs/dtcg-import.md) | Import DTCG JSON |
| [Figma Plugin](docs/figma-plugin.md) | Sync Figma Variables |
| [Exporting](docs/exporting.md) | Canonical JSON and platform export |
| [Architecture](docs/architecture.md) | Source vs resolved DTCG model |
| [Internal API](docs/api.md) | Application HTTP routes (not a public API) |
| [Examples](examples/README.md) | Importable sample JSON |

## Supported token types

Token Manager treats these DTCG **basic types** as first-class application types:

| Type | `$type` |
| --- | --- |
| Color | `color` |
| Dimension | `dimension` |
| Number | `number` |
| Duration | `duration` |
| Font Family | `fontFamily` |
| Font Weight | `fontWeight` |
| Cubic Bézier | `cubicBezier` |

**Boolean** and generic **String** are intentionally not application token types. Valid DTCG composite types (typography, shadow, and similar) are also outside the current app scope. See [DTCG Import](docs/dtcg-import.md).

## Screenshots

<!-- Add screenshot: Token Manager main UI -->

<!-- Add screenshot: Token set and group tree -->

<!-- Add screenshot: Color token table -->

<!-- Add screenshot: Export dialog -->

<!-- Add screenshot: Figma plugin settings -->

## Tech stack

**Frontend** ([`client/`](client/))

- Vue 3, TypeScript, Vite
- Vuetify, AG Grid, Pinia, Vue Router

**Backend** ([`server/`](server/))

- Node.js, Express
- MongoDB (Mongoose)
- JWT session cookies (plus Bearer tokens for the Figma plugin)

**Token tooling**

- DTCG (W3C Design Tokens Format 2025.10 basic types)
- Style Dictionary (platform export)

**Integration**

- Figma Plugin API
- Figma Variables API

**Deployment**

- Vercel (web client and API)

## Repository structure

```text
client/                 Vue 3 web app (Vite)
server/                 Express API and MongoDB persistence
figma-token-plugin/     Figma development plugin (Token Manager Sync)
shared/                 Shared DTCG type manifest and Figma → DTCG mapping
docs/                   User and contributor documentation
examples/               Importable DTCG JSON samples
scripts/                Generates/embeds the Figma mapping into plugin and server
testing/                Export fixture packages used in validation tests
```

- **`client/`** — UI, token table, client-side DTCG validation, and workspace editing.
- **`server/`** — Auth, Design Systems, workspace persistence, Figma sync, and platform export.
- **`figma-token-plugin/`** — Reads local Figma Variables and posts mapped DTCG to the API.
- **`shared/`** — Source of truth for supported types and Figma mapping (copied into plugin/server).
- **`docs/`** — How to run, use, import, sync, and export. Engineering history lives in [`docs/dtcg-migration-handoff.md`](docs/dtcg-migration-handoff.md).
- **`examples/`** — Small JSON files you can import in the empty-workspace file picker.
- **`scripts/`** — `embed-figma-dtcg-mapping.js` keeps plugin and server copies in sync with `shared/`.
- **`testing/`** — Per-platform fixture packages (CSS, DTCG, Swift, Tailwind, XML) used by tests.

## Quick start

```bash
git clone https://github.com/dinasaur23/Token-man-demo.git
cd Token-man-demo
```

Then follow **[Getting Started](docs/getting-started.md)** to install dependencies, set environment variables, and run the client and server.

Local URLs after a default setup:

- Web app: `http://localhost:5173`
- API: `http://localhost:8081`

## Documentation index

- [Getting Started](docs/getting-started.md)
- [User Guide](docs/user-guide.md)
- [DTCG Import](docs/dtcg-import.md)
- [Figma Plugin](docs/figma-plugin.md)
- [Exporting](docs/exporting.md)
- [Architecture](docs/architecture.md)
- [Internal API](docs/api.md)
- [Examples](examples/README.md)
