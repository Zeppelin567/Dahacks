# BikeMap Cupertino: team consensus

DAHacks 5.0 · Fri 2026-10-16 → Sat 2026-10-17 · **Devpost closes Sat 2:00 PM** · judging 3:00–6:15 PM

> Living doc. If we change a decision, change it here first, then in code.

## The product in one line

A bike map for people who ride in Cupertino (to commute or for any other reason), with **two maps**:

1. **🛡️ Safe route**: the safest way from A to B. Every street is coloured by risk, and clicking a street tells you why.
2. **🌳 Green route**: a **City ↔ Rural slider**. Slide toward Rural and the route bends through parks, trees and quiet streets. You always see the trade-off: extra minutes vs. greenery gained and noise avoided.

## Decided

| Topic | Decision |
|---|---|
| Two maps | Two tabs in **one app**. They share the trip (start/end), the road graph and the backend. |
| Users | Anyone who bikes to get around Cupertino. Green map: weekend riders, people who want a calmer ride, and riders on hot days who want shade. |
| Area | **Cupertino only** for now. |
| Platform | **Desktop web first.** Mobile later if there's time. |
| Goal | **1st place overall.** |
| Green map controls | One **City ↔ Rural slider** (how much detour you'll accept) + 3 toggles: 🌳 Greenery / 🤫 Quiet / ☀️ Shade |
| Codebase | Built on our MVP_demo starter (MIT, written before the event; credited in the README and on Devpost) |
| User interviews | Not doing them |

## How we're judged (guide.deanzahacks.com/judging, checked 2026-10-16)

Four criteria, 25% each: Functionality · Creativity & Originality · Theme Fit (to *one* selected theme) · Presentation.
There's **no technical-complexity score**. AI only earns points where judges can *see* it working (better routes, explanations they can click). Devpost requires a 2–3 min demo video, a public repo and screenshots.

## Team

| Who | Owns |
|---|---|
| Business major | Pitch, demo script, Devpost write-up, demo video, slides. From Sat 10 AM, works only on these. |
| Model A | Safe pipeline: `safety_score` / `safety_reasons` in `py/app/bikemap/scoring.py` |
| Model B | Green pipeline: `green_score` (greenery / quiet / shade) |
| Model C | Routing engine: osmnx graph + weighted shortest path in `py/app/bikemap/engine.py` |
| Lead (Terry) | Frontend, integration, cutting scope every 2 h |

## Architecture (what exists now)

```
web/ (React + Leaflet)                      py/ (FastAPI)
  /safe   ─┐                                  app/bikemap/
  /green  ─┴─ fetch /api/py/bikemap/* ──api──▶  __init__.py  routes: /places /route /network
                                                models.py    ← THE CONTRACT (shapes below)
                                                engine.py    ← MOCK today → real osmnx routing
                                                scoring.py   ← TODO: per-edge scores
                                                places.py    preset Cupertino places
```

- Bike map routes are **public** (no sign-in), via a single line in `api/src/routes/py.ts`.
- **Everything is mock today** (the UI shows a "MOCK DATA" badge). Routes are curves, not real streets, and the network layer is a fake grid. The frontend is already wired to the final shapes, so replacing the mock doesn't touch `web/`.

### The contract (`py/app/bikemap/models.py` ⇄ `web/src/bikemap/api.ts`)

- `POST /bikemap/route` `{start:[lat,lng], end:[lat,lng], mode:"safe"|"green", rural:0..1, prefs:{green,quiet,shade}}`
  returns `{mock, fastest: Route, recommended: Route, compare}`
- `Route` = `{coords, distance_m, duration_min, segments: Segment[]}`
- `Segment` = `{coords, score: 0..1 (1 = best), level: good|ok|bad, reasons: string[]}`
- `GET /bikemap/network?layer=safe|green` returns every street segment with its score (the coloured base layer)
- Change a shape in **both** files together.

### Plan for the real engine

1. Download the Cupertino bike graph with osmnx **once**, save it to disk, and never hit Overpass at demo time.
2. Score every edge (`scoring.py`).
3. Compute routes:
   - Safe: `weight = length × risk_penalty`
   - Green: `weight = length × (1 − rural × green_score)`
   - Fastest: plain shortest path by length
4. Precompute the scores; the live API only does routing.

## Data we can use (researched 2026-10-16)

- **OSM tags**: `maxspeed`, `lanes` and `cycleway*` are nearly complete on Cupertino's arterials. Residential streets are mostly untagged, so assume 25 mph and 1 lane.
  ⚠️ osmnx drops `cycleway*` by default. Add `cycleway`, `cycleway:right|left|both`, `bicycle` and `surface` to `ox.settings.useful_tags_way` before downloading. If overpass-api.de is busy, use the mirror `https://maps.mail.ru/osm/tools/overpass/api`.
- **City of Cupertino Bikeways (Class I–IV), GeoJSON, no login**:
  `https://gis.cupertino.org/cupgis/rest/services/Public/Traffic_Infrastructure/MapServer/8/query?where=1%3D1&outFields=*&f=geojson`
- **Crashes: CCRS (CHP) on data.ca.gov**: public, 2016–2026, with lat/lon. Cupertino has about 15–25 bike crashes a year, which is too few to train a model on. Use them as a penalty and as a "we flagged X% of real crashes" check.
- **Street-level images**:
  - ⚠️ **Do not precompute a city-wide index from Google Street View.** Google's terms forbid it. A live "preview this street" view is the most it can be used for.
  - Use **Mapillary** (free token, CC BY-SA) instead. Check its Cupertino coverage in the first hour.
- **Greenery**: OSM parks, green landuse, water, and `natural=tree` / `tree_row`.

## Run it

```
npm install
npm run dev:py      # Python side-car (needs uv): http://localhost:8000
npm run dev         # web http://localhost:5173/safe  ·  api :3000
```

## Not decided yet

- Which theme we submit under (we lean **City Life & Rural Life**). Confirm once the official track text is posted.
- Final project name (placeholder: "BikeMap Cupertino")
- The demo route(s): pick ones where the fastest route takes a big road and the safe/green route visibly doesn't.
- Whether to deploy (the starter has `render.yaml`) or demo locally only
- UI style
- Whether the Safe map gets the street-image model, or OSM + city + crash data is enough
