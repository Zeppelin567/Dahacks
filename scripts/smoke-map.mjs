// Run against the same public origin a browser uses (local, container or Render).
import assert from "node:assert/strict";

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
async function get(path, init) {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(120_000) });
  assert.equal(response.status, 200, `${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

assert.match(await (await get("/")).text(), /BikeScape/);
for (const path of ["/api/health", "/api/py/health"]) {
  assert.equal((await (await get(path)).json()).ok, true);
}
const places = await (await get("/api/py/bikemap/places")).json();
const start = places.find((p) => p.id === "infinite-loop");
const end = places.find((p) => p.id === "library");
assert.ok(start && end, "Default trip places exist");
for (const mode of ["safe", "green"]) {
  const route = await (
    await get("/api/py/bikemap/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: [start.lat, start.lng],
        end: [end.lat, end.lng],
        mode,
        rural: 0.6,
        pref_override: { vegetation: -3, quiet: -3, shade: 0 },
      }),
    })
  ).json();
  assert.equal(route.mock, false);
  assert.ok(route.recommended.coords.length > 1);
  assert.ok(route.recommended.segments.length > 0);
  assert.ok(route.recommended.segments.every((s) => s.features));
  const cap = mode === "safe" ? 1.5 : 1.1 + 0.4 * 0.6;
  assert.ok(route.recommended.distance_m <= route.fastest.distance_m * cap + 1);
  const c = route.compare;
  if (mode === "safe") assert.ok(c.risky_segments_recommended <= c.risky_segments_fastest);
  else assert.ok(c.greenery_pct_recommended >= c.greenery_pct_fastest);
  const network = await (await get(`/api/py/bikemap/network?layer=${mode}`)).json();
  assert.ok(network.segments.length > 0);
  console.log(`${mode}: real route, ${route.recommended.distance_m} m, ${network.segments.length} streets`);
}
console.log(`BikeScape smoke check passed: ${base}`);
