# BikeMap Cupertino (DAHacks 5.0)

Two bike maps for Cupertino: a Safe route map and a Green route map with a City ↔ Rural slider.

## Tech plan

The whole plan is in **[.plans/actualproject.md](.plans/actualproject.md)**: product, team, contract, and the Safe route pipeline (decided 2026-10-16).

- **Safe route**
  - Every street and intersection gets a 1–10 safety score. Street View photos plus OSM and City of Cupertino facts go to Claude (vision), which returns the score.
  - Routing runs Dijkstra on "felt distance" (λ = 3, intersection penalty 20 m per point, 50% detour cap).
  - Real CCRS bike crashes are used only to validate the scores, never to compute them.
  - Pipeline:

    ```
    py/scripts/1_build_graph.py → 2_photos.py → 3_score.py --layer safe|green → 4_bake.py → py/data/cupertino_bike.graphml
    ```

    The graph and scores are committed. Photos, raw LLM replies and keys are not.
- Scoring spec (prompts, schemas, bake-off): [.plans/scoring-spec.md](.plans/scoring-spec.md)
- Reference project (Aggie Street Smart): [referenceproject.md](referenceproject.md)

```
npm install && npm run dev:py   # Python side-car
npm run dev                     # http://localhost:5173/safe
```

> Built on **MVP_demo** (github.com/blar-tw/MVP_demo, MIT), a generic starter written before the event.
> Everything under `py/app/bikemap/`, `web/src/bikemap/` and `web/src/pages/{safe,green}-route.tsx` was built during DAHacks 5.0.
> The rest of this README is the starter's original documentation.

---

# MVP Demo: a hackathon starter that already does the boring parts 

It bundles auth, database, typed API with live docs, realtime, streaming LLM chat, API keys for scripts and hardware, and an optional Python side-car, wired together so a team can spend the 48 hours on the idea rather than on plumbing.

No topic is baked in. Everything user-visible comes from one config file.

```
git clone https://github.com/blar-tw/MVP_demo.git my-hack && cd my-hack
npm install
npm run dev           # web http://localhost:5173  ·  api http://localhost:3000  ·  docs http://localhost:5173/docs
```

That is the whole setup. You do not need Docker, an account, or a `.env` file: the database is an embedded Postgres (PGlite) and the LLM runs in mock mode until you add a key.

```
npm run db:seed       # demo account demo@example.com / demo1234! with three items
npm run dev:py        # optional Python service (needs uv) → /app/python
```

## What you get

| Module | Where | Try it |
|---|---|---|
| **Auth**: email + password, sessions, route guard | `api/src/auth.ts`, `web/src/pages/login.tsx` | Sign up at `/signup` |
| **CRUD template**: `items` end to end, table → API → typed client → form | `api/src/routes/items.ts`, `web/src/pages/items.tsx` | `/app/items` |
| **API docs**: generated from the Zod schemas, with "try it" in the browser | `shared/src/*.ts` | `/docs` |
| **API keys**: call the same API from Python, a bot, or an ESP32 | `web/src/pages/api-keys.tsx`, `examples/add_item.py` | `/app/api-keys` |
| **Realtime**: native WebSocket, channels, presence | `api/src/realtime/`, `web/src/lib/realtime.ts` | `/app/live` in two tabs |
| **LLM chat**: Vercel AI SDK, provider switch, mock fallback | `api/src/routes/chat.ts`, `web/src/pages/chat.tsx` | `/app/chat` |
| **Python side-car**: FastAPI behind the api, shares auth | `py/app/main.py`, `api/src/routes/py.ts` | `/app/python` |
| **UI kit**: shadcn/ui, sidebar, dark mode, mobile | `web/src/components/ui/` | everywhere |

## First 10 minutes at a hackathon

1. **Rename it.** Edit [`web/src/app.config.ts`](web/src/app.config.ts): name, tagline, logo, brand color, and which modules show in the sidebar. Commit. The landing page and app shell are now yours.
2. **Model your thing.** Copy the `items` chain and rename it: [`api/src/db/schema.ts`](api/src/db/schema.ts) → `npm run db:generate` → [`shared/src/items.ts`](shared/src/items.ts) → [`api/src/routes/items.ts`](api/src/routes/items.ts) → [`web/src/lib/items.ts`](web/src/lib/items.ts) + [`web/src/pages/items.tsx`](web/src/pages/items.tsx). Each file says what to change at the top.
3. **Add your key.** `cp .env.example .env`, set `ANTHROPIC_API_KEY` (or another provider + `LLM_PROVIDER`). Restart the api. The chat badge flips from *mock mode* to the model name.
4. **Delete what you don't need.** Turn a module off in `app.config.ts` first (instant); delete its files later if ever.

If your sponsor credits are for a different LLM vendor, set `LLM_PROVIDER=openai` (or `google`) plus that vendor's key. Nothing else changes.

## Layout

```
shared/   Zod schemas + types shared by api and web (also the OpenAPI source of truth)
api/      Hono server: auth, routes, realtime hub, Python proxy, Drizzle schema + migrations, tests
web/      React + Vite SPA: pages per module, typed API client, realtime hook, shadcn/ui
py/       Optional FastAPI service (uv project) — only reachable through api at /api/py/*
examples/ Scripts that talk to the API from outside the browser
docs/     DECISIONS.md — why things are the way they are
```

Browser → `web` → (HTTP + WebSocket, same origin) → `api` → Postgres, and optionally → `py`. In development Vite proxies `/api` and `/docs` to the api, so there is never CORS to configure. In production the api serves the built SPA itself, so there is one process and one URL.

## Commands

| Command | What |
|---|---|
| `npm run dev` | api (`node --watch` + tsx) + web (Vite) with hot reload |
| `npm run smoke:dev` | boots `npm run dev` and checks health, docs and sign-in through :5173 |
| `npm run dev:py` | Python side-car with auto-reload (`uv run uvicorn …`) |
| `npm run check` | lint + typecheck + tests + build; **run before leaving for the venue** |
| `npm run check:py` | ruff + pytest for `py/` and `examples/` |
| `npm test` | api tests (in-memory Postgres; ~5 s) |
| `npm run db:generate` | write a migration after editing `schema.ts` (applied on next start) |
| `npm run db:seed` / `db:reset` | demo data / wipe local database |
| `npm run build && npm start` | production mode locally: `http://localhost:3000` serves everything |
| `npm run lint:fix` / `format` | Biome |

## Configuration

Everything has a working default; `.env` at the repo root overrides it. See [`.env.example`](.env.example).

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | *(unset → PGlite in `api/.data`)* | any Postgres URL (Neon, Supabase, Render, local) |
| `BETTER_AUTH_SECRET` | dev string | **set in production**: `npx auth@latest secret` |
| `BETTER_AUTH_URL` | `http://localhost:3000` | public URL of the api in production |
| `LLM_PROVIDER` / `LLM_MODEL` | `anthropic` / `claude-opus-5` | `openai`, `google`, or `mock` |
| `ANTHROPIC_API_KEY` … | *(unset → mock mode)* | the chosen provider's key |
| `PY_URL` | `http://localhost:8000` | where the Python service listens |
| `PORT` | `3000` | api port (Render sets this) |

## Calling the API from outside the browser

Create a key at `/app/api-keys`, then:

```bash
curl http://localhost:3000/api/items -H "x-api-key: mvp_…"
uv run examples/add_item.py --key mvp_… "Hello from Python"     # appears live in the Items and Live pages
```

Every route in `/docs` accepts either the session cookie or `x-api-key`. WebSocket clients connect to `ws://…/api/ws` with the same header. [`api/AUTH.md`](api/AUTH.md) explains how auth works end to end.

## Deploying

[`DEPLOY.md`](DEPLOY.md) covers Render (api + web in one service) and Neon (Postgres), both on free tiers. Deployment is not on the critical path: demos run fine from a laptop.

## Rebuilding without this repo

[`REBUILD.md`](REBUILD.md) is a step-by-step prompt sequence for a coding agent, with a machine-checkable done condition per step, in the order this repo was actually built. Use it when hackathon rules require starting from an empty folder.

## Manual check (5 minutes)

After `npm run check` is green, click through once, since the automated tests do not open a browser:

1. `npm run dev`, open `http://localhost:5173` → landing page shows your name/tagline; theme toggle works.
2. Sign up → lands on `/app`; dashboard shows **API connected · db: pglite**; sidebar lists the enabled modules.
3. Items: create, edit, delete; filter by status; search.
4. API keys: create a key, copy the `curl` snippet, run it in a terminal → JSON.
5. Live: open in a second tab → "2 connected clients"; send a message → appears in both. Run the Python example → `items.created` shows up and the Items page updates without reload.
6. Chat: badge says *mock mode*; a message streams back an echo. With a key in `.env`: real replies.
7. Python: `npm run dev:py` → badge turns *running*; upload a PNG → JSON with width/height.
8. `npm run build && npm start` → `http://localhost:3000/app/items` renders (SPA fallback), `/api/nope` is a JSON 404.
9. Resize to phone width: sidebar collapses into a sheet; forms still usable.

## License

MIT; see [LICENSE](LICENSE). Bring it to any hackathon that allows open-source boilerplate; the commit history predates your event.
