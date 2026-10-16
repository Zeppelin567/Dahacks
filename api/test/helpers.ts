// Shared test utilities: talk to the app over HTTP exactly like a browser would.
export const ORIGIN = "http://localhost:3000";

/** Anything with a fetch-like request(): a Hono app, or an adapter over a real server. */
type AnyApp = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };

export function jsonInit(body: unknown, extra: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...extra },
    body: JSON.stringify(body),
  };
}

/** Collapse Set-Cookie headers into a Cookie header value. */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

let counter = 0;

/** Registers a fresh user and returns the cookie to act as them. */
export async function signUp(
  app: AnyApp,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  counter += 1;
  const user = {
    name: overrides.name ?? `Test User ${counter}`,
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    password: overrides.password ?? "correct horse battery",
  };
  const res = await app.request("/api/auth/sign-up/email", jsonInit(user));
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  return { user, cookie: cookieHeader(res) };
}

export async function signIn(app: AnyApp, email: string, password: string) {
  const res = await app.request("/api/auth/sign-in/email", jsonInit({ email, password }));
  return { res, cookie: res.status === 200 ? cookieHeader(res) : "" };
}
