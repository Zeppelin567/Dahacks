// Typed client for the api. `AppType` is imported as a type only, so nothing
// from api/ ends up in the browser bundle; you just get autocomplete and
// compile errors when a route changes.
import type { AppType } from "@mvp/api";
import { hc } from "hono/client";

export const api = hc<AppType>("/", {
  // Send the session cookie on every request (same origin, but explicit).
  init: { credentials: "include" },
});

/** Throws a readable Error for non-2xx responses (the api always returns {error,message}). */
export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    // non-JSON error body; keep the status text
  }
  throw new Error(message);
}
