// `npm run smoke:dev` — boots `npm run dev` exactly as a person would and
// checks the browser's view of it through the Vite dev server (:5173):
// health, docs page, OpenAPI spec, and a real sign-up + session round trip.
//
// Why it exists: unit tests call app.request() and never start the dev
// launcher. On Windows, `tsx watch` under `concurrently` hung the api before it
// could listen (both processes shared one stdin pipe), so the UI loaded but
// every /api and /docs request was a 502. Only a test at this seam sees that.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const WEB = "http://localhost:5173";
const BOOT_TIMEOUT_MS = 90_000;
const isWin = process.platform === "win32";

const dev = spawn("npm", ["run", "dev"], {
  cwd: new URL("..", import.meta.url),
  shell: isWin,
  detached: !isWin, // own process group on POSIX so we can kill the whole tree
  stdio: ["pipe", "pipe", "pipe"], // like concurrently/CI: stdin is a pipe, not a TTY
  env: { ...process.env, NODE_ENV: undefined, FORCE_COLOR: "0" },
});
let output = "";
dev.stdout.on("data", (d) => (output += d));
dev.stderr.on("data", (d) => (output += d));

function stop() {
  if (dev.exitCode !== null) return;
  if (isWin) spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-dev.pid, "SIGTERM");
}

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

try {
  // 1. Wait until the api answers *through the proxy* (Vite alone is not enough).
  const started = Date.now();
  let health;
  while (Date.now() - started < BOOT_TIMEOUT_MS) {
    try {
      const res = await fetch(`${WEB}/api/health`);
      if (res.ok) {
        health = await res.json();
        break;
      }
    } catch {
      // Vite not up yet
    }
    await sleep(500);
  }
  check(
    "GET /api/health via :5173",
    health?.ok === true,
    health ? `after ${Date.now() - started} ms` : "api never answered",
  );

  if (health?.ok) {
    const docs = await fetch(`${WEB}/docs`);
    check(
      "GET /docs via :5173",
      docs.status === 200 && (docs.headers.get("content-type") ?? "").includes("text/html"),
      `${docs.status}`,
    );

    const spec = await fetch(`${WEB}/api/openapi.json`);
    const specJson = spec.ok ? await spec.json() : null;
    check("GET /api/openapi.json via :5173", specJson?.openapi === "3.1.0", `${spec.status}`);

    // 2. Browser-shaped auth round trip: sign up, then use the cookie.
    const email = `smoke-${Date.now()}@example.com`;
    const signUp = await fetch(`${WEB}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: WEB },
      body: JSON.stringify({ name: "Smoke", email, password: "smoke-password-1" }),
    });
    check("POST sign-up via :5173", signUp.status === 200, `${signUp.status}`);
    const cookie = signUp.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const signIn = await fetch(`${WEB}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: WEB },
      body: JSON.stringify({ email, password: "smoke-password-1" }),
    });
    check("POST sign-in via :5173", signIn.status === 200, `${signIn.status}`);

    const me = await fetch(`${WEB}/api/me`, { headers: { cookie } });
    const meJson = me.ok ? await me.json() : null;
    check("GET /api/me with session cookie", meJson?.email === email, `${me.status}`);
  }
} finally {
  stop();
}

if (failures.length > 0) {
  console.log("\n--- dev output (last 40 lines) ---");
  console.log(output.split(/\r?\n/).slice(-40).join("\n"));
  console.log(`\nsmoke:dev FAILED (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nsmoke:dev passed");
process.exit(0);
