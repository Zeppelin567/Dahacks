# BikeMap Cupertino: how the backend works (the story)

> **Team copy, Fri 2026-10-16.** Written against commit `161c005` plus the map clean-up on branch `fix/map-coherence` (§5.4, not yet merged into `main`). The routing fixes in §6.8 are **in progress** on a separate branch; every routing number in §6 still describes `161c005`.
> Every number was recomputed from `py/data/*` with the team's Python environment, or quoted from the plan, the spec or the research notes, with the source named. **[CHECK]** marks anything we could not verify from the repo.
> The scripts that produced the numbers live in the session scratchpad, not in the repo: `mapfix/story/` (`stats_data.py`, `stats_scores.py`, `stats_graph.py`, `stats_more.py`, `bakeoff.py`, `routes.py`), the acceptance check `mapfix/final/check_a.py`, and the fact-check re-runs in `factcheck/` (`fc1.py`–`fc6.py`).

**Who this is for:** everyone presenting. The business-major teammate writes the pitch from §0–§9. Everyone should read §9 (honesty) and §11 (judge questions).

---

## 0. The backend in one paragraph, and the numbers to remember

**Pitch paragraph.**
We built a bike map of Cupertino that rates how every street feels to ride: from photos on 95% of drivable street length, and from map data everywhere else. We downloaded the city's whole street network from OpenStreetMap and joined it with the City of Cupertino's own bikeway map. We placed a check point every 80 metres and fetched 8,931 Google Street View photos, all inside Google's free tier. Claude Haiku 5.5 then looked at every photographed spot: once for safety, using Level of Traffic Stress, a published traffic-engineering standard, and, on roads, once more for greenery and shade. That came to 10,959 recorded Claude calls for **$2.38** in total. We took each street's median score and baked it into a routing graph. When a rider asks for a route, the server answers in about a tenth of a second with no outside service: it returns the fastest route, a Safe or Green route, and the reason behind every coloured stretch.

**Say it like this:** *"We had Claude look at photos of 95% of Cupertino's streets, twice, for $2.38, so the map can tell you why a street is low-stress or green."*

### Numbers cheat sheet (all verified unless marked)

| Number | What it is | Source |
|---|---|---|
| **8,514 / 19,817** | Junctions and dead-ends (nodes) / one-way pieces of street (directed edges) in the graph | `cupertino_bike.graphml` |
| **10,778 street pieces, 629 km** | The same network counted once per physical street (a two-way road counts once) | recomputed |
| **Cupertino + 500 m** | The map area: the city boundary plus a 500 m buffer | `1_build_graph.py` |
| **281 of 332** | City bikeway features that are built (Active or Complete). The other 51 are only planned and were left out | `city_bikeways.geojson` |
| **44.8 mi** | Built city bikeways (bike lanes 25.6, routes 7.8, paths 3.4, bike boulevards 3.3, separated 3.0, buffered 1.7, public right-of-way 0.1) | recomputed |
| **315** | Junctions marked as having a traffic signal | graph |
| **7,917** | Check points (samples): 6,411 on roads (one every 80 m) and 1,506 at junctions | `samples.jsonl` |
| **94.6%** | Check points where Google has usable car imagery (7,487 of 7,917) | `samples.jsonl` |
| **17,473 → 8,931** | Photos the whole city would need → photos we fetched, cheapest-to-skip left out first | `samples.jsonl`; 8,931 files on disk |
| **$0** | Street View cost. Metadata checks are free, and 8,931 photos fit under the 10,000/month free tier (our own cap is 9,000) | `2_photos.py` |
| **2024-09** | Median capture month of the photos we used. 16.5% are older than 2022 | `samples.jsonl` |
| **Claude Haiku 5.5** | `claude-haiku-5-5`, $0.10 / $0.50 per million input / output tokens | `3_score.py` |
| **5,743 + 5,196** | Spots scored for safety (5,196 road + 547 junction) + spots scored for greenery (road only) | score files |
| **10,959** | Claude calls recorded (5,763 safety including the 20-spot test, plus 5,196 green). 0 refusals, 0 errors | score files |
| **$2.38** | Claude spend recorded in the score files: safety $1.49 + green $0.90 (about $0.0002 a call) | recomputed from token usage × the prices in `3_score.py` |
| **< 1 hour** | Wall-clock time for both city-wide scoring runs (8 parallel workers) | **[CHECK]** inferred from commit times 14:04 → 15:00 |
| **95%** | Share of drivable street length (355 km) scored from photos. Arterials: 97.5% | baked graph |
| **54%** | Share of the *whole* network (629 km) scored from photos. The rest is mostly parking aisles, driveways and off-street paths, which Street View doesn't cover | baked graph |
| **542** | Junctions with a photo-based safety score. The other 5,559 use a rule | baked graph |
| **17** | Fixed hazard types Claude may report (door zone, freeway ramp, no bike lane …) | `score_prompts.py` |
| **< 1 s / ~0.1 s** | Graph load at the first request (0.6–0.7 s measured) / one route request (0.03–0.13 s on the 5 preset trips) | measured |
| **19,817 → 1,592** | Lines drawn on the Safe map before → after the map clean-up (4.8 MB → 0.64 MB) | measured (§5.4) |
| **688 → 58** | Places where the Safe colour flips along the same street, before → after. 32 of the 58 are real changes in the road; 26 are the ends of red hazard spots | measured (§5.4) |
| **737 → 72** | The same on the Green map. 17 are real changes in the road; 55 are the ends of dark-green "green stretches" | measured (§5.4) |

---

## 1. The problem: the fastest route is not the safe route

- Map apps send bikes the shortest way. In Cupertino the shortest way often runs along 6-lane arterials, such as Stevens Creek Blvd and De Anza Blvd, or near expressways, such as Lawrence and Foothill.
- Most people who would ride are "interested but concerned". They will ride on a quiet street or a protected lane. They won't ride next to 40 mph traffic. Traffic engineers call this rider type out by name (see §4.2).
- A bike-lane map alone doesn't answer the question. A painted lane on a 6-lane, 40 mph road is still stressful. A quiet street with no lane at all can be perfect.
- So we need **a judgement for every street, not only the ones with bike lanes.** That is why the map scores every street, and why the router can trade a few extra minutes for a calmer ride.
- The Green map asks the other half of the theme: can a city ride feel like a country ride? It does the same thing with trees, parks, quiet streets and shade.

**Say it like this:** *"Google gives you the fastest way. We give you the way you'd actually let your kid ride, and we show you what it costs in minutes."*

---

## 2. Getting the map (`py/scripts/1_build_graph.py`)

### 2.1 What we downloaded and why

| Source | What we take | Why | Cost |
|---|---|---|---|
| **OpenStreetMap** via `osmnx` (Nominatim for the boundary, Overpass for the data) | Every way a bike may use, as a directed graph (`network_type="bike"`). One-way streets apply to bikes too | The road network the router walks on | Free |
| Extra OSM tags | `cycleway*`, `lanes`, `maxspeed`, `turn:lanes`, `surface`, `bicycle`, `lit` | osmnx drops these by default. Claude needs them as facts | Free |
| **City of Cupertino Bikeways** (city GIS server) | The `PathType` of every built bikeway (bike lane, buffered lane, separated bikeway, bike boulevard, path, route) | The city's own record of what exists, more current than OSM in places | Free, no key |
| **OSM traffic signals** | Signal points within 30 m of a junction → `signal = True` | US mappers often put the signal on each approach, not on the junction itself | Free |
| **OSM parks, green land, water, trees** | Distance to the nearest park or green area, distance to water, and the number of trees within 25 m, for every edge | Inputs for the Green map, and a backup for what photos can't see | Free |

### 2.2 How the City Bikeways join works (in plain words)

1. Keep only built features (`Active` or `Complete`): 281 of 332. The other 51 are planned (Programmed, Design, Proposed and so on) and don't exist yet.
2. Draw a 10 m band around each city bikeway line.
3. An OSM street piece takes that bikeway if at least 60% of its length lies inside the band.
4. If several match, the best facility wins: separated bikeway > path > buffered lane > bike boulevard > bike lane > route.
5. Parking aisles and driveways (`highway=service`) never take a bikeway, because they only run next to one.

Result: 1,365 street pieces (2,152 directed edges) carry a city bikeway type, 50.6 miles in all. The matched miles are higher than the 44.8 built miles. **[CHECK]** The likely reason is that both carriageways of a divided road, or a road plus a parallel OSM path, can match the same city line.

### 2.3 What the map looks like, in numbers

| Road type (OSM `highway`) | Street pieces | km | What it is |
|---|---|---|---|
| service | 5,409 | 231.1 | Parking aisles, driveways, alleys |
| residential | 3,363 | 250.0 | Neighbourhood streets |
| tertiary | 540 | 32.4 | Small connector roads |
| secondary | 450 | 33.7 | Main roads |
| primary | 392 | 22.9 | Big arterials (Stevens Creek, De Anza) |
| cycleway / path / track / pedestrian | 410 | 42.8 | Off-street paths and trails |
| trunk + trunk_link | 54 | 8.0 | Expressways and their ramps (Lawrence, Foothill) |
| other (unclassified, living street, link roads) | 160 | 8.0 | |
| **Total** | **10,778** | **629.0** | |

- **OSM fact coverage** on primary, secondary and tertiary streets: speed limit 93%, lane count 95%, cycleway tags 92%. On residential streets: speed limit 24%, lanes 27%. Lighting (`lit`) is on only 2.1% of all streets, so there is no night mode.
- **Connectivity:** 99.2% of nodes sit in one strongly connected network, so almost any point can reach any other.
- **Green features:** 757 park or green-area polygons, 40 water polygons and 3,078 tree points. 42% of street pieces are within 100 m of green space. Only 7% have an OSM tree within 25 m, because OSM records few trees in Cupertino. That is why the photos matter for greenery (§7).
- **Stable IDs:** the script reuses `graph_raw.graphml` by default. Every photo sample and score points at an edge ID, so re-downloading OSM could orphan them. `--redownload` is there if we ever need it.

**Outputs:** `py/data/graph_raw.graphml`, `py/data/city_bikeways.geojson`, `py/data/green_layers.json` (served at `GET /bikemap/green-layers`), plus a check report and a PNG in `py/data/cache/reports/`.

**Say it like this:** *"We started from OpenStreetMap, added the City of Cupertino's own bikeway records and every traffic signal, and ended up with 629 km of street in one routable graph."*

---

## 3. Seeing every street (`py/scripts/2_photos.py`)

### 3.1 Where we look

- **Roads:** one check point every 80 m along each street piece, with at least one per piece. Each two-way street is sampled once, not once per direction. The heading follows the street.
- **Junctions:** every node where 3 or more photographed streets meet.
- **Only streets a Street View car drives:** primary, secondary, tertiary, trunk (and their links), residential, living street, unclassified. Parking aisles, driveways, paths, cycleways and tracks get no photos. Google rarely covers them, and a photo from the nearby road would describe the wrong place. They get a rule score instead (§5).
- **Result:** 7,917 check points: 6,411 on roads and 1,506 at junctions.

### 3.2 The free check before any photo is bought

For every check point we first call the **Street View Metadata API**. It is free and unlimited, and it says whether a photo exists, its panorama ID and its capture month.

| Result | Count | What happens |
|---|---|---|
| ok (Google car imagery within 15 m) | 7,487 (94.6%) | Eligible for photos |
| third_party (a user-uploaded photosphere, not the Google car) | 271 | Dropped |
| no_imagery | 156 | Rule fallback |
| too_far (nearest panorama more than 15 m away) | 3 | Rule fallback |

- We ask with `source=outdoor` and a 15 m radius. In our key test the default 50 m search snapped a point to a panorama inside a parking lot (.plans/actualproject.md), and the reference project's 100 m radius put trail points onto a freeway (research/reference.md).
- The median distance from a check point to its panorama is 3.0 m.

### 3.3 Which photos, and staying at $0

- **Road point:** a FORWARD photo (direction of travel) and a RIGHT photo (the curb side, where a bike rides). **Junction:** four photos facing N, E, S and W. All are 640×640 with a 90° field of view.
- Headings are rounded to 10°, so neighbouring points that land on the same panorama share photos. 9,198 photo uses map to 8,931 distinct files.
- **The whole city would need 17,473 photos. The free tier is 10,000 a month.** The script keeps a ledger, counts each photo *before* it asks for it, and stops at 9,000. That leaves 1,000 spare for anything else on the account.
- **Priority order**, so that if the budget runs out, the least useful photos are the ones left out:

| Tier | Photos | Why this order |
|---|---|---|
| 1 | Arterial, forward | Big roads are where the danger is |
| 2 | Arterial, right (curb side) | Shows the bike lane, parked cars and driveways |
| 3 | Arterial junctions (4 photos) | Hard crossings |
| 4 | Residential, forward | One per street first, then second points. The budget ran out here: 871 residential points got no photo |
| 5 | Residential junctions | Left out, rule fallback (42 got a photo anyway, by sharing a file with a nearby point) |
| 6 | Residential, right | Left out, rule fallback |

- Within a tier, every street's first point comes before any street's second point, so a shortfall thins coverage evenly instead of dropping whole neighbourhoods.

### 3.4 What we ended up with

| | Count |
|---|---|
| Photos fetched | **8,931** (all on disk, none in git) |
| Check points with photos | 5,781: 5,196 road + 585 junction |
| Road points with forward + right | 1,783 |
| Road points with forward only | 3,413 |
| Junctions with all 4 photos | 543 (38 have 1 photo, 4 have 2–3) |
| Arterial street pieces with at least one photo | 1,427 of 1,482 sampled |
| Residential street pieces with at least one photo | 3,259 of 3,475 sampled |

**Imagery age** (the 5,781 photographed points): the median capture month is 2024-09, and the range is 2007-07 to 2025-10. 62% were taken in 2024 or 2025, and 16.5% are older than 2022. The capture month goes into the prompt, so Claude knows how old the photo is.

**Say it like this:** *"We checked 7,917 spots for free first, then spent our free photo budget where danger lives: arterials and their crossings first. 8,931 photos, zero dollars."*

---

## 4. Teaching Claude to judge a street (`3_score.py`, `score_prompts.py`, `.plans/scoring-spec.md`)

### 4.1 The set-up

- **Model:** Claude Haiku 5.5 (`claude-haiku-5-5`), the cheapest current Claude model ($0.10 / $0.50 per million input / output tokens, against $1 / $5 for Haiku 4.5), released 2026-10-07 (research/claude.md).
- **Two separate calls per spot:** one for safety (prompt `safe-v2`) and one for greenery (prompt `green-v1`), on the same photos. Because they are never asked together, a leafy street can't talk its way into a better safety score.
- **"Facts in, judgement out"** (an idea we kept from the reference project, Aggie Street Smart): we tell Claude the facts the map already knows. Those are the speed limit, lanes, one-way status, OSM bike tags, the city bikeway type, turn lanes and the photo date. For a junction they are the number of legs, the signal, and each approach road. Claude is told not to re-guess them from the photo. Its attention goes to what only a photo shows: parked cars, driveways, the real bike lane, pavement and sight lines.
- **Each message:** a label before each photo ("Photo 1 of 2: FORWARD …", "Photo 2 of 2: RIGHT (curb side) …"), then the MAP FACTS block, then "Rate this spot."

### 4.2 The rubric: Level of Traffic Stress (LTS)

LTS is a standard from traffic engineering (Mekuria, Furth and Nixon, Mineta Transportation Institute report 11-19, 2012; Furth's updated tables v2.2, 2022; sources in research/criteria.md). It sorts streets by **who would feel OK riding them**:

| LTS | In plain words | Who rides it | Our default score (1–10) |
|---|---|---|---|
| 1 | Calm. Separated from traffic, or a slow, quiet street | Children | 9 (10 only for a separated path or protected lane with nothing in the way) |
| 2 | Your own space except at crossings | Most adults, the "interested but concerned" | 7 |
| 3 | Next to moderate-speed or multi-lane traffic | Confident riders | 5 |
| 4 | Mixed in with fast traffic | Only the "strong and fearless" | 2 (1 = no reasonable person would ride it) |

How Claude uses it:

1. **Step A:** look up LTS from the facility type, the posted speed and the lanes per direction (the table is in the prompt). For example, a bike lane next to 2 through lanes at 40 mph is LTS 3.
2. **Step B:** start from the default score, then move up to 1 point for what the photos show: pavement, buffer width, sight lines, driveways, how busy the street looks.
3. **Special cases override and cap the score.** Expressway (by name, or 45 mph or more): 1–2. Freeway ramp across the bike lane: at most 3. Bike lane squeezed between turn lanes: 3–7 depending on the layout. Bike lane that just ends: at most 4. Many driveways: −1. A quiet residential street with parked cars stays 8–9.
4. **Junctions:** score the hardest crossing a rider has to make. A signal gives 8 by default. Wide crossings, slip lanes, dual right turns and freeway ramp ends lower it. Green paint or a bike box raise it.
5. **Calibration line** at the end: "Most quiet residential streets in Cupertino score 8-9. Most arterials score 3-6. Expressways and freeway ramps score 1-3. Do not default to 6 or 7."

### 4.3 The answer is structured JSON, so it can't drift

Claude must fill a fixed JSON schema (structured output), in this order:

`photo_check` → `seen` (bike facility, parked cars, driveways, turn lane, edge space, pavement, sight lines, crossing markings) → `facts_conflict` → `hazards` → `lts` → `safety_score` → `confidence` → `note` (one sentence for riders, at most 20 words).

- The order makes Claude **look before it scores**. With that, we can switch extended thinking off and keep calls cheap.
- Scores are integer lists (1–10), so an answer of 11 or 7.5 is impossible.
- **17 fixed hazard IDs**, for example `door_zone`, `no_bike_lane`, `high_speed_traffic`, `freeway_ramp_crossing`, `frequent_driveways`, `dual_right_turn`. Each maps to a rider sentence such as "Parked cars: watch for opening doors". The reference project let hazards drift to 63 free-text types; ours can't.
- **Engineering details:** the system prompt is cached (4,287 tokens for safe-v2, 1,679 for green-v1), and one call warms the cache before 8 workers run in parallel. The run is resumable: a crash costs only the calls in flight. Every raw reply is saved, and a budget guard stops the run at a set dollar amount (default $3).

### 4.4 The 20-spot test, and the fix it forced (safe-v1 → safe-v2)

Before the city run, we scored 20 hand-picked spots (`py/data/bakeoff.json`). They covered the riskiest and calmest places we know: Lawrence Expressway, a freeway ramp, the De Anza × Stevens Creek junction, Mary Ave, 6-lane arterials and quiet residential streets.

**What went wrong in v1:** the Street View car often drives in an inner lane, so the curb-side bike lane is out of frame. Claude read De Anza Blvd's **mapped buffered bike lane as missing**, scored it 2, and tagged it "expressway".

**The safe-v2 fix (three rules):**
1. If the curb side isn't clearly visible, trust the mapped bike facility. Override the map only when a photo clearly shows the curb and it differs.
2. Use `expressway` only when the name says "Expressway" or the posted speed is 45 mph or more.
3. Use `sharrows_only` only when sharrows or signs are actually visible.

| Spot (from `bakeoff.json`) | safe-v1 | Now (safe-v2) |
|---|---|---|
| Lawrence Expressway (50 mph) | 1 | **1** |
| Freeway ramp (trunk_link) | 1 | **1** |
| N De Anza Blvd, 40 mph, mapped buffered lane | 2 | **4** (the fix) |
| N De Anza Blvd, 40 mph, OSM bike lane (a second spot) | 4 | 4 |
| Bubb Road, 30 mph, bike lane | 4 | 7 |
| Homestead × trunk link junction (signalised) | 6 | 4 |
| Stevens Creek Blvd, 35 mph, 6 lanes | 4 | 4 |
| De Anza × Stevens Creek junction (signalised) | 4 | 4 |
| E Homestead Rd, 6 lanes, bike lane | 5 | 4 |
| Homestead Road, 35 mph, 2 lanes, bike lane | 7 | 7 |
| Rainbow Dr × Weyburn Ln junction (no signal) | 8 | 6 |
| McClellan Road, 25 mph, bike route | 6 | 7 |
| Mary Avenue (bike boulevard / separated bikeway) | 8 / 7 | 8 / 7 |
| Rodrigues Avenue (bike boulevard) | 8 | 8 |
| Quiet residential streets (Cranberry, Candlewood, Walnut Circle S, Drake, Kimberly) | 8–9 | **8** |

- The table covers all 20 spots. The sentinel rules written before the run (`.plans/actualproject.md`) all pass now: the expressway scores ≤2, the freeway ramp ≤3, and quiet residential streets ≥8.
- **Be careful how we say this:** safe-v2 was written after looking at these same 20 spots, so passing them is a check that the fix worked, not an independent accuracy test.
- **[CHECK]** The spec planned more: two teammates labelling the 20 spots blind, 3 Haiku repeats, and a Sonnet 5.5 comparison. The repo holds only one Haiku safe-v1 run on the 20 spots, plus the safe-v2 scores. **Do not quote an accuracy (MAE) number, or a Haiku-vs-Sonnet result, unless the scoring owner (Model A) can show it.**

### 4.5 The green prompt (green-v1)

- **Greenery only.** The prompt tells Claude to ignore traffic and safety ("another rater handles safety").
- **Rubric 1–10:** 10 = inside a park or creek corridor with continuous canopy … 5 = suburban arterial with a planted median … 1 = industrial yard or under a freeway.
- `shade_sky_pct`: roughly what share of the sky in the forward photo is covered by tree crowns (0–100, in steps of 10).
- Claude knows the photo month and is warned that trees can look bare from December to February.

### 4.6 What came back

**Safety, 5,743 spots** (every reply was `ok`; 0 refusals):

| Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Spots | 82 | 92 | 35 | 441 | 291 | 742 | 571 | 2,702 | 786 | 1 |

- **Bands:** 7 or more (green) 4,060 (71%) · 4–6 (orange) 1,474 (26%) · 3 or less (red) 209 (4%).
- **LTS:** 1 = 3,494 · 2 = 1,321 · 3 = 749 · 4 = 179.
- **Median score by road type:** residential 8 · tertiary 7 · secondary 6 · primary 5 · junctions 5 · freeway ramps (trunk_link) 4 · expressways (trunk) 1.
- **Top hazards:** frequent driveways 1,674 · door zone 1,095 · no bike lane 962 · high-speed traffic 856 · poor pavement 672 · sharrows only 482 · wide crossing 315 · bike lane between turn lanes 202 · expressway 102.
- **What the photos added:** on 239 spots (4.2%), Claude said the photo clearly contradicts the mapped bike facility.
- **Confidence:** high 1,922 · medium 3,705 · low 116. Low-confidence streets say so when clicked.

**Green, 5,196 road spots:** median greenery 6 (most spots score 5–7). Median canopy cover is 20% of the sky.

**Cost and time:**

| | Calls | Cost |
|---|---|---|
| Safety (incl. the 20-spot safe-v1 test, $0.006) | 5,763 | $1.49 |
| Green | 5,196 | $0.90 |
| **Total** | **10,959** | **$2.38** |

- Tokens: 10.4 M uncached input, 33.4 M cached input (the reused prompt) and 2.0 M output.
- A typical safety call is about 1,060 fresh input tokens plus the cached prompt, and about 220 output tokens.
- Both city runs finished in under an hour **[CHECK: inferred from commit times]**.

**Say it like this:** *"We didn't ask Claude 'is this safe?'. We gave it the traffic engineers' stress scale, the facts we already knew, and a fixed list of 17 hazards, and it had to fill in a form. When our 20-spot test caught a mistake, we fixed the rule and re-ran the whole city."*

---

## 5. From photos to streets: the bake (`py/scripts/4_bake.py`)

### 5.1 What the bake does

1. **Group** each photo score by its physical street. Both directions of a two-way street share one key.
2. **Take the median** score. Store it as `safety_score = median / 10` (0..1) on **both** directed edges, with `safety_src = "photo"`.
3. **Explain it:** the rider note comes from the sample closest to the median, the hazards are the union of all samples' hazards, and the confidence is the lowest one.
4. **Green:** `vegetation_vlm = 1 + 4 × (greenery − 1) / 9`, which maps 1–10 onto the BikeButler paper's 1–5 scale. `shade_vlm = median canopy % / 100`, plus a `green_note`.
5. **No photo → rule score** by road type (`safety_src = "rule"`). The click text says "No street imagery — scored from map data".
6. **Junctions:** the photo score / 10, or the rule from the reference project: T-junction 7, four-way 5.5, +1.5 if signalised.
7. Only current prompt versions count (`safe-v2`, `green-v1`), so old and new scores never mix.

### 5.2 Rule scores (streets without a photo)

| Street | Rule (1–10) | Photo median for the same road type (for comparison) |
|---|---|---|
| City separated bikeway or bike path; OSM cycleway or path | 9 | n/a (no photos) |
| footway, pedestrian, living street | 8 | |
| residential | 7 | 8 |
| track | 7 | n/a |
| unclassified | 6 | 7 |
| service (parking aisle, driveway) | 5 | n/a |
| tertiary | 5 | 7 |
| secondary | 4 | 6 |
| primary | 3 | 5 |
| trunk_link / trunk | 2 / 1 | 4 / 1 |
| anything else | 5 | |

The rules sit 1–2 points below what Claude saw on the same road types (trunk is equal), so they are conservative. The map clean-up (§5.4) leaves this table alone, because the router reads it. On the map, an unphotographed road borrows the photo median of similar roads instead (5.4 km of sections); off-street paths, cycleways and tracks have no photos to borrow from, so they keep their rule score there too. Recalibrating the table itself has been handed to the routing work and is not shipped.

### 5.3 What came out

| | Photo-scored | Rule-scored |
|---|---|---|
| Physical street pieces | 4,686 | 6,092 |
| Directed edges | 8,523 | 11,294 |
| Length | 336.9 km (54% of all) | 292.1 km |
| Share of drivable streets (355 km) | **94.9%** | 5.1% |
| Share of arterial length (98.5 km) | **97.5%** | 2.5% |
| Junctions | 542 | 5,559 |

- The rule-scored length is mostly parking aisles and driveways (5,409 pieces, 231 km) and off-street paths, cycleways and tracks (about 42 km). Street View doesn't cover them.
- 5 scored junction samples landed on nodes with only 2 streets in the graph, so the bake doesn't use them (547 scored → 542 baked).
- Street pieces are short: the median is 33 m. 92.4% of photo-scored pieces rest on one scored sample.

### 5.4 The map clean-up: one colour per stretch of road (`py/app/bikemap/sections.py`)

**What we saw.** A teammate testing the Safe map said: *"the map is kinda chaotic, there's green and it immediately turns red."* We measured four causes:

1. **Driveways and parking aisles.** Half of all drawn lines (51%) were service roads with no photo. They all took the rule score 5, so they made up 82% of the orange length on the Safe map.
2. **One photo per piece.** 92% of photo-scored street pieces rest on a single photo, and the green cut (0.66) falls between 6 and 7, the two most common arterial scores. One point of noise flipped the colour every block.
3. **Rules vs. photos.** Rule scores sit 1–2 points below the photo medians (§5.2), so unphotographed stubs between photographed pieces of De Anza and Prospect drew red.
4. **Every street twice.** `network()` sent every directed edge: 19,817 lines for 10,778 streets.

**What we changed.** The change is display only: the router still reads the same per-edge scores, and route output is identical on 8 test routes (4 trips, Safe and Green).

- **Draw each street once.** Driveways, parking aisles and other service roads without a photo are dropped from the base layer.
- **Split a street only where the road changes:** its name, road class, bike facility (the City layer beats OSM) or speed limit. The Green layer splits on name and road class only. Sections under 60 m join their neighbour on the same street, and both carriageways of a divided road share one colour.
- **Colour each section by the median of its photos**, weighted by length. Low-confidence photos, and photos that scored a crossing rather than the street, are left out when others remain. A section is red when at least a third of its photo length is red.
- **No photo:** the section takes the city-wide photo median of streets with the same road class, facility and speed (falling back to road class and facility, then road class), instead of the rule table. Off-street paths, cycleways and tracks have no photos at all, so they keep their rule score.
- **Never hide danger:** a red photo inside a non-red section is drawn on top as a red **hazard spot**, with Claude's note.
- **Green map, keep the best bits:** a run of dark-green photos at least 80 m long inside a lighter section is drawn on top as a dark-green **green stretch** (34 of them), so the greenest parts of a long street are not averaged away.
- **The popup says how it was scored,** for example "Colour: median of N photographed pieces" and "k of n photo spots here scored lower (worst x/10)".
- **Frontend (`route-map.tsx`):** the canvas renderer is on. On the Safe map worse streets draw thicker (green 2.5, amber 3.5, red 5); on the Green map greener streets draw thicker (dark green 4.5, light green 3, grey 2.5). Opacity is 0.8, dimmed to 0.35 while a route is shown.
- `/network` is built once per layer and then cached.

**Before → after** (measured in the `fix/map-coherence` worktree):

| | Before | After |
|---|---|---|
| Safe lines drawn / payload | 19,817 / 4.77 MB | **1,592 / 0.64 MB** |
| Green lines drawn / payload | 19,817 / 4.44 MB | **1,552 / 0.59 MB** |
| Safe colour flips along the same street | 688 | **58** (32 real changes in the road, 26 ends of hazard spots) |
| Green colour flips | 737 | **72** (17 real changes in the road, 55 ends of green stretches) |
| Unphotographed driveways and parking aisles drawn | 5,480 | **0** |
| Red photo pieces still red | 65 of 65 | 65 of 65 |
| Green (good) photo pieces drawn red | – | 0 of 3,638 |
| Green map: good-photo length drawn dark green | 100% (each piece drawn alone) | 92% of 17.1 km |
| `/network` response | rebuilt on every call | 0.19 s (Safe) / 0.13 s (Green) the first time, then cached |
| Routes (`plan_route`, 4 trips × Safe and Green) | baseline | **identical** |

**The real boundaries are still there:** Lawrence Expressway is 100% red (4.4 km) and the 0.3 km of Foothill Expressway in the map area is 100% red. The 280/85 ramps have no green (50% red, 50% amber). Near Stevens Creek × De Anza there is no green (25 amber pieces, 1 red). 15 red hazard spots are drawn.

**Checks:** the acceptance check passes (25 of 25, re-run for this fact-check), pytest passes (6 tests, all for the starter app; none cover the bike map), and ruff finds no new warnings (6 old ones in `engine.py`). The frontend typecheck has not been run yet, because neither checkout has `node_modules`.

**Trade-offs to state ourselves:**
- About 11 km of amber photos now draw green, and about 11 km of green photos draw amber (and 0.3 km of amber photos draw red inside red stretches). Where a green stretch hides lower spots, the popup says so. On the Green map, 11.8 km of grey-scored photo pieces draw light green.
- Two small real changes are smoothed away: the Stevens Creek bus-stop gap and the Mary Ave parking pocket.
- Service roads, including campus roads, are gone from the base layer. Routes over them still draw.
- Route colours are still per-edge averages, so they can disagree with the base layer. That is why the base layer dims while a route is shown.

**Say it like this:** *"Each stretch of road gets one colour: the median of everything Claude saw along it, split only where the road itself changes. One odd photo can't flip a street, and a really dangerous spot is never hidden."*

---

## 6. Finding the route (`py/app/bikemap/engine.py`)

The engine's code comments are in Chinese. This section is the English walk-through.

### 6.1 Start-up and snapping

- **Load once:** the baked graph (`cupertino_bike.graphml`) loads at the first request and stays in memory (0.7 s). If the bake hasn't run, the engine falls back to `graph_raw.graphml`, where every street gets a neutral safety score of 0.5 (Green still works from the OSM proxies). `BIKE_GRAPH_PATH` can point it anywhere.
- **No expressways, ever:** `trunk`, `trunk_link` and `motorway` edges are hidden from both routes. In OSM, Lawrence and Foothill Expressways are `trunk`.
- **Nearest node:** start and end snap to the closest of the 8,514 nodes. This is a numpy search taking a few milliseconds.

### 6.2 Two routes per request

| Route | How |
|---|---|
| **Fastest** | Dijkstra on plain length (`_length_weight`) |
| **Recommended** (Safe or Green) | Dijkstra on the preference weight below (`_make_weight`) |

Duration assumes 15 km/h. Both routes come back in one response, with a comparison.

### 6.3 The weight, explained simply (BikeButler, CHI 2026)

The method comes from the BikeButler paper (CHI 2026, §4.3 and Appendix A.1, as cited in `engine.py`). **[CHECK]** The repo has no author list or link for the paper; get the full citation from Model C before it goes on a slide.

1. **Every street has a feature score** from 0 (worst) to 1 (best): safety, vegetation, quiet or shade (§7). The engine rescales each to −1 … +1, where −1 is best.
2. **The rider has a preference** for each feature from −5 (want it a lot) to +5 (avoid it), and a **detour tolerance d** from 0 (any detour is fine) to 1 (no detour at all).
3. **Bonus window:** each preference defines an ideal value and a window around it. The stronger the preference, the narrower the window: the more you care, the pickier you get. A street inside the window gets a bonus and feels shorter. A street outside gets a penalty and feels longer. The paper disqualifies streets outside the window outright. We use a softer penalty that grows with the distance from the window (`STRICT_DISQUALIFY = False`), so a route always exists.
4. **Final weight = (1 − d) × felt length + d × real length.** With d = 1, it is exactly the fastest route.

**Safe map:** safety preference −5 and d = 0.5. In practice, this is how much longer a street "feels" than its real length (current code, before routing fixes):

| Safety score | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|
| Feels like × its length | 0.85 | 1.08 | 1.18 | 1.28 | 1.38 | 1.49 | 1.59 | 1.69 | 1.79 | **10** |

- **Safety floor:** any street scored below 0.2 (a photo score of 1) costs 10× its length on the recommended route, on the Safe map and the Green map. It stays in the graph so a trip is never cut off. It just almost never gets used.

### 6.4 Detour cap

If the recommended route is more than **1.5×** the fastest route's length, the engine moves d 0.3 toward "no detour" and runs Dijkstra once more.

### 6.5 Segments and reasons

- The route is cut into **segments** wherever the street changes character. Two neighbouring edges stay in one segment when their feature vectors point the same way (cosine similarity > 0.5). Segments shorter than 20 m merge into their most similar neighbour. This is the paper's segmentation.
- Each segment gets a length-weighted average score, a level (good ≥ 0.66, ok ≥ 0.33, else bad) and **reasons**:
  - The reasons are those of the **first street piece** in the segment, not a summary of the whole segment.
  - **Safe:** Claude's note plus up to 3 hazard sentences, and a warning if confidence was low. For a rule-scored street: "No street imagery — scored from map data", the road type and the speed limit.
  - **Green:** Claude's green note, then "runs next to a park/green space", "N street trees within 25 m" and "about N m from water".

### 6.6 The comparison the UI shows

| Map | Fields |
|---|---|
| Safe | `extra_min`, `risky_segments_fastest`, `risky_segments_recommended` (number of red segments) |
| Green | `extra_min`, `greenery_pct_fastest`, `greenery_pct_recommended` (100 × the mean segment score), `noise_reduction_db` (always `null`: no noise data yet, and we say so) |

### 6.7 Measured on the preset trips (commit `161c005`, before routing fixes)

| Trip | Safe: fastest → recommended | Green (rural 0.5): extra time, greenery % |
|---|---|---|
| De Anza College → Main Street | 3.55 km → 3.55 km, +0 min | +3.4 min, 63.0% → 58.6% |
| Monta Vista HS → Apple Park | 6.22 km → 6.40 km, +0.7 min | +0.7 min, 56.8% → 62.8% |
| Library → Memorial Park | 2.12 km → 2.31 km, +0.7 min | +0.2 min, 57.0% → 62.8% |
| Rancho San Antonio → Library | 7.85 km → 7.87 km, +0.1 min | |
| De Anza College → Apple Park | 4.89 km → 4.89 km, +0 min | |

Risky segments were 0 → 0 on all five Safe trips. **Do not put these numbers in the pitch yet**; see §6.8.

### 6.8 Routing fixes: in progress, not shipped

> **Status:** these are being finalised on a separate branch. None of them is in `main` or in `fix/map-coherence`, and §6.3, §6.4 and §6.7 still describe `161c005`. Present them as next steps, not as results.

| Change | What it addresses (measured at `161c005`) |
|---|---|
| **Felt-distance Safe weight** | Today a street scored 9 feels 1.08× its length and one scored 2 only 1.79× (§6.3), so the Safe route rarely leaves the fastest one: 0 → 0 risky segments on all five preset trips |
| **Crossing penalty from `junction_safety`** | The bake scores 542 junctions from photos and the rest by rule, but the engine never reads them, so intersections don't affect routes yet |
| **Monotonic Green weight** | At rural 0.5 the bonus window makes a street with greenery 1.0 feel longer (×1.12) than one with 0.7 (×0.90). Greener should always feel shorter |
| **Terminating detour cap** | Today the cap relaxes d once and doesn't check again, so a route can still come out over 1.5× the fastest. The fix makes the cap finish within the limit every time |

Also open, and not covered by these four: expressways are hidden from **both** routes (so the fastest route never shows Lawrence); the Green "greenery %" mixes greenery with quiet and changes with the slider; `apply_vote` has no endpoint; README.md still describes the older "λ = 3" design.

**Say it like this:** *"Routing borrows the preference model from BikeButler, a CHI 2026 paper. The more stressful a street is, the longer it feels, and the router finds the ride that feels shortest while keeping the detour close to the fastest route."*

---

## 7. The Green map

### 7.1 Three features, three toggles

| Toggle | Feature score (0..1) | Where it comes from (`scoring.py`) |
|---|---|---|
| 🌳 Greenery | **vegetation** | With a photo: 75% Claude's greenery + 25% the OSM proxy. Without: the proxy only. The proxy = 0.5 × park nearness (fades over about 150 m) + 0.3 × trees within 25 m (full at 6) + 0.2 × water nearness (fades over about 200 m). The proxy stays in because a photo every 80 m can miss the creek or park beside the road |
| 🤫 Quiet | **quiet** | Road type: residential, service, paths and cycleways 1.0 · tertiary 0.7 · unclassified 0.6 · secondary 0.4 · primary 0.2 · other 0.5 |
| ☀️ Shade | **shade** | Claude's canopy % from the photo. Without a photo: OSM tree count / 10 |

### 7.2 The City ↔ Rural slider

- The slider value is `rural` (r), from 0 to 1. Each switched-on toggle gets the preference −5 × r, and the detour tolerance is d = 1 − r.
- **r = 0 gives the fastest route** (the only exception is the safety floor, which still avoids streets scored 1). Sliding toward Rural makes the rider pickier about greenery and more willing to detour.
- The defaults are Greenery and Quiet on, Shade off.
- The safety floor applies here too, so trees never pull a route onto an expressway.

### 7.3 What the data says

- 5,196 photographed road spots have a greenery score; the median is 6. 4,686 street pieces carry a photo vegetation value.
- The nature layer has 757 park or green polygons, 40 water polygons and 3,078 trees. It is served at `GET /bikemap/green-layers`. The React app doesn't call that endpoint yet (verified: no reference in `web/src`). The separate `map-recommendation/` prototype uses live Overpass instead.
- The Green page currently hides the city-wide colour layer (`showNetwork={false}`) and shows only the route.

**Say it like this:** *"Slide toward Rural and the route bends through tree-lined, quiet streets. Claude rated the greenery from the same photos, and we always show what it costs in minutes."*

---

## 8. The API (`py/app/bikemap/__init__.py`, `models.py`)

**Path:** browser → `/api/py/bikemap/*` on the TypeScript api, which is public with no sign-in for the bike map → the FastAPI side-car (`py/app/main.py` mounts the router). Nothing calls Google or Claude at request time; the demo runs offline.

| Endpoint | Request | Response | What the frontend does with it |
|---|---|---|---|
| `GET /bikemap/places` | none | `Place[]`: `id, name, lat, lng` (7 presets: De Anza College, Main Street, Apple Park Visitor Center, Library / Civic Center, Memorial Park, Monta Vista HS, Rancho San Antonio) | Fills the From / To pickers (`controls.tsx`) |
| `POST /bikemap/route` | `RouteRequest`: `start [lat,lng]`, `end [lat,lng]`, `mode "safe"\|"green"`, `rural 0..1` (default 0.5), `prefs {green, quiet, shade}` | `RouteResponse`: `mode`, `mock` (false), `fastest: Route`, `recommended: Route`, `compare: Comparison` | Draws the fastest route as a grey dashed line, the recommended route as a thick halo plus coloured segments with click-up reasons, and the stat cards (`map-page.tsx`, `route-map.tsx`, `safe-route.tsx`, `green-route.tsx`) |
| `GET /bikemap/network?layer=safe\|green` | `layer` | `NetworkResponse`: `layer`, `mock`, `segments: Segment[]`, one per continuous line of a road section, plus hazard spots or green stretches (1,592 Safe, 0.64 MB; 1,552 Green, 0.59 MB; §5.4). Built once, then cached on the server | Safe page: the "Show risk for every street" layer. Worse levels draw thicker (2.5 / 3.5 / 5) at opacity 0.8, dimmed to 0.35 while a route is shown; clickable. Cached for the session. The Green page doesn't draw this layer yet |
| `GET /bikemap/green-layers` | none | `{parks: [[lat,lng]…][], water: …, trees: [lat,lng][]}`, or empty lists if the file is missing | Not used by the React app yet |

**Shapes** (`models.py` is the contract; `web/src/bikemap/api.ts` mirrors it, so change both together):

- `Route`: `coords [lat,lng][]`, `distance_m`, `duration_min`, `segments`
- `Segment`: `coords`, `score` 0..1 (1 = best), `level` good / ok / bad, `reasons` string[]
- `Comparison`: `extra_min`, plus the Safe fields (`risky_segments_*`) or the Green fields (`greenery_pct_*`, `noise_reduction_db`). Unused fields are `null`.
- Colours: Safe good #16a34a, ok #f59e0b, bad #dc2626. Green good #15803d, ok #86c98f, bad #a8a29e.

**Known rough edges:**
- The Green stats card prints "−null dB" because `noise_reduction_db` is null.
- "No route" raises a plain error (HTTP 500, not a friendly 4xx).
- There are no bike-map tests in `py/tests` yet.

**Say it like this:** *"Four endpoints. The front end sends a start, an end and the slider, and gets back two routes, a comparison and a reason for every coloured stretch, in about a tenth of a second."*

---

## 9. Honesty slide material

### 9.1 Limits we should state ourselves

| Limit | What to say |
|---|---|
| **Street View licence** | Google's Maps Platform terms (§3.2.3) forbid bulk-downloading, caching and creating content from Street View, and that includes sending photos to an outside AI. Our use goes against the letter of those terms, and we don't claim compliance (research/imagery.md). What we did: we stayed inside the free tier ($0); **photos are never committed** (the `py/data/cache/` folder is gitignored); only panorama IDs and scores are stored; no Google call happens at demo time. The research also flags that the committed scores are "content based on Google Maps Content". The clean path for a real launch is Mapillary (CC BY-SA, AI use allowed), but its Cupertino coverage is unverified. **Action:** the 8,931 photos are still on a laptop (`~/Downloads/streetview`); delete them after judging, as the research recommends |
| **Imagery age** | The median photo is from 2024-09, but 16.5% are older than 2022. A bike lane painted since then won't show. The map facts (OSM and the city layer) partly cover this: the prompt treats them as true unless a photo clearly contradicts them, gets the photo date, and marks an old photo that contradicts the facts as low confidence |
| **LTS is stress, not crash risk** | LTS measures how comfortable a street feels to an ordinary rider. It is not a crash probability. Say "low-stress" or "comfortable" when we can; "safe" is the product name |
| **No traffic counts or real speeds** | We use posted speed limits from OSM (93% of arterials, 24% of residential streets) and road type. We have no traffic volumes and no measured speeds |
| **No night mode** | Only 2.1% of streets have lighting data |
| **Streets without photos** | Parking aisles, driveways and off-street paths (about 274 km) use road-type rules for routing, and the click text says so. On the map, unphotographed driveways and parking aisles are not drawn, unphotographed roads borrow the photo median of similar roads, and off-street paths keep their rule score |
| **The map is smoothed** | Each stretch of road shows its median. About 11 km of amber photos draw green and about 11 km of green photos draw amber; red spots are never hidden, and the popup says when a stretch has lower spots |
| **One look per spot** | Each spot was scored once. Repeat consistency wasn't measured on the city run, and most short street pieces rest on one photo spot. The map colours whole sections by their median, so one photo can't flip a street (§5.4) |
| **Not yet in routing** | Junction scores are computed but the router doesn't use them yet. A crossing penalty is in progress (§6.8) |
| **Noise** | No noise data yet. The field is `null`, not made up |

### 9.2 Validation status

| Check | Status |
|---|---|
| 20-spot test with the sentinel rules (expressway ≤2, ramp ≤3, residential ≥8) | ✅ Done. All pass with safe-v2 (§4.4). In-sample: safe-v2 was tuned on these spots |
| Human labels and MAE, Haiku vs Sonnet bake-off | ⚠️ Not in the repo. **[CHECK]** with Model A; don't quote it without proof |
| Crash data (CCRS on data.ca.gov: 295 bike-involved crashes in Cupertino, 2016 to 2026-10-08, 275 with coordinates; source `.plans/actualproject.md`) | ❌ **Not run.** There is no validation script in the repo. The plan's rule: crashes never touch scoring; quote "red streets are X% of length but Y% of crashes" only if Y is clearly above X; no cherry-picking |
| Map sanity check: expressways red, residential mostly green | ✅ Holds in the data: trunk median 1, residential median 8 |
| Map clean-up acceptance check (25 checks: expressways and ramps stay red, no red photo hidden, routes unchanged) | ✅ All pass on `fix/map-coherence` (§5.4) |

**Say it like this:** *"We're upfront about the limits: Street View's licence, photo age, and that stress isn't the same as crash risk. Crash data will be our test, never an input to the scores, and we haven't run that test yet."*

---

## 10. Function reference

Line numbers are for the `fix/map-coherence` worktree (`161c005` plus the map clean-up). Against `161c005` only two things differ: `engine.network()` moved from line 448 to 451, and `sections.py` is new (§10.8). The routing functions may change with the routing fixes (§6.8).

### 10.1 `py/scripts/1_build_graph.py`: build the graph

| Function (line) | What it does |
|---|---|
| `configure()` (86) | Adds the extra OSM tags (cycleway, lanes, maxspeed …) and sets the osmnx cache, user agent and timeout |
| `area_polygon()` (94) | Geocodes Cupertino's boundary and buffers it by 500 m (in UTM metres) |
| `overpass(fetch)` (99) | Runs an Overpass call with retries, cycling through 3 mirrors and doubling the wait each round |
| `first(v)` (115) | Returns the first value when osmnx merged ways into a list |
| `fetch_city_bikeways()` (120) | Downloads the City Bikeways GeoJSON once and caches it |
| `join_city(G, city)` (128) | Gives each non-service edge the best built city PathType it overlaps by ≥60% within a 10 m band |
| `mark_signals(G, poly)` (149) | Sets `signal=True` on junctions with an OSM traffic signal within 30 m |
| `add_green_features(G, poly)` (161) | Fetches parks, green land, water and trees, then writes `park_dist_m`, `water_dist_m` and `tree_count` on every edge |
| ↳ `geoms(gdf)` (172) | Helper: non-empty geometries in UTM |
| `write_green_layers(feats)` (191) | Writes simplified park and water polygons plus tree points to `green_layers.json` |
| ↳ `polygons(gdf)` (194) | Helper: polygons as `[lat, lng]` rings |
| `undirected_edges(G)` (217) | Yields each physical street once (a two-way road appears twice in the directed graph) |
| `nearest_node(G, lat, lng)` (227) | Slow nearest-node lookup, used only for the report's test trip |
| `report(...)` (231) | Builds the check report: sizes, tag coverage, city miles, spot checks, signals, green stats, connectivity, a test route |
| ↳ `name_has(s)` (247) | Helper: streets whose name contains a string |
| `plot(G)` (295) | Saves a PNG of the graph coloured by city bikeway type |
| `main()` (308) | Runs it all: area → graph (reuse or download) → city join and signals → green features → save → report |

### 10.2 `py/scripts/2_photos.py`: sample the streets, check imagery, fetch photos

| Function (line) | What it does |
|---|---|
| `env(name)` (75) | Reads one key (the Google Maps key) from the repo's `.env` |
| `first(v)` (83) | First value of an osmnx list |
| `bearing(dx, dy)` (87) | Compass heading of a direction, 0–359° |
| `latlng(x, y)` (91) | UTM metres → `(lat, lng)` |
| `dist_m(a, b)` (96) | Approximate distance in metres between two lat/lng points |
| `build_samples(G)` (105) | Makes road check points every 80 m on drivable streets (each two-way street once) and junction points where ≥3 photographed streets meet |
| `metadata(s, key)` (150) | Calls the free Street View Metadata API (outdoor, 15 m) for one point and caches OK and ZERO_RESULTS answers |
| `classify(s, m)` (169) | Labels a point ok / no_imagery / too_far / third_party / error and stores the pano ID and date |
| `photo_requests(s)` (191) | Lists the photos a point wants (forward + right, or N/E/S/W) with their priority tier, headings rounded to 10° for dedupe |
| `month()` (204) | The current month, as the free-tier ledger key |
| `load_usage()` (208) | Reads the photo ledger, including the 6 photos used before the script existed |
| `reserve_photo()` (215) | Counts one photo against the 9,000 cap *before* the request; refuses at the cap (thread-safe) |
| `fetch_photo(name, pano, heading, key)` (226) | Downloads one 640×640 photo with retries; stops on quota errors or the cap |
| `main()` (256) | Sample → metadata → plan photos by tier inside the budget → fetch (with `--fetch`) → write `samples.jsonl` → report |
| ↳ `get(n)` (300) | Helper: fetch one planned photo |
| `write_report(...)` (340) | Writes `photos.json`: status counts, coverage by road type, tiers, imagery years, free-tier proof, 5 spot-check links |

### 10.3 `py/scripts/3_score.py`: ask Claude

| Function (line) | What it does |
|---|---|
| `load_env()` (49) | Loads `.env` into the environment (Anthropic key) |
| `first(v)` (56) | First value of an osmnx list |
| `val(d, key)` (60) | A map fact as text, or "unknown" |
| `heading_of(photo)` (67) | Reads the heading from a photo file name (splits on the last `_`) |
| `labels(s)` (74) | The label line for each photo: FORWARD / RIGHT, or facing NORTH / EAST / SOUTH / WEST |
| `edge_line(d)` (90) | One approach road described for a junction's facts ("Stevens Creek Blvd (primary, 6 lanes, 40 mph, city: BIKE LANE)") |
| `facts(s, G, layer)` (97) | Builds the MAP FACTS block for a road point, a junction or the green layer |
| `content(s, G, layer)` (129) | Builds the user message: label + base64 photo for each photo, then the facts |
| `call(client, model, layer, msg, max_tokens)` (142) | One Claude request: cached system prompt, thinking off, effort medium, JSON-schema output |
| `score(client, model, layer, s, G)` (154) | Scores one sample: retries once with more tokens if cut off, saves the raw reply, dedupes hazards, returns a row with token usage |
| `eligible(s, layer)` (182) | Which samples are sent: anything with photos, except junctions with fewer than 2 photos (safety) or any junction (green) |
| `done_ids(layer, model)` (190) | Samples already scored with this prompt version and model (to resume) |
| `main()` (199) | CLI: choose the layer and samples, skip done ones, warm the cache with one call, run 8 workers, append rows, stop at the budget |
| ↳ `run(s)` (230) | Helper: score one sample; stop on a 400, record other API errors |
| ↳ `results()` (240) | Helper: first call alone (writes the cache), then the rest in parallel |

### 10.4 `py/scripts/score_prompts.py`: the prompts (no functions)

| Name | What it is |
|---|---|
| `SAFE_VERSION`, `GREEN_VERSION` | `"safe-v2"`, `"green-v1"`. Bump them when a prompt changes so old and new scores never mix |
| `SAFE_PROMPT` | The safety system prompt: inputs, the order of work, LTS table, score steps, special cases, intersections, hazard list, confidence, calibration |
| `GREEN_PROMPT` | The greenery system prompt: rubric 1–10, canopy %, confidence, the bare-tree warning |
| `SAFE_SCHEMA`, `GREEN_SCHEMA` | The JSON schemas Claude must fill (integer enums, fixed hazard IDs) |

### 10.5 `py/scripts/4_bake.py`: scores into the graph

| Function (line) | What it does |
|---|---|
| `first(v)` (48) | First value of an osmnx list |
| `street_key(u, v, d)` (52) | One key per physical street (both directions), the same key as `2_photos.py` |
| `load_scores(path, version)` (57) | Reads the ok results for the current prompt version |
| `summarise(results, score_key)` (66) | Median score, plus the sample closest to the median (its note explains the score) |
| `main()` (73) | Groups by street → median → writes safety, notes, hazards, confidence, vegetation and shade on every edge; rule fallback; junction scores; saves `cupertino_bike.graphml` and `bake.json` |

### 10.6 `py/scripts/merge_scores.py`: legacy merge tool

`4_bake.py` now writes the graph itself, so this file is not part of the pipeline. It was kept for manual merges. Comments are in Chinese.

| Function (line) | What it does |
|---|---|
| `_keymap(G)` (35) | Maps `"u_v_k"` strings to edge IDs |
| `apply_scores(G, score_map, attr, ...)` (40) | Writes `{u_v_k: value}` scores onto edges, clamped to 0..1 or 1–5; counts written, missing and bad |
| `main(argv)` (69) | CLI: `--feature safety\|vegetation\|shade --scores file.json`, plus the old `--safety` and `--green` flags |

### 10.7 `py/app/bikemap/engine.py`: routing and the colour layer

| Function (line) | What it does |
|---|---|
| `_graph_path()` (71) | Which graph to load: `BIKE_GRAPH_PATH`, else the baked graph, else the raw graph |
| `_load_graph()` (87) | Loads the graph once and keeps it in memory; clear error if the file is missing |
| `_nearest_node(G, lat, lng)` (98) | Fast numpy nearest node (caches the coordinate arrays) |
| `_num(d, key)` (109) | Reads a number attribute (GraphML stores them as text) |
| `build_preferences(req)` (119) | UI → paper: Safe = safety −5, d = 0.5. Green = −5 × rural for each toggled feature, d = 1 − rural |
| `edge_feature_vector(edge, mode)` (141) | A street's feature scores 0..1 (from `scoring.py`) and their −1..+1 form |
| `preference_weight(vec11, prefs, d_tol, length)` (155) | The BikeButler bonus-window / penalty weight: (1 − d) × α + d × length |
| `_make_weight(prefs, d_tol, mode)` (182) | Builds the Dijkstra cost function, including the safety floor (below 0.2 → 10× length) |
| ↳ `cost(e)` (190) | Helper: cost of one edge |
| ↳ `w(u, v, d)` (199) | Helper: handles parallel edges (takes the cheapest) |
| `_length_weight(u, v, d)` (207) | Plain length cost for the fastest route (parallel-edge safe) |
| `_safety_floor_view(G)` (214) | A view of the graph without motorway and trunk edges (expressways) |
| ↳ `ok(u, v, k)` (217) | Helper: edge filter |
| `_cosine(a, b)` (226) | Cosine similarity of two vectors |
| `_segment_by_similarity(...)` (234) | The paper's segmentation: split where neighbouring edges differ (cosine ≤ 0.5), merge pieces under 20 m |
| ↳ `seg_len(idxs)` (251), `seg_mean(idxs)` (254) | Helpers: segment length, mean vector |
| `apply_vote(prefs, seg_vec11, like)` (283) | The paper's like/dislike: nudges preferences toward or away from a segment (not wired to the API) |
| `_level(score)` (294) | 0..1 score → good (≥0.66) / ok (≥0.33) / bad |
| `_pick_key(Gv, u, v, w)` (298) | Picks the same parallel edge Dijkstra used, so the drawn shape matches |
| `_edge_coords(G, u, v, d)` (304) | An edge's real shape as `(lat, lng)`, flipped to run u → v |
| `_green_reasons(d)` (321) | Green click text: Claude's note, park, trees, water |
| `_path_length(Gv, path)` (337) | Length of a node path |
| `_no_path()` (341) | The "no route" error |
| `_build_route(Gv, path, w, prefs, mode, primary)` (345) | Node path → `Route`: segments, scores, levels, reasons, distance, minutes at 15 km/h |
| `plan_route(req)` (393) | The `/route` handler: snap, fastest, recommended, detour cap, comparison |
| ↳ `greenery_pct(r)` (433) | Helper: 100 × mean segment score |
| `network(layer)` (451) | The `/network` handler: builds the section layer once per layer with `sections.build` and caches it in `_NETWORK`. Display only; routing never reads it |

### 10.8 `py/app/bikemap/sections.py`: the map's base layer (new, display only)

It reads the baked edge attributes only and never writes to the graph. `engine.network()` calls `build()`.

| Function (line) | What it does |
|---|---|
| `build(G, layer, with_meta=False)` (509) | Entry point: display edges → sections → scores → one `Segment` per continuous line, plus hazard spots (Safe) or green stretches (Green). Safe draws good → ok → bad, then hazard spots, so danger paints last; Green draws bad → ok → good, then green stretches |
| `display_edges(G, layer)` (165) | One entry per physical street (the bake's street key); skips what `keep_for_display` rejects |
| `keep_for_display(d, layer)` (117) | Drops a service road (driveway, parking aisle, campus road) that has no photo |
| `edge_value(d, layer)` (124) | The edge's score 0..1 and whether it came from a photo, read through the same `scoring.py` functions the router uses |
| `label(d)` (86), `facility(d)` (91), `speed(d)` (108) | The facts a section must share: street name; bike facility none / shared / lane / separated (the City layer beats OSM); speed bucket 25 / 30 / 35 / 40 mph |
| `build_sections(G, edges, layer)` (196) | Groups touching edges with the same facts into sections (Green: name and road class only), filling a missing speed limit with the street's most common one |
| ↳ `_components(edges, at_node, keyfn)` (181) | Connected groups of edges that share a node and the same facts (union-find: class `UF` at 147, with `__init__` 148, `find` 151, `union` 158) |
| `_absorb_short(edges, at_node, street, sec_of)` (221) | Joins a section under 60 m to the longest neighbouring section of the same street |
| `_pool_twins(G, edges, sec_of, layer)` (263) | Gives both carriageways of a divided road one section; `_mid_and_bearing` (250) gives each one-way piece's midpoint and bearing to find the pairs |
| `calibration(edges)` (302) | City-wide photo medians by road class, facility and speed (then class and facility, then class), used only for sections with no photo |
| `trusted_photos(rows, layer)` (316) | Safe only: leaves out low-confidence and crossing-scored photos when others remain |
| `score_section(rows, layer, calib)` (327) | Section score: the length-weighted photo median (`wquantile`, 135), red when ≥ 1/3 of the photo length is red; else calibrated; else the rule |
| `section_reasons(rows, layer, med, src, used, support)` (391) | Popup text: the facts line (`_facts_line`, 352), how the section was scored, the note of the photo closest to the median (`_rep`, 378), and hazards seen on ≥ 40% of it (`_hazard_lines`, 362) |
| `spot_reasons(rows, sec_med, sec_name, spd)` (430) | Popup text for a red hazard spot: its own score, the rest of the street's score, Claude's note and up to 3 hazards |
| `green_spot_reasons(rows, sec_med, sec_name)` (446) | Popup text for a green stretch: its own score, the rest of the street's score, Claude's green note, park, trees, water |
| `chains(keys, edges)` (458) | Walks a section's edges into continuous lines; ↳ `walk(node, k)` (468) follows one line |
| `chain_coords(G, ch, edges)` (491) | A line's coordinates, simplified at 1.5 m and rounded to 5 decimals |
| `hazards(d)` (131), `first(v)` (78), `_vals(v)` (82), `_fmt_len(L)` (348) | Small helpers |
| Constants (47–74) | `MIN_SECTION_M` 60, `RED_SHARE` 1/3, `HAZARD_SHARE` 0.40, `CALIB_MIN_EDGES`/`CALIB_MIN_M` 5 / 300 m, `TWIN_M` 40, `TWIN_SHARE` 0.3, `SIMPLIFY_M` 1.5, `DECIMALS` 5, `DROP_SERVICE` True, `RED` 0.33 and `GOOD` 0.66 (the same cuts as `engine._level`), `GREEN_SPOT_M` 80, `CROSSING_HAZARDS`, `CITY_FACILITY`, `FACILITY_TEXT`, `HW_TEXT`, `CONF_RANK` |

### 10.9 `py/app/bikemap/scoring.py`: per-street feature scores

| Function (line) | What it does |
|---|---|
| `_num(edge, key)` (23) | Reads a number attribute safely |
| `_clamp(x)` (31) | Clamps to 0..1 |
| `safety_score(edge)` (35) | The baked safety score, or 0.5 if missing |
| `safety_reasons(edge)` (62) | Safe click text: Claude's note + up to 3 hazard sentences (+ low-confidence warning), or "No street imagery — scored from map data" + road type + speed limit |
| `vegetation_score(edge)` (101) | 0.75 × Claude's greenery (1–5 → 0..1) + 0.25 × the OSM proxy; the proxy alone without a photo |
| `vegetation_proxy(edge)` (111) | The OSM proxy: 0.5 park nearness + 0.3 trees + 0.2 water nearness |
| `quiet_score(edge)` (126) | Road type → quiet score |
| `shade_score(edge)` (146) | Claude's canopy share, else trees within 25 m / 10 |
| `HAZARD_TEXT` (constant) | Hazard ID → the sentence riders see |

### 10.10 `py/app/bikemap/__init__.py`: the endpoints

| Function (line) | What it does |
|---|---|
| `places()` (19) | `GET /bikemap/places`: the preset places |
| `route(req)` (24) | `POST /bikemap/route`: calls `engine.plan_route` |
| `network(layer)` (30) | `GET /bikemap/network`: calls `engine.network` |
| `_layers_path()` (35) | Where `green_layers.json` lives (`BIKE_LAYERS_PATH` overrides it) |
| `green_layers()` (44) | `GET /bikemap/green-layers`: the parks, water and trees file, or empty lists |

### 10.11 `py/app/bikemap/models.py`: the contract (no functions; do not change the shape)

| Name | Fields |
|---|---|
| `Mode`, `Level`, `LatLng` | `"safe"\|"green"`, `"good"\|"ok"\|"bad"`, `(lat, lng)` |
| `Place` | `id, name, lat, lng` |
| `GreenPrefs` | `green=True, quiet=True, shade=False` |
| `RouteRequest` | `start, end, mode, rural=0.5 (0..1), prefs` |
| `Segment` | `coords, score (0..1), level, reasons` |
| `Route` | `coords, distance_m, duration_min, segments` |
| `Comparison` | `extra_min`; Safe: `risky_segments_fastest/recommended`; Green: `greenery_pct_fastest/recommended`, `noise_reduction_db` |
| `RouteResponse` | `mode, mock, fastest, recommended, compare` |
| `NetworkResponse` | `layer, mock, segments` |

### 10.12 `py/app/bikemap/places.py` (no functions)

| Name | What it is |
|---|---|
| `PLACES` | 7 preset places with approximate coordinates (they snap to the nearest node) |
| `BBOX` | `(37.290, -122.090, 37.340, -121.995)`: a default map box from the mock days |

`py/app/main.py` (the starter app) mounts the bike-map router under `/api/py`. Its other routes (`/health`, `/whoami`, `/image/stats`, `/text/stats`) are starter examples, not part of the bike map.

---

## 11. Likely judge questions, with short answers

| Question | Answer |
|---|---|
| **Why not just use Google Maps' bike layer?** | It shows where bike lanes are, not how a street feels. A painted lane on a 6-lane, 40 mph road is still stressful. We rate every street, with or without a lane, and explain why |
| **Where does the data come from?** | OpenStreetMap for the streets, the City of Cupertino's GIS for built bikeways, Google Street View for 8,931 photos, and Claude Haiku 5.5 to read them |
| **How do you know Claude's scores are right?** | They are anchored to Level of Traffic Stress, a published engineering standard. Map facts go in as facts. The output is a fixed form with 17 fixed hazards. A 20-spot test caught one error, and we fixed the rule (§4.4); that test checks the fix, it is not an accuracy number. A crash-data check is planned but not built or run yet; we won't quote it until it is. [Add the MAE only if Model A has it] |
| **What if one photo is wrong?** | Each stretch of road takes the median of all its photos, split only where the road itself changes, so one odd photo can't flip a street. A red photo still shows as a red hazard spot. Click any street to see Claude's note and the confidence |
| **What about streets with no photos?** | 95% of drivable street length has a photo score. The rest is mostly parking aisles and off-street paths. The router gives them a cautious road-type score, and the click text says "scored from map data". On the map, unphotographed driveways and parking aisles aren't drawn |
| **Why does the map look so calm?** | Before the clean-up it drew 19,817 lines, including every driveway, and the colour flipped 688 times along the same streets. Now it draws 1,592 road sections with 58 flips, and the expressways and freeway ramps are still red |
| **How much did it cost?** | Street View $0 (free tier). Claude $2.38 for 10,959 calls. The server makes no paid calls at demo time |
| **Why Haiku and not a bigger model?** | Cheapest and fastest, and the structured form plus the LTS rubric do most of the work. The sentinel spots (expressway, ramp, quiet streets) come out right. [Only say "we compared with Sonnet" if Model A has the result] |
| **Isn't this against Google's terms?** | Honestly, the terms forbid bulk use of Street View images, and we don't claim compliance. We stayed in the free tier, never committed a photo, store only panorama IDs and scores, and make no Google calls at demo time. A production version would switch to Mapillary, an openly licensed imagery source |
| **How old are the photos?** | The median is September 2024. 16.5% are from before 2022. The photo date goes into the prompt, map facts count as true unless a photo clearly contradicts them, and an old photo that contradicts them is marked low confidence |
| **Is "safe" the same as "won't crash"?** | No. LTS measures stress and comfort. Crash data is our test, not our input, and that test is still to run |
| **How does the routing work?** | Dijkstra with a preference-based weight from the BikeButler paper (CHI 2026): stressful streets "feel longer", with a detour cap of 1.5× the fastest route. Stronger safety weighting and junction penalties are in progress (§6.8) |
| **How fast is it?** | The graph loads in under a second; a route takes about 0.1 s. Everything is precomputed |
| **How is this different from Aggie Street Smart (HackDavis)?** | Same pipeline shape, but: we score each two-way street once (they paid twice for 89% of edges); we use a 15 m panorama radius, not 100 m; we use a fixed hazard list; and 54% of our whole network length is scored from photos (95% of drivable street length), where they scored 16% of directed road length (research/reference.md) |
| **What does the Rural slider actually change?** | How picky the router is about greenery, quiet and shade, and how much detour it accepts. At the City end you get exactly the fastest route |
| **Can it work in another city?** | With small edits. The area is a constant in `1_build_graph.py` ("Cupertino, California, USA"), and the city bikeway layer and the prompt's calibration line are Cupertino-specific; the rest of the pipeline is generic. Cost scales with photos: about $0.0002 per Claude call |
| **Night riding, weather, traffic volume?** | Not covered: there is no lighting data (2% of streets) and no traffic counts. These are stated limits |

---

*Sources: repo at `161c005` plus the `fix/map-coherence` worktree (`py/app/bikemap/sections.py`, `engine.network()`, `web/src/bikemap/route-map.tsx`; measurements from the map clean-up's acceptance run) (`py/scripts/*`, `py/app/bikemap/*`, `py/data/*`, `.plans/actualproject.md`, `.plans/scoring-spec.md`), web/src/bikemap, and the research notes `research/criteria.md` (LTS), `research/imagery.md` (Street View pricing and terms), `research/reference.md` (Aggie Street Smart) and `design/backend-v2.md`.*
