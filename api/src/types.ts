// Hono "Env" for this app: what `c.var` / `c.get()` can hold.
import type { auth } from "./auth";

export type SessionData = typeof auth.$Infer.Session;
export type User = SessionData["user"];
export type Session = SessionData["session"];

/** How the caller proved who they are. */
export type AuthMethod = "cookie" | "apiKey";

export type AppEnv = {
  Variables: {
    /** Set by requireAuth (and optionalAuth when credentials are present). */
    user: User;
    session: Session;
    authMethod: AuthMethod;
  };
};
