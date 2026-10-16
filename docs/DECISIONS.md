# Decisions

Why this starter is shaped the way it is. Each entry was settled before a line of code was written, in a design interview between the maintainer and a coding agent. Change them deliberately; most later choices lean on an earlier one.

## Identity

| # | Decision | Reasoning |
|---|---|---|
| D1 | **Public, topic-free starter + a rebuild script.** The repo contains only what every project needs. `REBUILD.md` lets an agent recreate it from an empty folder if rules forbid bringing code. | Most hackathon rules allow open-source boilerplate but require the project itself to be built on-site. A public repo with pre-event commits is the cleanest proof. The rebuild script is the fallback when even that is disallowed. |
| D2 | **Designed for a team formed on the day.** Mainstream stack; anyone who has written a web app should read it in ten minutes. | Teammates are often strangers; the maintainer is also using this to learn TypeScript/React. |
| D14 | **English everywhere; MIT.** | The repo's readers are teammates, judges and agents. MIT is what "open-source boilerplate" rules mean. |
| D16 | **Private until green, public before the first event.** | Half-built starters help nobody; commit dates survive the flip to public. |

## Architecture

| # | Decision | Reasoning |
|---|---|---|
| D3 | **Monorepo with a real API boundary**: `web/` (SPA), `api/` (HTTP + WS server), `shared/` (schemas). Not a full-stack meta-framework. | Hackathon projects often have more than a browser talking to them: a bot, a phone, a microcontroller, a Python script. A plain HTTP API is what all of those can reach. It also keeps "where does this code run" obvious. |
| D4 | **Node 24 LTS + npm workspaces.** No pnpm/bun/nvm. | The one runtime everyone already has. Tooling lives in `node_modules`; delete the folder and the machine is untouched. |
| D5 | **Local-first.** `clone → npm install → npm run dev` must work with no `.env`, no Docker, no accounts, no network. Deployment is documented, not required. | Demos are usually run from a laptop; venue Wi-Fi is unreliable. The same Node process serves the SPA in production, so what runs locally is what deploys. |
| D6 | **Postgres via Drizzle: PGlite locally, any Postgres URL in production.** | Same SQL dialect in both places, one env var to switch. Postgres keeps the door open for pgvector/JSONB/full-text when the topic demands it. |
| D9 | **REST + OpenAPI from Zod** (`@hono/zod-openapi`), typed client via `hc`, TanStack Query. | One schema gives validation, docs with "try it", TypeScript types across the boundary, and a spec external clients can generate SDKs from. |
| D11 | **Native WebSocket**, `{ type, channel, payload }` frames, in-process hub. | Any language has a WebSocket client; Socket.IO's protocol does not. One server means no Redis. |
| D12 | **Python side-car is optional and proxied.** `py/` is a FastAPI app the api forwards to under `/api/py/*`. | The maintainer's strength is Python (CV, robotics, data). Proxying means auth is shared and teammates without `uv` are unaffected. |
| D13 | **Tests protect the starter, not the hackathon project.** Vitest over `app.request()` with in-memory PGlite; pytest for `py/`; CI on push; one `npm run check`. | Dependencies drift between events. The seams (auth ↔ ORM ↔ client types) are what break; that is what the tests cover. |

## Modules (D7)

Included only what nearly every project needs and that hurts to wire at 2 a.m.: auth, one full CRUD chain as a template, UI kit, LLM streaming, realtime, API keys, seed data. Left out on purpose: maps, payments, email, background jobs, i18n, file uploads, OAuth logins, admin panels. See the *Add-ons* section of `REBUILD.md` for how to ask an agent for them.

| # | Decision | Reasoning |
|---|---|---|
| D8 | **Better Auth** for accounts; API keys via its plugin, but verified explicitly in our middleware. | Auth is the last thing to hand-roll under time pressure. `api/AUTH.md` explains the request → session → user path so it is debuggable. |
| D10 | **Vercel AI SDK with a provider switch and a mock fallback.** Default model `claude-opus-5`. | Sponsors hand out credits for different vendors; `LLM_PROVIDER=` is the whole migration. Mock mode keeps the app alive without any key. |
| D15 | **`REBUILD.md` is step-by-step, and the repo was built in that order**, one commit per step, with done conditions written for `/goal`. | The rebuild instructions are trustworthy only if they were actually followed once. `git log` is the index. |
| D17 | **Module showcase UI** driven by `app.config.ts`, plus a landing shell. | Turn a module off in one place and it disappears; rename the product in one file. The landing page is layout, not a product guess. |

## Build order

`git log --oneline` mirrors this:

0. Scaffold (workspaces, Biome, TS 7, Vite, shadcn, app shell)
1. Database (Drizzle, PGlite/Postgres, migrations, seed)
2. Auth (Better Auth, `/api/me`, login/signup, guard)
3. CRUD template (`items`, OpenAPI, typed client, UI)
4. API keys
5. Realtime (WebSocket hub, Live page)
6. LLM chat (AI SDK, mock)
7. Python side-car (FastAPI, proxy)
8. CI + `npm run check`
9. Docs (README, DEPLOY, this file, REBUILD finalised)

## Known limits

- The browser is not tested automatically (no Playwright, by choice; see D13). README has a 5-minute manual pass.
- `DEPLOY.md` follows Render/Neon documentation and has not been run end to end yet.
- PGlite accepts one connection: fine for development, never for production (that is what `DATABASE_URL` is for).
- The realtime hub is in-process; a second api instance would need Redis-style fan-out.
