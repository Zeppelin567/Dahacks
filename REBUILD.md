# REBUILD.md: rebuild this starter from nothing, with an AI agent
 
This file is the fallback for when you cannot bring the repo itself into a
hackathon. Each step below is a self-contained prompt for a coding agent
(Claude Code, Codex, Cursor…) plus a **machine-checkable done condition**.
The steps are in the exact order the original repo was built and committed
(`git log --oneline` mirrors this list), so every check has actually passed
once in that order.

## How to use it

- To rebuild the whole thing, paste the *Global context* block, then run
  `/goal npm run check exits 0 and every step's Verify block passes; paste each command's output`.
  Then feed the steps one at a time (or all at once for a strong agent).
- To rebuild one module only (e.g. you already have an app and just want the auth),
  paste *Global context* + that step. Steps declare what they depend on.
- When the original repo is available, copy its `package.json` ranges +
  `package-lock.json` for the versions. When it is not, use latest and read the
  *Pitfalls* of each step; they were written against the versions at the
  bottom of this file.

The done conditions are written for `/goal`: a command, its expected exit
code and a string that must appear in its output. Ask the agent to **paste the
command output**, because the judge reads the transcript, not your terminal.

Why things are the way they are: `docs/DECISIONS.md`. Things intentionally
left out, with prompts to add them: the *Add-ons* section at the end.

---

## Global context (paste before any step)

```
Monorepo hackathon starter, TypeScript everywhere, npm workspaces, Node >= 22.12.
  shared/  @mvp/shared  Zod schemas + types, consumed as TS source (exports "./src/index.ts")
  api/     @mvp/api     Hono on @hono/node-server v2, run with tsx (no build). Postgres via Drizzle:
                        PGlite in api/.data when DATABASE_URL is unset, node-postgres otherwise.
                        Better Auth (email+password, API keys). OpenAPI via @hono/zod-openapi, docs at /docs (Scalar).
                        Native WebSocket at /api/ws. LLM via Vercel AI SDK with a mock provider.
                        Serves web/dist in production (single process, no CORS).
  web/     @mvp/web     React 19 + Vite + Tailwind v4 + shadcn/ui (radix-nova), React Router (data mode),
                        TanStack Query, hono `hc` typed client. Vite proxies /api (incl. ws) and /docs to :3000.
  py/                   Optional FastAPI + uv side-car, reached only through api at /api/py/*.
Rules: clone → npm install → npm run dev must work with no .env, no Docker, no accounts, no network.
       Root .env is the only env file. Tests run in-memory (NODE_ENV=test), never touch .env or api/.data.
       Biome for lint+format (2-space, double quotes, 110 cols). Vitest for api. Everything English. MIT.
       No topic-specific features: only things every project needs.
```

---

## Step 0: Scaffold

**Depends on:** nothing.

**Prompt**

```
Create the monorepo described in Global context, with nothing but a health route and an empty app shell.
Root: package.json (workspaces shared/api/web; scripts dev = concurrently api+web, build = web build,
start = api start, typecheck/lint/test/check), tsconfig.base.json (strict, module esnext, moduleResolution
bundler, noEmit, verbatimModuleSyntax), biome.json, .gitignore, .gitattributes (eol=lf), .editorconfig,
.env.example, LICENSE (MIT).
shared/: `z` re-exported from @hono/zod-openapi; ErrorSchema {error,message}; HealthSchema.
api/: src/env.ts loads ../../.env via process.loadEnvFile when present (never in NODE_ENV=test) and
validates with Zod; src/app.ts builds an OpenAPIHono with GET /api/health, /api/openapi.json (doc31),
/docs (Scalar), JSON 404 for unknown routes, JSON onError; src/spa.ts mounts web/dist with SPA fallback
that skips /api/*; src/index.ts serves on PORT (3000); src/dev.ts sets NODE_ENV=development then imports
index; api "dev" script = `node --watch --watch-preserve-output --import tsx src/dev.ts` (NOT `tsx watch`, see
pitfalls). vitest.config.ts with env NODE_ENV=test. Tests: health, openapi, 404, spa fallback (temp dir).
web/: Vite + React + @tailwindcss/vite, alias @ → src, proxy /api (ws:true) and /docs → :3000, envDir "..".
shadcn init (radix, neutral) and add: button card input label textarea badge skeleton separator dialog
dropdown-menu table sonner sidebar tooltip sheet avatar alert. src/app.config.ts holds name/tagline/
description/logo/brandColor/modules{} + nav list; landing page reads only from it; /app shell = shadcn
sidebar with nav filtered by modules, theme toggle (local ThemeProvider, class "dark", localStorage),
Toaster; dashboard shows GET /api/health via hc<AppType> + TanStack Query and one card per module.
```

**Verify**

```
npm install                 → exit 0
npm run lint                → exit 0
npm run typecheck           → exit 0
npm test                    → exit 0, output contains "Tests  7 passed"
npm run build               → exit 0, output contains "built in"
npm run dev  (background)   → curl http://localhost:5173/api/health returns {"ok":true,...}
  (the root script itself,     curl http://localhost:5173/docs returns text/html
   not the two workspaces
   started separately)
npm run build && npm start  → curl http://localhost:3000/app/anything returns index.html (200)
                              curl http://localhost:3000/api/nope returns JSON 404
```

**Pitfalls (versions at bottom)**

- **Do not use `tsx watch` for the api on Windows.** Under `concurrently`, `tsx watch` and its child share one
  stdin pipe; the parent reads it (Enter = restart), and the child's first touch of `process.stdin` blocks
  forever. `@hono/node-server`'s `serve-static` does exactly that via `import { versions } from "node:process"`
  (an ESM import of `node:process` enumerates the `stdin` getter). Symptom: Vite is up, the api prints nothing
  and never listens, every `/api` and `/docs` request is a 502, and sign-in "does not work". Starting the api
  alone works, which is why testing the workspaces separately hides it. Use Node's own watcher:
  `node --watch --watch-preserve-output --import tsx src/dev.ts`; it reloads on edits in `api/` and `shared/`.

- **TypeScript 7** (native compiler): `baseUrl` is gone (use relative `paths`), `strict` is always on,
  and `types` now defaults to `[]`. Set `"types": ["node"]` in api and `["vite/client", "node"]` in web,
  or `process` / `import.meta.env` / `*.css` imports fail to type-check.
- **npm ≥ 11.17** blocks dependency install scripts by default and warns. Approve once with
  `npm approve-scripts esbuild --no-allow-scripts-pin`; it lands in root package.json `allowScripts`.
- **shadcn 4.x `init`** still prompts for a preset even with `-y`; pipe a newline (`echo | npx shadcn@latest init -y -b radix`).
  There is no `--base-color` flag any more. It adds runtime deps `shadcn` (for `@import "shadcn/tailwind.css"`),
  `cn`, `radix-ui`, `@fontsource-variable/geist`, and `next-themes` for the sonner Toaster. Replace the
  `next-themes` import in `components/ui/sonner.tsx` with your own `useTheme` and uninstall it.
- **Biome** rejects `@apply`/`@theme` unless `css.parser.tailwindDirectives: true`. Exclude
  `web/src/components/ui` from Biome (vendored code).
- **`@hono/node-ws` is deprecated**; `@hono/node-server` v2 exports `upgradeWebSocket` and takes
  `serve({ fetch, port, websocket: { server: new WebSocketServer({ noServer: true }) } })`.
- `serveStatic({ root })` resolves `root` against `process.cwd()`, and `npm run start -w api` runs with
  cwd = `api/`; compute `path.relative(process.cwd(), distDir)`.
- The SPA fallback (`app.get("*", …index.html)`) must skip `/api/*`, otherwise unknown API routes return
  HTML 200 instead of JSON 404. Test it with a temp dist folder; the real static block is disabled in tests.
- **Zod 4**: `z.url()`, `z.iso.datetime()`, `z.prettifyError()`; `Response.json()` is typed `unknown` with
  recent `@types/node`, cast in tests.
- Keep `@types/node` on the same major as the Node you run (`npm i -D @types/node@24`); `latest` may be ahead.

---

## Step 1: Database (Drizzle + PGlite / Postgres)

**Depends on:** Step 0.

**Prompt**

```
Add the database layer to api/ with Drizzle ORM. Deps: drizzle-orm @electric-sql/pglite pg; dev: drizzle-kit @types/pg.
src/db/schema.ts: pgEnum item_status(todo|doing|done); table items(id uuid pk defaultRandom, title text not null,
notes text, status default todo, created_at/updated_at timestamptz defaultNow, updated_at $onUpdate).
src/db/index.ts: export `db` typed as PgDatabase<PgQueryResultHKT, typeof schema>, `dbKind` ("pglite"|"postgres"),
`closeDb`. NODE_ENV=test → PGlite in memory; DATABASE_URL unset → PGlite at api/.data/pglite (mkdirSync recursive
first); DATABASE_URL set → node-postgres Pool. Tests must ignore DATABASE_URL.
src/db/migrate.ts: runMigrations() picks drizzle-orm/pglite/migrator or node-postgres/migrator by dbKind, folder
api/drizzle (absolute path). Call it in src/index.ts before serve() and in test/setup.ts (vitest setupFiles).
src/db/seed.ts: SEED_ITEMS with fixed UUIDs, upsert (onConflictDoUpdate), exporting seed(); src/db/seed-cli.ts
runs it, prints the result and calls closeDb() (this is what `db:seed` executes). src/db/reset.ts:
pglite → delete data dir; postgres → drop/create schema public + drizzle, then seed.
drizzle.config.ts: dialect postgresql, schema ./src/db/schema.ts, out ./drizzle. Scripts: db:generate, db:seed, db:reset
(root forwards them). Health route adds `db: dbKind` after `select 1`; HealthSchema gains db enum; dashboard shows it.
Tests: dbKind is pglite; insert returns defaults; update+delete; seed twice keeps exactly SEED_ITEMS.length rows.
```

**Verify**

```
npm run db:generate         → exit 0, creates api/drizzle/0000_*.sql containing CREATE TABLE "items"
npm test                    → exit 0, output contains "Tests  11 passed"
npm run typecheck && npm run lint → exit 0
npm run db:seed             → exit 0, output contains "seeded (pglite)"; api/.data/pglite exists
npm run dev -w api          → curl /api/health returns "db":"pglite"
npm run db:reset            → exit 0, api/.data/pglite removed
```

**Pitfalls**

- PGlite `new PGlite(dir)` creates only the leaf directory: `mkdirSync(dir, { recursive: true })` first or you
  get `ENOENT mkdir api/.data/pglite` on a fresh clone.
- Two migrator imports exist (`drizzle-orm/pglite/migrator`, `drizzle-orm/node-postgres/migrator`); they are the
  same function typed for different drivers. Branch on `dbKind` and cast; do not try to unify the driver types.
- Type `db` as `PgDatabase<PgQueryResultHKT, typeof schema>` so PGlite and node-postgres instances are
  interchangeable everywhere else.
- Vitest isolates modules per test file, so the in-memory `db` singleton is fresh per file; `setupFiles` runs
  migrations for each. PGlite WASM boot is ~1-2 s per file, so keep the number of test files modest.
- drizzle-kit `generate` needs no database connection; only `schema` and `out` in drizzle.config.ts.
- Do **not** guard a "run as script" block with `import.meta.url === \`file://${process.argv[1]}\``: on Windows
  `import.meta.url` is `file:///C:/…` (three slashes) and the comparison is always false. The seed silently
  does nothing, and the open PGlite handle can keep the process alive. Use a separate `*-cli.ts` entry file.

---

## Step 2: Auth (Better Auth, email + password)

**Depends on:** Step 1.

**Prompt**

```
Add authentication with Better Auth. Deps: api: better-auth @better-auth/drizzle-adapter; web: better-auth.
api/src/auth.ts: betterAuth({ baseURL: env.BETTER_AUTH_URL, basePath: "/api/auth", secret, database:
drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true, minPasswordLength: 8 },
trustedOrigins: [env.WEB_ORIGIN] }). Do NOT enable session.cookieCache (see pitfalls).
Create api/src/db/auth-schema.ts as an empty placeholder (`export {}`), re-export it from schema.ts, then run
  NODE_ENV=test npx auth@latest generate --config src/auth.ts --output src/db/auth-schema.ts -y   (in api/)
  npm run db:generate
api/src/types.ts: AppEnv { Variables: { user, session } } inferred from auth.$Infer.Session.
api/src/middleware/auth.ts: requireAuth (401 JSON {error:"unauthorized"}) and optionalAuth via
auth.api.getSession({ headers: c.req.raw.headers }).
Move health into src/routes/system.ts; add src/routes/me.ts: GET /api/me with middleware: [requireAuth],
security: [{cookieAuth:[]},{apiKey:[]}], returns UserSchema (shared/src/user.ts: id,name,email,image,createdAt).
app.ts: app.all("/api/auth/*", c => auth.handler(c.req.raw)); routes = app.route("/", system).route("/", me);
register securitySchemes cookieAuth (cookie better-auth.session_token) and apiKey (header x-api-key).
Tests (test/helpers.ts: signUp/signIn over HTTP with origin header, cookieHeader from getSetCookie()):
anonymous /api/me → 401; sign-up cookie → /api/me 200 with email; wrong password → 401; sign-out → 401;
password < 8 → 400; spec has security on /api/me and both securitySchemes.
web: lib/auth.ts createAuthClient({ basePath: "/api/auth" }) from better-auth/react; pages login + signup
(shadcn Card/Input/Label/Button, sonner toasts, redirect back to `state.from`); components/require-auth.tsx
(useSession → spinner / Navigate to /login); wrap the /app route element; user-menu shows name/email + Sign out.
api/AUTH.md: how a cookie becomes c.var.user, files, how to protect a route, endpoints, env, pitfalls.
```

**Verify**

```
npm test                    → exit 0, output contains "Tests  17 passed"
npm run typecheck && npm run lint → exit 0
curl -X POST localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
     -d '{"name":"A","email":"a@x.io","password":"longenough"}' -c c.txt  → 200
curl -b c.txt localhost:3000/api/me → 200 with "a@x.io"; without -b → 401
```

**Pitfalls**

- The Better Auth CLI is `npx auth@latest` (package `auth`, same version as `better-auth`); `@better-auth/cli` is
  stale. It logs `ERROR [Better Auth]: Drizzle schema mismatch … Missing tables` *while generating*; that is expected.
- The CLI imports your auth.ts, which imports db/index.ts. Run it with `NODE_ENV=test` so it uses in-memory
  PGlite and does not create api/.data.
- Circular bootstrap: schema.ts re-exports auth-schema.ts, which the CLI has not written yet → create the
  placeholder file first.
- `auth.handler(c.req.raw)` must be mounted with `app.all("/api/auth/*")` **before** the OpenAPI routes so
  the docs do not swallow it; `basePath` in betterAuth() must equal the mount path.
- State-changing auth requests need an `Origin` header matching `trustedOrigins` (or baseURL). In tests send
  `origin: http://localhost:3000`; in the browser this is automatic.
- `Response.headers.getSetCookie()` returns an array; join `name=value` pairs with `; ` for the Cookie header.
- Protected OpenAPI routes take `middleware: [requireAuth]` inside `createRoute`, not `app.use`.
  Type the app as `OpenAPIHono<AppEnv>` so `c.var.user` is typed.
- **RPC type trap:** `security: [{ cookieAuth: [] }, { apiKey: [] }]` written inline makes TypeScript widen the
  route to `path: string` with *no error*: the array literal becomes a union with phantom `?: undefined`
  props that violates the `security` index signature, so the generic falls back to `RouteConfig`. Symptom:
  in web, `api.api.health` "does not exist", `api.api` is "possibly undefined". Fix: declare it once with an
  explicit type (`const authSecurity: NonNullable<RouteConfig["security"]> = [...]`) and reuse it. Probe with
  `const k: keyof SchemaOf<typeof sub> = "zzz"`; the error message must list literal paths, not `string`.
- The generated tables use `text("id")` primary keys and `timestamp` without time zone; leave them as generated.
- `session.cookieCache` stores a signed copy of the session in a second cookie and skips the DB for `maxAge`
  seconds, so a replayed cookie still works after sign-out and the sign-out test fails. Leave it off.

---

## Step 3: CRUD template + OpenAPI (`items`)

**Depends on:** Step 2.

**Prompt**

```
Add the items CRUD, the template every future resource copies.
db/schema.ts: items gains owner_id text NOT NULL → user.id ON DELETE CASCADE + index. Squash migrations
(delete api/drizzle, npm run db:generate → one 0000_*.sql) — fine before the first deploy.
shared/src/items.ts: ITEM_STATUSES, ItemStatusSchema, ItemSchema (dates as ISO), CreateItemSchema (title trim
min 1 max 200, notes nullable optional, status optional), UpdateItemSchema = partial, ItemIdParamsSchema
(z.uuid() with openapi param), ListItemsQuerySchema (status?, q?), ItemListSchema {items,total}.
api/src/routes/items.ts: OpenAPIHono<AppEnv> with GET/POST /api/items and GET/PATCH/DELETE /api/items/{id};
all requireAuth + security: authSecurity; every query filtered by ownerId = c.var.user.id; 404 for foreign ids;
q → ilike title; 201 on create, 204 on delete; toDto() converts Dates. Mount with .route("/", items).
seed.ts: ensureDemoUser() via auth.api.signUpEmail (demo@example.com / demo1234!) unless the email exists;
items upserted with that owner; print the demo login.
Tests: 401 on all five routes; create→get→patch→delete (title trimmed, updatedAt bumps, 404 after delete);
400 for blank title / bad status / non-uuid id; owner scoping with two users (404 on peek/edit/delete);
?status= and ?q= filters; spec has both paths and the five schemas. db.test: seed idempotent, cascade delete.
web: lib/items.ts (useItems/useCreateItem/useUpdateItem/useDeleteItem over hc, invalidate ["items"]);
pages/items.tsx: search + status Select, Table with Badge, empty state hinting at db:seed, New/Edit Dialog
(one form, `key` resets it), AlertDialog delete; route /app/items. shadcn add: select alert-dialog.
```

**Verify**

```
npm run db:generate         → exit 0; api/drizzle has exactly one *.sql with "items" and "owner_id"
npm test                    → exit 0, output contains "Tests  24 passed"
npm run typecheck && npm run lint && npm run build → exit 0
npm run db:seed             → prints "demo login: demo@example.com / demo1234!"
```

**Pitfalls**

- `hc` path params use Hono syntax on the client: `api.api.items[":id"].$patch({ param: { id }, json })`, while
  `createRoute` uses OpenAPI syntax `"/api/items/{id}"`.
- Zod 4: `z.uuid()`, `z.email()` are top-level; `.trim()` runs before `.min(1)`, so "   " is rejected.
- Query params arrive as strings; keep the query schema string-based (`z.enum`, `z.string()`). `z.coerce.number()`
  makes the RPC input type `unknown`.
- Return `c.body(null, 204)` for delete; `c.json` with 204 fails the response type.
- Scope by owner in the WHERE clause of every statement (including UPDATE/DELETE `.returning()` to detect 404),
  never by checking ownership after the fact.

---

## Step 4: API keys for non-browser clients

**Depends on:** Step 3.

**Prompt**

```
Add API keys with Better Auth's plugin. Deps: api + web: @better-auth/api-key.
auth.ts: plugins: [apiKey({ apiKeyHeaders: "x-api-key", defaultPrefix: "mvp_", requireName: true,
rateLimit: { enabled: false }, keyExpiration: { defaultExpiresIn: null } })]. Regenerate auth-schema.ts with the
CLI (NODE_ENV=test), squash migrations again (single 0000_*.sql now includes "apikey").
types.ts: AppEnv gains authMethod: "cookie" | "apiKey".
middleware/auth.ts: resolveIdentity(c): if x-api-key header → auth.api.verifyApiKey({ body: { key } }); when valid,
load user by result.key.referenceId, build a synthetic Session (id `apikey_<id>`), method "apiKey"; otherwise
getSession → "cookie". requireAuth/optionalAuth use it. Do NOT use enableSessionForAPIKeys.
web: lib/auth.ts adds plugins: [apiKeyClient()] (from @better-auth/api-key/client); pages/api-keys.tsx lists
keys (authClient.apiKey.list → name, start…, created, last used), creates (dialog with name → show the key once
with copy buttons + curl + `uv run examples/add_item.py` snippets), revokes (AlertDialog → apiKey.delete);
route /app/api-keys.
examples/add_item.py: PEP 723 script (httpx) that calls GET /api/me and POST /api/items with x-api-key.
Tests: key acts as owner on /api/me and POST /api/items (browser list sees it); bad/empty keys → 401; list has
no `key` field; delete → 401 afterwards; 12 rapid requests all 200; anonymous create → 401; unnamed → 4xx.
Update AUTH.md's API keys section with the verify → load → set flow.
```

**Verify**

```
npm test                    → exit 0, output contains "Tests  28 passed"
npm run typecheck && npm run lint && npm run build → exit 0
grep -c '"apikey"' api/drizzle/0000_*.sql → ≥ 1
```

**Pitfalls**

- `@better-auth/api-key` is a separate package now; `import { apiKey } from "better-auth/plugins"` is stale.
- Plugin defaults: rate limit ON at 10 requests/day; keys never expire unless asked. Set both explicitly.
- Regenerate `auth-schema.ts` after adding the plugin or `verifyApiKey` fails with "table apikey does not exist".
- `verifyApiKey` returns `{ valid, error, key }`; the owner is `key.referenceId` (not `userId`).
- Create/delete endpoints are POST under `/api/auth/api-key/*` and need the `Origin` header like every other
  state-changing Better Auth call; `list` is GET and returns `{ apiKeys, total, limit, offset }`, not an array.
- The client result shape is `{ data, error }`; wrap it once (`ok()`) instead of repeating the check in every hook.

---

## Step 5: Realtime (native WebSocket)

**Depends on:** Step 4 (uses API keys in tests; items events).

**Prompt**

```
Add a WebSocket endpoint with @hono/node-server v2's built-in support. Deps: api: ws; dev: @types/ws.
shared/src/realtime.ts: ChannelNameSchema (/^[a-z0-9][a-z0-9._-]{0,63}$/), ClientMessageSchema =
discriminatedUnion(subscribe|unsubscribe|publish{channel,payload}|ping), ServerMessageSchema {type,channel,payload},
SERVER_EVENTS (hello, presence, subscribed, unsubscribed, message, pong, error, items.created/updated/deleted),
CHANNELS {system, items, demo}, PRIVATE_CHANNELS = {items}.
api/src/realtime/hub.ts: in-memory Set<Client{socket,user,channels}>; register (sends hello + presence to all),
unregister, subscribe/unsubscribe, sendError, publish(channel, type, payload, { toUser? }) — private channels
REQUIRE toUser and only reach that user's sockets; stats(); resetHub() for tests.
api/src/realtime/ws.ts: new Hono<AppEnv>().get("/api/ws", requireAuth, upgradeWebSocket(c => ({ onOpen: register,
onMessage: JSON.parse → ClientMessageSchema.safeParse → switch; "publish" to a private channel → error frame,
otherwise publish(channel, "message", { from: {id,name}, sentAt, data }); onClose/onError: unregister }))).
Mount with app.route("/", realtime) OUTSIDE the typed `routes` chain.
api/src/server.ts: startServer(port) → serve({ fetch, port, websocket: { server: new WebSocketServer({ noServer:
true }) } }) resolving { port, close }. index.ts uses it; tests call startServer(0).
routes/items.ts: publish(CHANNELS.items, "items.created"|"items.updated", dto, { toUser: ownerId }) and
"items.deleted" { id } after each write.
Tests (ws client from "ws", real server on port 0): anonymous upgrade → HTTP 401; cookie and x-api-key clients
get "hello"; two tabs of Alice get items.created / items.deleted, Bob (subscribed) gets nothing within 300 ms;
Alice publish on "demo" → Bob receives "message" with from.name; publish on "items" → error "server-only";
non-JSON → error; ping → pong.
web/src/lib/realtime.ts: singleton RealtimeClient (one socket per tab, exponential backoff ≤30 s, re-subscribes on
reconnect, status via useSyncExternalStore), hooks useRealtimeStatus() and useChannel(channel, handler);
components/realtime-dot.tsx in the app header; pages/live.tsx (presence count, "demo" chat-style publish/log,
"items" event log, hints to run the Python example); Items page invalidates its query on any items.* event.
```

**Verify**

```
npm test                    → exit 0, output contains "Tests  32 passed"
npm run typecheck && npm run lint && npm run build → exit 0
npm run dev → sign in, open /app/live in two tabs → "2 connected clients"; send text in one → appears in both
uv run examples/add_item.py --key <key> "hi" → Items page updates without reload, Live page logs items.created
```

**Pitfalls**

- `@hono/node-ws` is deprecated; use `import { upgradeWebSocket } from "@hono/node-server"` and pass
  `websocket: { server: wss }` to `serve()`. Without that option upgrades silently fail (browser sees 200 HTML).
- Auth on upgrade is just middleware order: `.get("/api/ws", requireAuth, upgradeWebSocket(...))`. Browsers send
  the cookie automatically; scripts must set `x-api-key` as a header (browsers cannot, so cookies only there).
- Vite proxy needs `ws: true` on the `/api` rule or the dev server answers the upgrade itself.
- Private topics must be filtered by user at publish time (`toUser`); relying on channel names alone leaks data.
- The browser `WebSocket` reconnect loop must be idempotent (`connect()` returns early when a socket is
  CONNECTING/OPEN) or React StrictMode double-mounts open two sockets.
- In tests, `ws` emits `unexpected-response` (not `error`) for a 401 upgrade, so listen for that event.

---

## Step 6: LLM chat (Vercel AI SDK, provider-agnostic, mock fallback)

**Depends on:** Step 2 (auth). Independent of Steps 3-5.

**Prompt**

```
Add streaming LLM chat with the Vercel AI SDK. Deps: api: ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google;
web: ai @ai-sdk/react.
shared/src/llm.ts: LlmProviderSchema enum(anthropic|openai|google|mock), LlmStatusSchema {provider, model, mock,
reason?, requested?}.
api/src/llm.ts: DEFAULT_MODELS { anthropic: "claude-opus-5", openai: "gpt-5", google: "gemini-2.5-flash" };
resolveLlm(env) is PURE: LLM_PROVIDER=mock → mock; missing <PROVIDER>_API_KEY → mock with reason + requested;
else { provider, model: LLM_MODEL ?? default, apiKey }. toStatus() strips apiKey. languageModel(cfg) →
createAnthropic({apiKey})(model) / createOpenAI / createGoogleGenerativeAI. CHAT_INSTRUCTIONS constant.
api/src/routes/chat.ts: GET /api/chat/status (OpenAPI, requireAuth) → toStatus(resolveLlm()).
POST /api/chat (plain .post, requireAuth): body {messages} → safeValidateUIMessages; 400 on invalid/empty;
mock → createUIMessageStream writing start/text-start/text-delta(word by word)/text-end/finish echoing the last
user text, wrapped in createUIMessageStreamResponse; real → streamText({ model, instructions, messages: await
convertToModelMessages(messages) }) → createUIMessageStreamResponse({ stream: toUIMessageStream({ stream:
result.stream, onError }) }). Register the POST in OpenAPI by hand with openAPIRegistry.registerPath.
Mount .route("/", chat). Tests: resolveLlm matrix (mock on missing key, default model, LLM_MODEL override,
no apiKey in status); 401s; 400 for [] and junk; mock stream is text/event-stream containing text-start,
text-delta, finish and reassembled deltas include the user text; spec has both paths.
web/src/pages/chat.tsx: useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) }); render
message.parts of type "text"; Textarea (Enter sends, Shift+Enter newline); Stop while streaming; error Alert
with regenerate/clearError; status badge from GET /api/chat/status via hc (shows "mock mode" + reason).
Route /app/chat. .env.example documents LLM_PROVIDER / LLM_MODEL / the three keys.
```

**Verify**

```
npm test                    → exit 0, output contains "Tests  40 passed"
npm run typecheck && npm run lint && npm run build → exit 0
npm run dev → /app/chat shows "mock mode"; a message streams back an echo
ANTHROPIC_API_KEY=… in .env → badge shows anthropic / claude-opus-5 and real replies stream
```

**Pitfalls**

- **AI SDK 7 renames:** `system` → `instructions`; `result.fullStream` → `result.stream`; the response helpers
  are standalone (`createUIMessageStreamResponse({ stream: toUIMessageStream({ stream }) })`), not methods on
  the result. All packages are ESM-only and need Node ≥ 22.
- Keep `resolveLlm()` pure and pass env in; that is what makes the fallback matrix testable without keys.
- Never return the raw config from the status route; strip `apiKey` (`toStatus`).
- The streaming route cannot go through `.openapi()` (its response is not JSON); use `.post()` and document it
  with `openAPIRegistry.registerPath` so it still shows up in the docs page. Call `registerPath` on the
  `OpenAPIHono` instance *before* chaining `.post()`; the chained type is a plain `Hono` without the registry.
- Mock deltas must be `writer.write({ type: "text-delta", id, delta })` between a `text-start`/`text-end` pair
  with the same `id`, and wrapped in `start`/`finish`, or `useChat` renders nothing.
- `useChat` is per component instance; create the `DefaultChatTransport` once at module level.
- Model ids: Anthropic's current default is `claude-opus-5`; do not append date suffixes. OpenAI/Google ids drift,
  so set `LLM_MODEL` explicitly when you use them.

---

## Step 7: Optional Python side-car (FastAPI + uv) behind the api

**Depends on:** Step 2 (auth). Independent of Steps 3-6.

**Prompt**

```
Add py/: a uv project (pyproject: fastapi, uvicorn[standard], python-multipart, pillow; dev group pytest, httpx,
ruff; ruff line-length 110 with extend-include ../examples/*.py; pytest pythonpath ["."]; .python-version 3.12).
app/main.py: FastAPI(root_path="/api/py") with GET /health {ok,service,version}, GET /whoami (reads x-user-id /
x-user-email headers), POST /image/stats (UploadFile → Pillow: filename, format, mode, width, height, bytes,
mean_brightness; 400 if not an image), POST /text/stats ({text} → characters, words, lines, top_words).
tests/test_main.py with TestClient covering all four + openapi servers == [{url:"/api/py"}].
api: shared PyStatusSchema {up,url,version?,hint?}; routes/py.ts: module-level pyUrl from env.PY_URL with
setPyUrl/getPyUrl for tests; forward(c) rebuilds the target (strip /api/py, keep query), copies headers minus
hop-by-hop AND cookie/authorization/x-api-key, adds x-user-id/x-user-email when a user is present, streams the
body with duplex:"half", returns the upstream Response (status + headers); fetch failure → 503
{error:"python_unavailable", message with "npm run dev:py"}. Routes: GET /api/py/status (OpenAPI, requireAuth,
fetch /health with 1.5 s timeout), GET /api/py/health and /api/py/openapi.json public, .all("/api/py/*",
requireAuth, forward). Register /api/py/{path} in OpenAPI by hand. Docs page: Scalar `sources` with the api
spec and /api/py/openapi.json.
Tests (fake upstream: node:http echo server on 127.0.0.1:0, setPyUrl): 401 except health/openapi; POST with
query forwards method/url/body/content-type and x-user-email, drops cookie and x-api-key; 404 passthrough;
status up with version; unreachable → 503 + status.up false with hint.
web/src/pages/python.tsx: status card (polls /api/py/status), image upload → /api/py/image/stats (FormData),
text → /api/py/text/stats; buttons disabled while down. Route /app/python.
Root scripts: dev:py, test:py, lint:py, format:py, check:py (all via `uv run --directory py`).
```

**Verify**

```
uv sync --directory py      → exit 0
npm run check:py            → exit 0, output contains "6 passed"
npm test                    → exit 0, output contains "Tests  45 passed"
npm run typecheck && npm run lint && npm run build → exit 0
npm run dev + npm run dev:py → /app/python shows "running"; upload a PNG → JSON with width/height
```

**Pitfalls**

- Node's `fetch` refuses a streamed request body without `duplex: "half"` (cast the init; the type lacks it).
- Strip `cookie` / `authorization` / `x-api-key` before forwarding (the side-car must never see credentials),
  and strip hop-by-hop headers (`content-length`, `transfer-encoding`) both ways or responses hang.
- `FastAPI(root_path="/api/py")` is what makes the proxied `/api/py/openapi.json` usable in the docs page.
- Keep the proxy target in a mutable module variable with a setter; tests need to point it at a fake server and
  at a dead port without touching `.env`.
- `uv run --directory py …` from the repo root avoids `cd`; `uv` creates `py/.venv` on first run (gitignored).
- `openAPIRegistry.registerPath` wants **Zod** schemas in `request.params/query` (raw JSON schema makes the whole
  `/api/openapi.json` throw 500; every docs test fails at once, which is the clue).
- Because `x-api-key` is checked before the cookie, a bogus key + valid cookie is a 401 by design; in tests use
  an `authorization` header as the "credential that must not be forwarded".

---

## Step 8: CI and the one-command check

**Depends on:** Steps 0-7 (it runs everything).

**Prompt**

```
Add .github/workflows/ci.yml: on push (all branches) + pull_request, concurrency per ref. Job "node": matrix
ubuntu-latest + windows-latest, actions/checkout@v4, actions/setup-node@v4 with node-version-file .node-version
and cache npm, `npm ci`, `npm run check`, `npm run smoke:dev`. Job "python": ubuntu, astral-sh/setup-uv@v5
(enable-cache, cache-dependency-glob py/uv.lock), `uv sync --directory py`, ruff check, ruff format --check, pytest.
Add .node-version containing `24`. Root `check` = lint && typecheck && test && build; `check:py` = lint:py &&
test:py. Add scripts/smoke-dev.mjs (`smoke:dev`): spawn `npm run dev` with piped stdio (shell on Windows,
detached process group elsewhere), poll http://localhost:5173/api/health up to 90 s, then check /docs is
text/html, /api/openapi.json has openapi 3.1.0, sign-up + sign-in + /api/me with the cookie all succeed through
:5173; always kill the process tree (taskkill /T /F on Windows, kill(-pid) elsewhere); print the dev output on
failure. Verify a clean install works: `npm ci` then `npm run check` then `npm run smoke:dev`.
```

**Verify**

```
npm ci                      → exit 0 (lockfile in sync; no scripts prompt thanks to allowScripts)
npm run check               → exit 0, output ends with the Vite "built in" line
npm run smoke:dev           → exit 0, output contains "smoke:dev passed" (6 "ok" lines)
npm run check:py            → exit 0, "6 passed"
(after pushing) both CI jobs green on GitHub
```

**Pitfalls**

- `npm ci` fails if package-lock.json drifts from package.json, so always commit the lockfile after `npm install`.
- Windows runners need the same `eol=lf` `.gitattributes` as developers, or Biome's formatter flags every file.
- The realtime and proxy tests bind random ports. That is fine on GitHub runners, but do not hard-code ports in tests.
- `uv sync` in CI relies on `py/uv.lock` being committed; regenerate it locally whenever pyproject changes.
- `npm audit` reports an old `esbuild` (≤0.24.2, moderate, dev-server CORS) pulled in transitively by a build
  tool; it is not in the runtime path. Do not `npm audit fix --force`; it would downgrade/replace packages.

---

## Step 9: Docs

**Depends on:** everything.

**Prompt**

```
Write README.md (what you get, first 10 minutes at a hackathon, layout, commands, configuration table, calling
the API from outside, deploying, rebuilding, a 5-minute manual browser checklist, license), DEPLOY.md (Neon +
Render single service, env table, free-tier spin-down, optional Python service; mark it "untested" until someone
runs it), render.yaml blueprint, docs/DECISIONS.md (the design decisions with reasoning + build order + known
limits), and finish REBUILD.md (Add-ons, versions). Reset and reseed the local database so a fresh checkout
experience matches the README.
```

**Verify**

```
npm run check && npm run check:py → exit 0
git status --short → empty after commit
```

---

## Add-ons: things deliberately NOT in the starter

Each is a prompt you can hand to an agent on the day. They were left out because they need an account, a
third-party dashboard, or only some projects want them.

- **File uploads.** *Local first:* "Add POST /api/uploads (requireAuth, multipart via c.req.parseBody, max 10 MB,
  store under api/.data/uploads/<userId>/<uuid>.<ext>, table `uploads` with owner/name/mime/size, GET
  /api/uploads/{id} streams it back to the owner; web: drop zone component." *For deploy:* "swap the disk store
  for S3-compatible storage behind one `Storage` interface with put/get/delete; keep the local disk impl for dev."
- **OAuth logins (Google/GitHub).** "Add `socialProviders: { github: { clientId, clientSecret } }` to
  betterAuth() from env, a 'Continue with GitHub' button calling authClient.signIn.social({ provider: 'github',
  callbackURL: '/app' }), and document the callback URL `<BETTER_AUTH_URL>/api/auth/callback/github` in
  .env.example." (Needs an app registered at the provider; callback URL changes with every tunnel/deploy.)
- **Vector search / RAG.** "Enable pgvector: `CREATE EXTENSION vector` in a migration (PGlite supports it via
  `@electric-sql/pglite/vector`; enable it in db/index.ts), add an `embeddings` table with a `vector(1536)`
  column, embed with the AI SDK `embed()` using the same provider switch, and a `POST /api/search` route."
- **Background jobs / cron.** "Add a tiny in-process scheduler (setInterval + a `jobs` table with last_run) in
  api/src/jobs.ts started from index.ts; expose GET /api/jobs for status." It runs without Redis or a queue service.
- **Email.** "Add a `Mailer` interface with a console implementation (logs the message) and a Resend
  implementation selected when RESEND_API_KEY is set; use it for Better Auth's `sendResetPassword`."
- **Maps.** "Add MapLibre GL (npm `maplibre-gl`) with a free style URL from env, a `<Map>` component, and a
  `POST /api/locations` route storing lat/lng on the item." (Needs a tile provider key for anything serious.)
- **Payments.** Out of scope for a demo; stub with a `Pro` badge toggled by a boolean column.
- **Admin panel.** "Add an `admin` boolean to user (regenerate auth schema with the Better Auth admin plugin),
  a `requireAdmin` middleware, and an /app/admin page listing users with disable/delete."
- **i18n.** "Wrap user-visible strings in a `t()` from a tiny dictionary module with `en` and one more locale;
  choose by navigator.language; persist in localStorage." At hackathon scale you do not need a library.

---

## Versions this document was written against

Node 24.19 · npm 11.17 · uv 0.11 · Python 3.12

| Package | Version | | Package | Version |
|---|---|---|---|---|
| typescript | 7.0.2 | | react / react-dom | 19.3.0 |
| hono | 4.13.7 | | react-router | 8.3.1 |
| @hono/node-server | 2.1.1 | | @tanstack/react-query | 5.102.8 |
| @hono/zod-openapi | 1.6.3 | | vite | 8.3.0 |
| zod | 4.6.4 | | @vitejs/plugin-react | 6.1.1 |
| @scalar/hono-api-reference | 0.12.1 | | tailwindcss / @tailwindcss/vite | 4.3.3 |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | | shadcn (CLI + runtime) | 4.21.0 |
| @electric-sql/pglite | 0.5.8 | | @biomejs/biome | 2.5.13 |
| pg | 8.23.0 | | vitest | 5.0.0 |
| better-auth (+ drizzle-adapter, api-key, `auth` CLI) | 1.7.4 | | tsx | 4.23.13 |
| ai | 7.0.99 | | ws | 8.21.3 |
| @ai-sdk/anthropic / openai / google | 4.0.53 / 4.0.66 / 4.0.69 | | @ai-sdk/react | 4.0.102 |

Python packages: see `py/uv.lock` (fastapi, uvicorn, pillow, python-multipart; pytest, httpx, ruff).

```
