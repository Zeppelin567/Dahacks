# Deploying 

> **Status: written from the providers' documentation, not yet exercised end to end.** Both services have free tiers and need an account. Nothing here is required for a demo; the app runs from a laptop. Do this when you want a public URL for a submission page. The first person to run through it: fix whatever is off and remove this notice.

Target shape: one Render web service runs the api, which also serves the built SPA (no CORS, one URL). Neon hosts Postgres. The Python side-car is optional and separate (see the end).

## 1. Database: Neon (free)

1. Create a project at [neon.tech](https://neon.tech). The free plan gives 0.5 GB of storage, scales to zero after 5 min idle, wakes in well under a second, and needs no credit card.
2. Copy the **pooled** connection string (it ends in `?sslmode=require`). That is `DATABASE_URL`.
3. There is nothing to migrate by hand: the api runs `api/drizzle/*.sql` on boot against whatever `DATABASE_URL` points to.

Local check before deploying:

```bash
DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" npm run dev -w api   # bash
$env:DATABASE_URL="postgres://…"; npm run dev -w api                             # PowerShell
```

`/api/health` should now report `"db":"postgres"`.

## 2. API + web: Render (free)

Either click **New → Blueprint** and point Render at this repo (it reads [`render.yaml`](render.yaml)), or create a **Web Service** by hand:

| Setting | Value |
|---|---|
| Runtime | Node (Render reads `.node-version` → 24) |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Instance type | Free |

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon string |
| `BETTER_AUTH_SECRET` | `npx auth@latest secret` (or let the blueprint generate one) |
| `BETTER_AUTH_URL` | the service URL Render gives you, e.g. `https://mvp-demo.onrender.com`. Set this after the first deploy, then redeploy |
| `ANTHROPIC_API_KEY` etc. | optional; without them chat stays in mock mode |

Render injects `PORT` and the api reads it. Do not set `WEB_ORIGIN`; in production web and api share the origin.

### Free-tier behaviour you must plan around

- A free web service spins down after 15 minutes without traffic and takes about a minute to wake. Before a demo, open the URL two minutes early, or upgrade to the $7 instance for the event week.
- 750 free instance-hours per month per workspace, which is enough for one always-on-ish service.
- Free instances have no persistent disk, which is why the database is on Neon and not PGlite.

## 3. Verify

```
curl https://<service>.onrender.com/api/health          → {"ok":true,…,"db":"postgres"}
open  https://<service>.onrender.com/                    → landing page
open  https://<service>.onrender.com/docs                → API reference
```

Sign up in the browser; `/api/me` should work; WebSocket (`/app/live`) works over `wss://` automatically because the client derives the scheme from the page.

## 4. Optional: Python side-car on Render

A second service with the Python runtime:

| Setting | Value |
|---|---|
| Build command | `pip install uv && uv sync --directory py` |
| Start command | `uv run --directory py uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Then set `PY_URL` on the api service to the side-car's URL. Render private networking (`http://<service-name>:<port>`) keeps it off the public internet. Verify the exact hostname in Render's dashboard for the service, since this path has not been exercised.

## Elsewhere

Anything that runs a Node process works the same way: `npm ci && npm run build`, then `npm start`, with the env vars above. For a Docker host, a two-stage image (`node:24-alpine`, copy the repo, `npm ci`, `npm run build`, `CMD npm start`) is all it takes. The repo does not include one, to stay Docker-free.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Invalid origin` on sign-in | `BETTER_AUTH_URL` does not match the URL in the browser |
| Sessions vanish after sign-in | `BETTER_AUTH_URL` is `http://` on an `https://` site (cookie `Secure` flag) |
| `relation "user" does not exist` | migrations did not run; check the deploy log for the boot output |
| First request takes a minute | free instance waking up |
| Chat says mock mode in production | the provider key env var is missing on Render |
