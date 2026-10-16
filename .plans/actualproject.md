# BikeMap Cupertino (working name): product & tech plan

DAHacks 5.0 · Fri 2026-10-16 → Sat 2026-10-17 · **Devpost closes Sat 2:00 PM**
This is the team's single plan. If you change a decision, change it here first, then in code.
Reference project: [Aggie Street Smart](../referenceproject.md) (HackDavis 2026).

## 1. Product

A bike map for people who ride in Cupertino, for commuting or anything else. It has **two maps**, as two tabs of one app sharing the same start/end, road graph and backend:

1. **🛡️ Safe route**: the safest way from A to B. Every street is coloured by risk, and clicking a street says why.
2. **🌳 Green route**: a **City ↔ Rural slider** (how much detour you'll accept) plus three toggles, 🌳 Greenery / 🤫 Quiet / ☀️ Shade. Slide toward Rural and the route bends through parks, trees and quiet streets. The trade-off (extra minutes vs. greenery gained) is always shown.

- **Area:** Cupertino, plus a 500 m buffer around the city boundary.
- **Platform:** desktop web first.

## 2. Stack (already in the repo)

| Part | What |
|---|---|
| Frontend | React 19 + Vite + Tailwind + shadcn/ui, maps with **Leaflet** (`web/src/bikemap/`, `web/src/pages/{safe,green}-route.tsx`) |
| Backend | Python FastAPI side-car (`py/app/bikemap/`), reached through `/api/py/bikemap/*`, public (no sign-in) |
| Contract | `py/app/bikemap/models.py` ⇄ `web/src/bikemap/api.ts`. Change both together. |
| Routing | `osmnx` graph + `networkx` Dijkstra, precomputed graph file loaded at startup |

The engine is a **mock** today, and the UI shows a "MOCK DATA" badge. Replacing the mock doesn't touch `web/`.

**How we're judged** (guide.deanzahacks.com/judging): four criteria at 25% each.

- Functionality
- Creativity & Originality
- Theme Fit, to *one* selected theme
- Presentation

There's no technical-complexity score, so AI only earns points where judges can see it working. Devpost needs a 2–3 min demo video, a public repo and screenshots.

**Team**

| Who | Owns |
|---|---|
| Business major | Pitch, demo script, Devpost write-up, demo video and slides. Works only on these from Sat 10 AM. |
| Model A | Safe scoring pipeline (§3) |
| Model B | Green scoring (§4) |
| Model C | Graph and routing engine (`py/app/bikemap/engine.py`) |
| Lead (Terry) | Frontend, integration, and cutting scope every 2 h |

## 3. Safe route

### The approach in one paragraph

We score every bikeable street and intersection in Cupertino the way Aggie Street Smart did (see [referenceproject.md](../referenceproject.md)):

1. Sample points along every road.
2. Fetch Google Street View photos at each point.
3. Send the photos plus the known map facts to a vision LLM, which returns a 1–10 safety score and a list of hazards.

Routing then finds the path with the shortest "felt distance", where low-scored roads and intersections count as longer than they are.
Everything is precomputed. At demo time the API only loads a graph file and runs Dijkstra, so no outside service is needed.

### Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Scoring method | Vision LLM on Street View photos for every sampled point (Aggie-style) |
| 2 | Final score | The LLM's 1–10 score **is** the final score. OSM and city facts go into the prompt as facts. There is no rule-based guardrail on top. |
| 3 | No imagery | Rule fallback by road type (table below). The reason shown to riders says so. |
| 4 | Road sampling | One point every 80 m. Two photos per point: forward and right. Free Metadata API first, deduplicated by `pano_id`. Two-way roads are scored once. |
| 5 | Intersections | Every node where ≥3 streets meet. Four photos (N/E/S/W), scored by the LLM. |
| 6 | Model | DigitalOcean serverless inference. Run a 20-spot bake-off between 2–3 vision models first, then use the winner city-wide. |
| 7 | Prompt | Fixed rubric plus fixed JSON output with a fixed hazard list. All rules, including the expressway penalty, live **only in the prompt**. No hard-coded caps. |
| 8 | Routing | Felt distance with λ = 3, intersection penalty k = 20 m per point, 50% detour cap |
| 9 | Crash data | **Not used in scoring or routing.** Used only to validate. |
| 10 | City Bikeways | Joined to OSM edges and passed to the prompt as facts. Built segments only. |
| 11 | Graph and storage | Three scripts. The graph and scores are committed; photos, raw LLM replies and keys are not. |

### Pipeline

```
py/scripts/
  1_build_graph.py   OSM download + City Bikeways join        → py/data/graph_raw.graphml
  2_score.py         sample → Street View → LLM (resumable)   → py/data/scores.json
  3_bake.py          write scores + fallbacks into the graph  → py/data/cupertino_safe.graphml
```

Each script can be rerun on its own. `2_score.py` skips anything already in the cache, so a crash or a rate limit only costs the call in flight.

#### 1. Graph (`1_build_graph.py`)

- **Download:** `osmnx` with `network_type="bike"`, directed (one-way streets apply to bikes too). The area is the Cupertino boundary plus a **500 m buffer**, which keeps routes near the city edge sensible and includes Lawrence Expressway.
- **Tags to keep:** add these to `ox.settings.useful_tags_way` **before** downloading, because osmnx drops them by default:
  - `cycleway`, `cycleway:right`, `cycleway:left`, `cycleway:both`, `cycleway:*:buffer`
  - `turn:lanes`, `cycleway:lanes`
  - `maxspeed`, `lanes`, `surface`, `bicycle`
- **Overpass:** overpass-api.de needs a `User-Agent` header (it returns 406 without one) and may need a retry with backoff.
- **City Bikeways join:**
  - Source: `https://gis.cupertino.org/cupgis/rest/services/Public/Traffic_Infrastructure/MapServer/8/query?where=1%3D1&outFields=*&f=geojson`
  - Keep only `Status` in (`Active`, `Complete`). 51 of the 332 features are planned (Programmed, Proposed, Design and so on) and do not exist yet.
  - Buffer each city line by 10 m. An OSM edge takes that city feature if ≥60% of its length falls inside the buffer.
  - Store the city `PathType` text on the edge (`SEPARATED BIKEWAY`, `BUFFERED BIKE LANE`, `BIKE LANE`, `BIKE BLVD`, `BIKE ROUTE`, `BIKE PATH` …). Don't use `CLASS`, because Class III mixes quiet bike boulevards with signed-only routes on arterials.
- **Signals:** the OSM `highway=traffic_signals` nodes (182 in the city) mark signalised intersections.

#### 2. Scoring (`2_score.py`)

**Sampling**

- **Roads:** one point every 80 m along each undirected edge, heading = edge bearing. Two photos per point:
  - forward, heading = bearing
  - right, heading = bearing + 90
- **Intersections:** every node with `street_count >= 3`. Four photos, at headings 0 / 90 / 180 / 270.
- **Before buying any photo:** call the Street View **Metadata API**, which is free. It tells us whether imagery exists, its `pano_id` and its capture date.
  - Points that resolve to the same `pano_id` share one set of photos.
  - Flag old imagery from `captured_at`. Threshold TBD; new bike lanes won't be in old photos.
- **Budget:** run the metadata pass first and count the photos actually needed. Static Street View has 10,000 free photos a month, then $7 per 1,000. Set a quota in Google Cloud Console, because Google Maps Platform has no automatic spending cap.

**Model call**

- **Provider:** DigitalOcean serverless inference.
- **Bake-off:** before the city-wide run, score 20 places the team knows against 2–3 vision models (candidates from the DO catalog: Kimi K3, Qwen3.8-Max, Nemotron Nano 12B VL). Keep the model whose scores match common sense.
  - The 20 places must include Stevens Creek × De Anza, a 280 ramp, Lawrence Expressway, the Mary Ave bike bridge and a few quiet residential streets.
- **Before starting:** confirm three things on the DO account: credits, rate limits, and which models list image input in `/v1/models`.
- **Cache:** each call's raw reply goes to `py/data/cache/llm/{key}.json`. Photos go to `py/data/cache/streetview/`.

**Prompt**

The prompt has three parts:

1. **Role:** an experienced urban cyclist rating how safe this spot is to ride.
2. **Facts:** speed limit, lane count, highway type, OSM cycleway tags, `turn:lanes` / `cycleway:lanes` if present, the City `PathType` if joined, and signal yes/no for intersections. Missing values are stated as unknown. When OSM and the City disagree, give both with their source and let the photo decide. The prompt says: *these are facts; don't re-guess them from the photo.*
3. **Rubric and the output schema**, as below.

**Rubric**

| Situation | Score |
|---|---|
| Separated bike path / physically protected lane | 9–10 |
| Bike lane in good condition | 7–8 |
| No bike lane, with curbside parking | ≤ 5 |
| Multi-lane road, no bike facility | 3–4 |
| No reasonable person would ride it | 1–2 |
| **Expressway**: name contains "Expressway", or ≥45 mph, or ≥6 lanes (Lawrence, Foothill) | **1–2** |
| Bike lane squeezed between the through lane and a right-turn lane (cars cross it to turn) | ≤ 4 |
| Freeway on/off ramp where traffic crosses the bike lane | ≤ 3 |
| Bike lane ends abruptly | ≤ 4 |
| *Intersection*: signalised, with a bike box or crossing markings | 8–10 |
| *Intersection*: unsignalised crossing of a multi-lane road | 1–3 |

**Output** (strict JSON, temperature 0)

```json
{
  "score": 1,
  "hazards": ["door_zone", "no_bike_lane", "poor_pavement", "blind_corner",
              "right_turn_slip_lane", "construction", "high_speed_traffic", "wide_crossing",
              "bike_lane_between_turn_lanes", "bike_lane_drops", "freeway_ramp_crossing", "expressway"],
  "confidence": "high | medium | low",
  "note": "one short sentence"
}
```

- `hazards` may only contain values from that list. The frontend maps each value to a fixed plain-English line, e.g. `door_zone` → "Parked cars: watch for opening doors".
- `confidence: low` is shown to riders as ⚠️ uncertain.

#### 3. Bake (`3_bake.py`)

- **Edge score:** the median of its sample points' scores.
- **Hazards:** the union of its samples' hazards.
- **Edges with no imagery** use the fallback rule below.

| Edge | Fallback score |
|---|---|
| City `SEPARATED BIKEWAY` / `BIKE PATH` (Class I / IV) | 9 |
| `highway` = cycleway / path | 9 |
| residential / living_street | 7 |
| tertiary | 5 |
| secondary | 4 |
| primary | 3 |

Fallback edges get the reason *"No street imagery — scored from map data"*.

Intersections with no imagery use Aggie's rule: Y-junction 8, T-junction 7, four-way 5.5, and +1.5 if signalised.

**API scale:** `py/app/bikemap/models.py` uses 0..1 scores. The engine converts with `score / 10`, so the web contract doesn't change.

### Routing (`py/app/bikemap/engine.py`)

- **Load once:** load `cupertino_safe.graphml` once at FastAPI startup and keep it in memory. Start and end snap to the nearest node with `ox.nearest_nodes`.
- **Edge weight:**
  - `weight = length × (1 + λ × (10 − score) / 9)` with **λ = 3**
  - A 10-point road counts at its real length; a 1-point road feels 4× longer.
- **Intersection penalty:**
  - Add `k × (10 − node_score)` metres to the edge entering a scored intersection, with **k = 20**
  - A 1-point intersection costs an extra 180 m.
- **Fastest route:** plain Dijkstra on `length`, used for the comparison numbers.
- **Detour cap:** if the Safe route is more than 50% longer than the fastest route, halve λ and rerun.
- **Tuning:** λ, k and the cap are constants. Tune them on Saturday with the real demo routes.

### Validation (crash data)

- **Data:** CCRS on data.ca.gov has 295 bike-involved crashes in Cupertino for 2016 to 8 Oct 2026, and 275 of them have coordinates.
  - Query it with `https://data.ca.gov/api/3/action/datastore_search_sql`. No download is needed.
  - Filter crashes on `"City Name"='Cupertino'`.
  - A crash is bike-involved when the parties join on `CollisionId` and `PartyType='Bicyclist'` or `Vehicle1TypeDesc IN ('Bicycle','ElectricBicycles')`.
- **Crashes never touch scoring or routing.** The LLM never sees them, so all 275 are a clean test.
- **Metric:** *"Red segments are X% of road length but contain Y% of real bike crashes."* Match a crash to an edge if it is within 25 m.
- **If Y isn't clearly above X,** we fix the prompt or we don't use the number. No cherry-picking.
- **Caveat:** total crashes drop sharply from 2019. That could be COVID or a reporting change, so we quote ratios, not trends.

### What gets committed

| Path | Committed? |
|---|---|
| `py/data/cupertino_safe.graphml` | ✅ The demo runs offline |
| `py/data/scores.json` | ✅ Diff it when the prompt changes |
| `py/data/cache/` (Street View photos, raw LLM replies) | ❌ gitignored. Google's photos must not go into a public repo |
| `.env` (Google Maps key, DigitalOcean key) | ❌ |

### Facts we measured (2026-10-16)

- **OSM in the city:** maxspeed is on 93% of arterials and 17% of residential streets; lanes on 97% and 26%. 98% of arterials carry a cycleway tag.
- **Lighting:** `lit` is on only 4% of ways, so there's no night mode.
- **Bikeways layer:** Class II 27.4 mi, III 11.0 mi, I 3.4 mi and IV 3.0 mi are built.
- **Other city layers:** the same MapServer also has traffic signal heads (3), traffic calming (32), traffic signs (34) and bike parking (88).
- **Bike crashes per year:** 45 / 39 / 42 / 24 / 21 / 13 / 21 / 25 / 25 / 34 for 2016–2025, and 6 so far in 2026.

## 4. Green route

**Decided:**

- One City ↔ Rural slider plus three toggles: Greenery / Quiet / Shade.
- The current formula: `weight = length × (1 − rural × green_score)`.

**Ideas to discuss, from the earlier draft:**

- Have the same Street View + vision LLM pass return a **nature score** alongside the safety score, so one batch of calls covers both maps. The nature rubric:
  - 9–10: creek corridor or dense canopy
  - 7–8: tree-lined residential street
  - 5–6: young trees
  - 3–4: concrete commercial strip
  - 1–2: industrial area or parking lots
- Show route tags such as `% tree canopy`, `% creek proximity`, `% parks & greenways`, using OSM parks, `waterway=stream` (Stevens Creek) and `natural=tree_row`.
- **Safety floor:** the Green route must never send riders onto a dangerous road just because it has trees. Penalise edges whose safety score is below 5.
- Demo anchors: McClellan Ranch, Blackberry Farm, Stevens Creek Trail, Memorial Park and Linda Vista Park on the nature side; De Anza College, Main Street and Apple Park on the city side.

## 5. UI ideas (not decided)

- A letter grade (A–F) per route. We need to decide how it's computed and whether `grade` / `risky_crossings` go into the contract.
- A Street View storyboard that previews a route with the AI's notes at each stop.
- Suggested-destination pins on the map before a destination is picked, then routing in one click.
- Several candidate routes per trip instead of one recommended route.
- Picking start and end by clicking the map, not only from presets.
- A layer showing real crash points.
- A detour slider on the Safe page.

## 6. Not decided yet

- Which theme we submit under. Check the official track text: "City Life & Rural Life" or "City Life and Natural Life".
- Final name (candidates: BikeMap Cupertino, VerdantRide)
- Demo routes: ones where the fastest route takes a big road and the Safe/Green route visibly doesn't
- Deploy, or demo locally only
- Who on the team owns which script
