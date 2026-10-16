# How auth works in this api 

Better Auth handles accounts; this document is the map of what it does for
you and where the seams are, so you can debug it at 2 a.m. without reading
its source.

## The one-paragraph version

The browser calls `POST /api/auth/sign-in/email`. Better Auth checks the
password hash in the `account` table, inserts a row into `session`, and
answers with a `Set-Cookie: better-auth.session_token=…` header (httpOnly,
SameSite=Lax, Secure when the base URL is https). From then on every request
carries that cookie. Our `requireAuth` middleware asks
`auth.api.getSession({ headers })`, which reads the cookie, looks the token
up in `session`, joins `user`, and hands us `{ user, session }` if the row
exists and has not expired. We put those on `c.var` and the route handler
never thinks about cookies again.

```
browser ── cookie ──▶ requireAuth ──▶ auth.api.getSession(headers)
                                         │  session table (token → userId, expiresAt)
                                         │  user table    (id → name, email, …)
                                         ▼
                                    c.var.user / c.var.session ──▶ your handler
```

Scripts and hardware do the same dance with an `x-api-key: …` header instead
of a cookie (API keys plugin, see the *API keys* section below).

## Files

| Path | Role |
|---|---|
| `src/auth.ts` | The `betterAuth({...})` instance: adapter, email+password, trusted origins, plugins |
| `src/db/auth-schema.ts` | **Generated** Drizzle tables (`user`, `session`, `account`, `verification`, …). Regenerate after adding a plugin: `npx auth@latest generate --config src/auth.ts --output src/db/auth-schema.ts -y`, then `npm run db:generate` |
| `src/middleware/auth.ts` | `resolveIdentity` (api key → cookie), `requireAuth` (401 if anonymous), `optionalAuth` (never blocks), `authSecurity` for docs |
| `src/types.ts` | `AppEnv`: the types of `c.var.user` and `c.var.session` |
| `src/app.ts` | `app.all("/api/auth/*", c => auth.handler(c.req.raw))`. That single line mounts every auth endpoint |
| `src/routes/me.ts` | `GET /api/me`, the smallest protected route; copy it |

## Protecting a route

```ts
const route = createRoute({
  method: "get",
  path: "/api/things",
  middleware: [requireAuth] as const,   // ← this
  security: [{ cookieAuth: [] }, { apiKey: [] }], // ← only affects /docs
  responses: { /* … */ },
});

things.openapi(route, (c) => {
  const user = c.var.user;   // typed, never undefined here
  …
});
```

## Endpoints you get for free (all under `/api/auth`)

| Method + path | Body | Notes |
|---|---|---|
| `POST /sign-up/email` | `{ name, email, password }` | Creates user + account + session; sets cookie |
| `POST /sign-in/email` | `{ email, password, rememberMe? }` | 401 on bad credentials |
| `POST /sign-out` | – | Deletes the session row, clears cookie |
| `GET /get-session` | – | `{ user, session }` or `null` |
| `POST /update-user` | `{ name?, image? }` | |
| `POST /change-password` | `{ currentPassword, newPassword }` | |

The React client (`web/src/lib/auth.ts`) wraps these as `authClient.signIn.email(...)`,
`authClient.signUp.email(...)`, `authClient.signOut()`, `authClient.useSession()`.

## Environment

| Variable | Dev default | Production |
|---|---|---|
| `BETTER_AUTH_SECRET` | a fixed dev string | **Required.** `npx auth@latest secret` |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public URL of the api, e.g. `https://myapp.onrender.com` |
| `WEB_ORIGIN` | `http://localhost:5173` | Unused when the api serves the SPA (same origin) |

`trustedOrigins` must list every origin that will POST to `/api/auth/*`.
In dev that is the Vite origin (`WEB_ORIGIN`); in production web and api
share `BETTER_AUTH_URL`, which is trusted implicitly.

## Testing

`test/helpers.ts` signs users up over HTTP and returns the `Cookie` header, so
tests exercise the real code path:

```ts
const { cookie } = await signUp(app);
const res = await app.request("/api/me", { headers: { cookie } });
```

State-changing auth calls need an `Origin` header that matches
`trustedOrigins` (CSRF protection); the helper sets it.

## API keys

For anything that is not a browser: Python scripts, bots, microcontrollers.

```
script ── x-api-key: mvp_… ──▶ requireAuth ──▶ auth.api.verifyApiKey({ key })
                                                  │  apikey table (hash → referenceId = user.id)
                                                  ▼
                                             load user row ──▶ synthetic session ──▶ c.var.user
```

- Created by a signed-in user in the app (`/app/api-keys`) or via
  `POST /api/auth/api-key/create { name }`. The full key is returned **once**;
  the table stores a hash plus the first 6 characters (`start`) for display.
- `requireAuth` checks the `x-api-key` header *before* cookies. A valid key
  yields the owner's `user` and a session-shaped record whose id is
  `apikey_<keyId>`; `c.var.authMethod` is `"apiKey"` so a handler can treat
  scripts differently if it wants to.
- Revoking (`POST /api/auth/api-key/delete { keyId }`) takes effect on the
  next request.
- The plugin's default rate limit is **10 requests per day per key**. It is
  disabled in `auth.ts`; turn it back on with sensible numbers if you ship.
- We do **not** use `enableSessionForAPIKeys` (the plugin's own session
  mocking); the explicit verify → load → set path is easier to reason about
  and lets you add key permissions later (`verifyApiKey({ key, permissions })`).

Example: `examples/add_item.py` (run it with `uv run`; you do not need a venv).

## Things that bite

- **Origin mismatch** → `403 Invalid origin`. Check `trustedOrigins` and that
  the browser is on the origin you think it is.
- **Cookie not sent** → the client is on a different origin from the api. In
  dev, always go through the Vite proxy (`localhost:5173`), never call
  `localhost:3000` directly from the page.
- **`Secure` cookie on http** → sessions vanish. Better Auth sets `Secure`
  only when `BETTER_AUTH_URL` is https; do not force https in dev.
- **Schema drift after adding a plugin** → regenerate `auth-schema.ts`
  *and* run `npm run db:generate`; migrations apply on next boot.
