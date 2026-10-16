// Entry point for `npm run dev`: same server, but NODE_ENV defaults to
// "development" (set here so the npm script stays cross-platform).
//
// Reloading uses Node's own `node --watch --import tsx`, not `tsx watch`.
// On Windows, `tsx watch` reads stdin (Enter = restart) from the same pipe the
// child inherits under `concurrently`; the first touch of `process.stdin` in
// the child (e.g. `import { versions } from "node:process"` inside
// @hono/node-server) then blocks forever and the api never listens.
// `npm run smoke:dev` guards this.
process.env.NODE_ENV ??= "development";
await import("./index");

export {};
