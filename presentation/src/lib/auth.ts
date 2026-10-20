// Browser side of Better Auth. Same origin as the page (Vite proxy in dev,
// api serves the SPA in prod), so no baseURL is needed.
import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [apiKeyClient()],
});

export type Session = typeof authClient.$Infer.Session;
