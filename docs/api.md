# Internal API

> Internal application API — not guaranteed stable.

These routes are what the Vue app and Figma plugin call today. They are **not** a versioned public API. Paths and payloads can change.

Auth: JWT in an httpOnly cookie (`jwt`) and/or `Authorization: Bearer`. Cookie `Secure` / `SameSite` follow `NODE_ENV`. CORS allows `http://localhost:5173`, `*.vercel.app`, and Figma plugin origin `null`.

Base URL locally: `http://localhost:8081`.

## Auth — `/api/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | No | Create a user. Returns `{ ok, user, token }` and sets the JWT cookie. |
| `POST` | `/api/auth/login` | No | Log in. Same cookie + body token. |
| `GET` | `/api/auth/logout` | No | Clear the JWT cookie. |
| `GET` | `/api/auth/check` | Yes | Session check `{ ok, user }`. |

The Figma plugin uses `POST /api/auth/login` and sends the returned token as Bearer on later calls.

## Design Systems — `/api/design-systems`

All routes require auth.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/design-systems` | List `{ ok, items: [{ id, name, createdAt, updatedAt }] }` |
| `POST` | `/api/design-systems` | Create `{ name }` |
| `PATCH` | `/api/design-systems/:id` | Rename |
| `DELETE` | `/api/design-systems/:id` | Delete the Design System and its `TokenWorkspace` |

## Tokens / workspace — `/api/tokens`

There are **no** per-token REST CRUD routes. The client edits source JSON in memory and persists the whole workspace.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/tokens/workspace?designSystemId=` | Yes | Load workspace (files/token sets, modifiers, overrides, last Figma payload). |
| `PUT` | `/api/tokens/workspace?designSystemId=` | Yes | Save workspace. JSON import and in-app CRUD persist here. |
| `GET` | `/api/tokens/export/:designSystemId?format=&bundle=1&remBasePx=` | Yes | ZIP export. `bundle=1` is required. `format` is `css`, `tailwind`, `swift`, `android`, or `json`. `remBasePx` is for Android rem. |
| `POST` | `/api/tokens/figma-sync?designSystemId=` | Yes | Write mapped Figma DTCG into token set `figma-sync.json`. Body includes `tokens` and optional `importReport` / modifiers. |
| `GET` | `/api/tokens?theme=` | No | Legacy resolver over a server-side `tokens.resolver.json` file. Not the workspace UI. |

`designSystemId` is read from the query string or route params.

## Related docs

- [Getting Started](getting-started.md) — local URLs and env vars
- [Figma Plugin](figma-plugin.md) — plugin calls login, design-systems, figma-sync
- [Exporting](exporting.md) — export query params and ZIP contents
- [Architecture](architecture.md) — what `files[]` means
