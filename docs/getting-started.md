# Getting started

This guide runs Token Manager on your machine from a clean clone.

You need:

- Node.js `^20.19.0` or `>=22.12.0` (see [`client/package.json`](../client/package.json))
- npm
- a MongoDB instance (local or Atlas)
- Figma Desktop only if you will load the development plugin

The repo has **two npm packages** (`client/` and `server/`). There is no root `package.json`.

## Clone

```bash
git clone https://github.com/dinasaur23/Token-man-demo.git
cd Token-man-demo
```

## Environment variables

Copy the example files. Do not commit real `.env` files.

### Server — [`server/.env.example`](../server/.env.example)

Create `server/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB=token-manager
PORT=8081
```

| Variable | Required | Belongs to | Purpose |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | Server | MongoDB connection string. Atlas `mongodb+srv://…` URIs also work. |
| `MONGO_DB` | No | Server | Database name passed to Mongoose as `dbName`. |
| `PORT` | No | Server | Listen port. Defaults to **8081** if unset. |

The server refuses to start if `MONGO_URI` is missing.

For Atlas, use a connection string like:

```env
MONGO_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net
MONGO_DB=token-manager
```

### Client — [`client/.env.example`](../client/.env.example)

Create `client/.env`:

```env
VITE_API_URL=http://localhost:8081
```

| Variable | Required | Belongs to | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | Yes | Client (Vite) | Base URL of the Express API. The client throws at startup if this is missing. |

Vite also proxies `/api` to `http://localhost:8081` during `npm run dev`. The app still uses `VITE_API_URL` for axios calls, so set it.

CORS on the API already allows the Vite origin `http://localhost:5173` and the Figma plugin UI origin `null`. You do not configure CORS with an environment variable.

## Frontend

From the repo root:

```bash
cd client
npm install
npm run dev
```

Scripts in [`client/package.json`](../client/package.json):

| Script | Command | When to use |
| --- | --- | --- |
| `npm run dev` | `vite` | Local development server |
| `npm run build` | type-check + `vite build` | Production build |
| `npm run preview` | `vite preview` | Preview a production build |
| `npm run test:unit` | `vitest` | Unit tests |
| `npm run lint` | `eslint . --fix` | Lint |
| `npm run format` | `prettier --write src/` | Format `src/` |

The Vite dev server listens on **http://localhost:5173** (Vite default; not overridden in `vite.config.ts`).

## Backend

Open a second terminal from the repo root:

```bash
cd server
npm install
npm start
```

For auto-reload while editing server code:

```bash
npm run dev
```

Scripts in [`server/package.json`](../server/package.json):

| Script | Command | When to use |
| --- | --- | --- |
| `npm start` | `node src/app.js` | Run the API |
| `npm run dev` | `nodemon src/app.js` | Run with reload |
| `npm run lint` | `eslint "src/**/*.js"` | Lint |
| `npm run test:unit` | node test runner | Server unit tests |

The API listens on **http://localhost:8081** unless you set `PORT`.

## Running locally

1. Start MongoDB (or use Atlas and put the URI in `server/.env`).
2. Start the server (`cd server && npm start`).
3. Start the client (`cd client && npm run dev`).
4. Open **http://localhost:5173**.

### Register and log in

1. Open **Sign up** (`/SignUpPage`).
2. Enter **email** and **password**, then **Create account**.
3. You are sent to **Login** (`/LoginPage`). Sign-up does not log you in automatically.
4. Enter the same credentials and **Log in**.
5. You land on **StartPage**, where you create or select a Design System.

After login, see the [User Guide](user-guide.md).

### Figma plugin (optional)

The plugin talks to the **API** (`http://localhost:8081` locally), not to the Vite port. Keep the server running. See [Figma Plugin](figma-plugin.md).
