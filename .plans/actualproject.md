# BikeMap Cupertino (working name): product & tech plan

DAHacks 5.0 · Fri 2026-10-16 → Sat 2026-10-17 · **Devpost closes Sat 2:00 PM**
This is the team's single plan. If you change a decision, change it here first, then in code.
Reference project: [Aggie Street Smart](../referenceproject.md) (HackDavis 2026).

## 1. Product

A bike map for people who ride in Cupertino, for commuting or anything else. It is one map with a 🏙️ Modern ↔ 🌿 Nature switch. Both modes share the same start/end, road graph and backend. We pitch under **both** themes (Modern Life + Nature Life).

1. **🏙️ Modern mode = Safe route**: the safest way from A to B. Every street is coloured by risk, and clicking a street says why.
2. **🌿 Nature mode = Green route**: a **Direct ↔ Scenic slider** (how much detour you'll accept) plus three toggles, 🌳 Greenery / 🤫 Quiet / ☀️ Shade. Slide toward Scenic and the route bends through parks, trees and quiet streets. Nature mode also shows park destinations (Hong Zhe's discovery map).

- **Area:** Cupertino, plus a 500 m buffer around the city boundary.
- **Platform:** desktop web first.

## 2. Stack (already in the repo)

| Part | What |
|---|---|
| Frontend | React 19 + Vite + Tailwind + shadcn/ui, maps with **Leaflet** (`web/src/bikemap/`) |
| Backend | Python FastAPI side-car (`py/app/bikemap/`), reached through `/api/py/bikemap/*`, public (no sign-in) |
| Contract | `py/app/bikemap/models.py` ⇄ `web/src/bikemap/api.ts`. Change both together. |
| Routing | `osmnx` graph + `networkx` Dijkstra, precomputed graph file loaded at startup |

The engine is real now (`mock=False`, city-wide scores baked into the graph).

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
| 6 | Model | Claude API. Run a 20-spot bake-off between Claude Haiku 5.5 and Claude Sonnet 5.5 first, then use the winner city-wide. |
| 7 | Prompt | Fixed rubric plus fixed JSON output with a fixed hazard list. All rules, including the expressway penalty, live **only in the prompt**. No hard-coded caps. |
| 8 | Routing | Felt distance with λ = 3, intersection penalty k = 20 m per point, 50% detour cap |
| 9 | Crash data | **Not used in scoring or routing.** Used only to validate. |
| 10 | City Bikeways | Joined to OSM edges and passed to the prompt as facts. Built segments only. |
| 11 | Graph and storage | Four scripts. The graph and scores are committed; photos, raw LLM replies and keys are not. |
| 12 | Shared with Green | **Sampling and photos are fully shared** with the Green route and fetched once. Safety and green are **two independent Claude calls** on the same photos, each with its own prompt, owner and score file. |

### Pipeline

```
py/scripts/
  1_build_graph.py            OSM download + City Bikeways join   → py/data/graph_raw.graphml
  2_photos.py                 sample → Metadata → Street View      → py/data/samples.json + photo cache   (shared)
  3_score.py --layer safe     safety prompt on the photos          → py/data/safety_scores.json           (Model A)
  3_score.py --layer green    green prompt on the same photos      → py/data/green_scores.json            (Model B)
  4_bake.py                   both scores + fallbacks into graph   → py/data/cupertino_bike.graphml
```

Each script can be rerun on its own, and so can each layer. `2_photos.py` and `3_score.py` skip anything already in the cache, so a crash or a rate limit only costs the call in flight. Changing the green prompt never touches the safety scores, and the reverse is also true.

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

#### 2. Photos (`2_photos.py`, shared with Green)

**Sampling**

- **Roads:** one point every 80 m along each undirected edge, heading = edge bearing. Two photos per point:
  - forward, heading = bearing
  - right, heading = bearing + 90
- **Intersections:** every node with `street_count >= 3`. Four photos, at headings 0 / 90 / 180 / 270.
- **Before buying any photo:** call the Street View **Metadata API**, which is free. It tells us whether imagery exists, its `pano_id` and its capture date.
  - Points that resolve to the same `pano_id` share one set of photos.
  - Pass `source=outdoor` and drop any pano whose returned location is more than 15 m from the sample point. Without this, metadata snaps to the nearest pano within 50 m, which can be inside a parking lot (seen in the 2026-10-16 key test).
  - Flag old imagery from `captured_at`. Threshold TBD; new bike lanes won't be in old photos.
- **No photos for off-street ways:** service roads (parking aisles, driveways), paths, cycleways and tracks get no photos. Google rarely covers them, and a nearby road photo would describe the wrong street. They use the fallback rule in step 4.
- **Street View car only:** panos whose copyright isn't Google (user-uploaded photospheres) are dropped (`third_party`).
- **$0 budget:** Static Street View is free for 10,000 photos a month, then $7 per 1,000. `2_photos.py` keeps a ledger (`data/cache/streetview_usage.json`), counts each photo before requesting it, and stops at **9,000 a month**. The default run is a dry run that only uses the free Metadata API; `--fetch` downloads.
- **What fits (dry run, 2026-10-16):** the city needs 17,473 photos and 9,000 fit. They are fetched in this order:
  1. Arterial forward
  2. Arterial right
  3. Arterial junctions
  4. Residential forward, one per street first

  Result:
  - All 1,427 arterial streets get photos, and 3,263 of 3,278 residential streets get at least one.
  - Residential junctions and residential right-side photos are left out and use the fallback rules.
  - Imagery exists for 94–99% of samples, and 18% of the imagery predates 2022.

#### 3. Scoring (`3_score.py --layer safe|green`)

The prompts, schemas, request settings, output format, bake-off rules and the mapping into the routing engine are all in **[scoring-spec.md](scoring-spec.md)** (`safe-v1`, `green-v1`). That spec replaces the earlier rubric and hazard list that were here.

#### 4. Bake (`4_bake.py`)

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

- **Load once:** load `cupertino_bike.graphml` once at FastAPI startup and keep it in memory. Start and end snap to the nearest node with `ox.nearest_nodes`.
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
| `py/data/cupertino_bike.graphml` | ✅ The demo runs offline |
| `py/data/samples.json`, `safety_scores.json`, `green_scores.json` | ✅ Diff them when a prompt changes |
| `py/data/cache/` (Street View photos, raw LLM replies) | ❌ gitignored. Google's photos must not go into a public repo |
| `.env` (Google Maps key, Anthropic key) | ❌ |

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
- **Same samples and photos as the Safe route** (§3, `2_photos.py`): same 80 m spacing, same forward + right photos, nothing extra fetched.
- **A separate Claude call** with its own prompt (`3_score.py --layer green`), owned by Model B. Safety and green are never asked in one call, so leafy streets can't inflate the safety score.
- Where each part comes from:

| Green part | Source |
|---|---|
| 🌳 Greenery / ☀️ Shade (tree canopy) | The photos. OSM has very few tree records. |
| Parks, Stevens Creek | OSM `leisure=park`, `waterway=stream`, no photos needed |
| 🤫 Quiet | Road type and speed from OSM, no photos needed |

- **Green scoring** (decided 2026-10-16, details in [scoring-spec.md](scoring-spec.md) §7 and §11):
  - The photo prompt gives a 1–10 `greenery_score` (rubric: 10 park or creek corridor … 1 industrial) and `shade_sky_pct`.
  - The engine (BikeButler paper method) uses:
    - **vegetation** = 0.75 × photo + 0.25 × OSM proxy (parks, water, street trees)
    - **shade** = photo canopy, else OSM tree density
    - **quiet** = road class
- **Safety floor:** an edge with safety below 0.2 costs 10× its length on the Green route too, so trees never pull a route onto an expressway.

**Ideas to discuss:**

- Show route tags such as `% tree canopy`, `% creek proximity`, `% parks & greenways`, using OSM parks, `waterway=stream` (Stevens Creek) and `natural=tree_row`.
- Demo anchors: McClellan Ranch, Blackberry Farm, Stevens Creek Trail, Memorial Park and Linda Vista Park on the nature side; De Anza College, Main Street and Apple Park on the city side.

## 5. UI (decided 2026-10-16, UI grilling)

Terry builds all of it. Code lives in `web/src/bikemap/`; Hong Zhe's prototype (`map-recommendation/`) is merged into it.

| # | Topic | Decision |
|---|---|---|
| U1 | Concept | One full-screen map with a **🏙️ Modern ↔ 🌿 Nature** switch. Modern = Safe route, Nature = Green route. Switching keeps the same trip. |
| U2 | Look | The switch flips everything. Modern: dark tiles, dark glass cards, cyan accent. Nature: light tiles, light frosted cards, green accent. No separate light/dark toggle. Tiles are Stadia Maps `alidade_smooth_dark` / `alidade_smooth`, keyless on localhost. CARTO was the plan, but it now watermarks tiles fetched without a key. A deployed site would need a free Stadia key. |
| U3 | Layout | Floating cards on the map: search top-left, mode switch top-centre, locate top-right, trip card left, detail card right, small stats bar bottom. |
| U4 | Fastest route | **Never shown**, neither on the map nor in the numbers. The API still computes it. |
| U5 | Start / end | Presets, or click the map ("Start here / Go here"). Locate-me is optional; the start defaults to De Anza. No GPS overlay. |
| U6 | Search | Live Nominatim through our backend, fired on Enter only (Nominatim policy bans search-as-you-type). Local presets and pins are matched first. |
| U7 | Pins | Both modes, same card, same "Route here" (sets **To**, keeps From). Modern = city presets; Nature = live Overpass parks (Hong Zhe's query + score), falling back to 8 built-in parks if Overpass takes more than 5 s. |
| U8 | Slider | Nature mode only: **Direct ↔ Scenic** plus Greenery / Quiet / Shade toggles. Modern mode has no slider. |
| U9 | Street click | Detail card: score 1–10, Claude's note, hazard chips (Modern) or greenery facts (Nature), the cached Street View photo (local demo only) and an "Open in Street View" link. |
| U10 | Dropped | Recent-visits drawer, "live status" pill, GPS permission overlay. |
| U11 | Name | "BikeMap Cupertino" for now. |
| U12 | Demo | Local only. |
| U13 | Green areas | Nature mode fills parks green and water blue from `py/data/green_layers.json` (757 parks, 40 water bodies, baked by `1_build_graph.py`). Street trees show as dots from zoom 15 up. No glow on routes, pins or buttons, and no emoji except on nature-spot pins. |
| U14 | Photo strip | In Nature mode the bottom bar shows 5 Street View photos spread along the route, each with its greenery score and a "x of 5 stops leafy" count. Clicking a photo opens that street's card. Backend: `POST /bikemap/route-photos` (`street.route_photos`), which reuses the same cached photos Claude scored. |

**Parked:** headline comparison numbers (after path planning) and extras: city-wide greenery layer, crash dots, 👍/👎 voting, multiple routes.

## 6. Not decided yet

- Demo routes: ones where the Safe/Green route visibly avoids a big road
- Who on the team owns which script
