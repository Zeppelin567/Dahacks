# Scoring spec: safe-v2 and green-v1

This is the input for `py/scripts/3_score.py --layer safe|green`, covering plan §3 step 3 and decision #12. It was written by the scoring owner on 2026-10-16 and amended the same day (see *Changes*).
If you change a prompt or a schema, bump its version (`safe-v2` …) so old and new scores never mix.

## Changes from the first draft (2026-10-16)

- **safe-v2** (after the 20-spot test):
  - When the curb side is out of view (the Street View car often drives in an inner lane), the mapped bike facility stands. In safe-v1, De Anza Blvd's buffered lane was read as missing and scored 2.
  - `expressway` is used only for a name containing "Expressway" or a posted speed of 45 mph or more.
  - `sharrows_only` is used only when sharrows or signs are visible.

- **Junctions with fewer than 2 photos aren't sent to Claude.** One photo can't show a whole intersection. Those 38 junctions get the rule fallback.
- **The Green layer feeds the existing engine:**
  - `greenery_score` becomes `vegetation_vlm`, the 1–5 scale from the BikeButler paper.
  - `shade_sky_pct` becomes `shade_vlm`.
  - The engine blends photo greenery with the OSM proxy (§11).
- **The engine's safety floor no longer deletes edges.** Edges with safety below 0.2 cost 10× their length (the paper's disqualify rule). They stay in the graph, so the fastest route can still use Lawrence and the comparison shows it.

## 1. What gets scored

| Layer | Samples | Photos per call | Calls |
|---|---|---|---|
| safe | Every sample in `py/data/samples.jsonl` with a non-empty `photos` list. Junctions need at least 2 photos. | Arterial road: 2. Residential road: 1 (a few have 2). Arterial junction: 4. Residential junction: 2–3. | 5,743 |
| green | Road samples with photos only. The Green route has no junction score. | 1–2 | 5,196 |

- **Photos** are in `py/data/cache/streetview/{file}`. That folder is gitignored; never commit the photos.
- **Samples without photos** (2,136) and the **38 one-photo junctions** get the rule fallback later in `4_bake.py`. Don't send them to Claude.
- **Photo order:**
  - Road photos are ordered [forward, right].
  - Junction photo headings come from the file name, `{pano_id}_{heading}.jpg`. A pano id can contain `_` and `-`, so split on the last `_`.

## 2. Request settings (both layers)

| Setting | Value | Why |
|---|---|---|
| Model | `claude-haiku-5-5` | Cheapest and fastest Claude model. Bake-off against `claude-sonnet-5-5` first (§8). |
| `thinking` | `{"type": "disabled"}` | Allowed on Haiku 5.5 at effort high or below. The schema's field order already makes it look before it scores. **Unverified: smoke-test it.** |
| `output_config` | `{"effort": "medium", "format": {"type": "json_schema", "schema": …}}` | Structured output enforces the hazard enum. In the key test, plain-text prompts got free-form hazards back. **Unverified: smoke-test it.** A fallback is known to work: tool use with `tool_choice` forced and the schema as `input_schema`. |
| `max_tokens` | 2000 | A reply is about 300–400 tokens. This leaves room if thinking is switched on later. |
| `temperature` / `top_p` / `top_k` | Do not send | Any value other than the default returns 400 on Haiku 5.5 and Sonnet 5.5 (seen in the key test). |
| `system` | The layer's prompt as one text block with `"cache_control": {"type": "ephemeral"}` | Cached after the first call. The cache minimum is 512 tokens. |
| Images | Base64 JPEG, the file bytes unchanged | Don't resize or re-encode; it can shift scores. |
| Message | One user turn: a label line before each photo, then the facts block and the instruction (§4) | No assistant prefill: Haiku 5.5 rejects it. |
| Concurrency | 8 worker threads; `anthropic.Anthropic(max_retries=6)` | The SDK retries 429 and 5xx with backoff. A new account's rate limit may not take 16. |

**Stop reasons**

| `stop_reason` | What to do |
|---|---|
| `end_turn` | Parse the first text block. Pick blocks by type, never by position. |
| `refusal` | Write `status: "refused"` with no result. The bake step uses the rule fallback. |
| `max_tokens` | Retry once with `max_tokens=4000`, then write `status: "error"`. |

Before saving, dedupe `hazards` in code, because the schema can't stop repeats.

## 3. Output

One JSON line per sample, in `py/data/safety_scores.jsonl` or `py/data/green_scores.jsonl`. Both files are committed.

```json
{"sample_id": "r26149271_247385813_0_0", "layer": "safe", "prompt_version": "safe-v1", "model": "claude-haiku-5-5",
 "status": "ok", "pano_date": "2024-09", "result": { "...the schema object..." },
 "usage": {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}}
```

- **Raw reply:** save it to `py/data/cache/llm/{layer}/{sample_id}.json`, which is gitignored.
- **Resumable:** skip a sample whose line already has `status: "ok"` with the same `prompt_version` and `model`. A crash then loses only the calls in flight.
- **Score scale:** 1–10, where 10 is best. The web contract uses `score / 10`.
- **Colours:** ≥7 green, 4–6 orange, ≤3 red.

## 4. The user message

Build the content list in this order: a label text block before each image, then one text block with the facts and the instruction.

**Photo labels**

| Sample | Labels |
|---|---|
| Road, 2 photos | `Photo 1 of 2: FORWARD (direction of travel, heading {heading}°)` and `Photo 2 of 2: RIGHT (curb side, heading {heading+90 mod 360}°)` |
| Road, 1 photo | `Photo 1 of 1: FORWARD (direction of travel, heading {heading}°). There is no curb-side photo.` |
| Junction | `Photo {i} of {n}: facing NORTH / EAST / SOUTH / WEST (file heading 0 / 90 / 180 / 270)` |

**Facts block, safe layer**

Use a fixed key order. A missing value is `unknown`. Edge values come from `py/data/graph_raw.graphml`: road samples use edge `[u, v, key]`, and junctions use the node plus its edges.

```
MAP FACTS (true unless a photo clearly contradicts them; "unknown" = not mapped)
- spot: road point on {name} ({highway})
- speed_limit: {maxspeed}
- lanes_total: {lanes} · oneway: {oneway}
- osm_bike_tags: {every cycleway* tag as key=value, or none}
- city_bikeway: {city_pathtype, or none}
- turn_lanes: {turn:lanes}
- photos_taken: {pano_date}

Rate this spot. Fill every field in order.
```

For junctions, replace the road lines with these:

```
- spot: intersection, {street_count} legs
- signalised: {yes|no}
- approaches: {one per street name: "Stevens Creek Boulevard (primary, 6 lanes, 40 mph, city: BIKE LANE)"}
```

**Facts block, green layer**

```
MAP FACTS
- spot: road point on {name} ({highway})
- photos_taken: {pano_date}

Rate this spot. Fill every field in order.
```

## 5. Safety prompt (`safe-v2`, system)

```
You rate one spot on a street in Cupertino, California, for an adult on an ordinary bike: the careful
"interested but concerned" rider, not a fearless commuter. Your rating colours a public bike map and
steers bike routes, so be consistent and use the whole 1-10 scale.

INPUTS
- Photos: Google Street View, daytime, possibly several years old.
  Road point: FORWARD (direction of travel) and, when available, RIGHT (curb side).
  Intersection: up to four photos facing NORTH, EAST, SOUTH and WEST.
- MAP FACTS from OpenStreetMap and the City of Cupertino. Speed limit, lane count, road class and signal
  status are facts: use them, and do not re-estimate them from the photos. "unknown" means not mapped.
- The Street View car often drives in an inner lane, so the curb side may be out of view. If the photos
  don't show the curb side clearly, keep the bike facility from MAP FACTS: answer cannot_tell in seen, keep
  facts_conflict none and score with the mapped facility. Override MAP FACTS only when a photo clearly shows
  the curb side and it differs.

HOW TO WORK: fill the JSON fields in order
1. photo_check: can the photos be used? Note blocked views, glare or a wrong place.
2. seen: what the PHOTOS show, even where it disagrees with MAP FACTS. If you can't see it, answer cannot_tell.
3. facts_conflict: does a photo clearly contradict a map fact about bike facilities or road layout?
4. hazards: only ids from the list below, and only if visible in the photos or implied by MAP FACTS.
5. lts: Level of Traffic Stress, 1-4, from STEP A.
6. safety_score: 1-10, from STEP B and the special cases.
7. confidence: high, medium or low.
8. note: one plain-English sentence for riders, at most 20 words, giving the main reason for the score.

STEP A: LEVEL OF TRAFFIC STRESS (LTS)
Use the posted speed and the number of through lanes in ONE direction.
Facility                                          <=25 mph  30  35  40  45+
Separated path or physically protected bike lane      1      1   1   1   1
Bike lane, 1 through lane                             1      1   2   3   3
Bike lane, 2 through lanes                            2      2   2   3   3 (4 if the lane is narrow)
Bike lane, 3 or more through lanes                    3      3   3   4   4
Bike lane beside parked cars, 1 through lane          2      2   3   3   3
Bike lane beside parked cars, 2+ through lanes        3      3   3   3   3
No bike lane, quiet street with no centre line        1      2   2   3   3
No bike lane, 1 lane each way with a centre line      2      2   3   3   4
No bike lane, 2 or more lanes each way                3      4   4   4   4
A painted bike lane narrower than about 4 ft, or one that is often blocked, counts as no bike lane.
Sharrows or "Bike Route" signs alone count as no bike lane.

STEP B: SCORE
Start from the LTS default, then move up to 1 point for what the photos show (pavement, buffer width,
sight lines, driveways, how busy the street looks):
LTS 1 -> 9   (10 only for a separated path or protected lane with no conflicts in view)
LTS 2 -> 7
LTS 3 -> 5
LTS 4 -> 2   (1 = no reasonable person would ride it)

SPECIAL CASES (these override STEP B; never score above a cap)
- Expressway (the name contains "Expressway", or the posted speed is 45 mph or more): 1-2.
- Freeway on-ramp or off-ramp where cars cross the bike lane: cap 3 (cap 2 if the ramp is two lanes or free-flowing).
- Bike lane squeezed between the through lane and a right-turn lane: cap 7 if the turn lane is short and cars
  turn slowly; cap 5 if the bike lane shifts left across a long turn lane; cap 3 with two right-turn lanes.
- No bike lane and a right-turn lane on the approach: cap 3.
- Bike lane ends abruptly: score the road as if it had no bike lane, cap 4.
- Many driveways or curb cuts, such as a strip mall frontage: 1 point lower.
- A quiet residential street (25 mph or less, no centre line) with parked cars is still LTS 1: score 8-9.
  Do not mark it down for the parked cars alone.

INTERSECTIONS
Score the hardest crossing a rider has to make. MAP FACTS give the legs, the signal and each approach.
Set lts to the LTS of that crossing (score 9-10 = 1, 7-8 = 2, 4-6 = 3, 1-3 = 4).
- All legs quiet local streets (30 mph or less, 3 lanes or fewer), no signal: 9 (8 if a corner is blind).
- All-way stop where every street has two lanes: 8.
- Signalised: 8. Minus 1 when crossing 6 or more through lanes. Minus 2 when a right-turn slip lane crosses
  the bike path. Plus 1 for green bike-lane paint, a bike box or a bike signal (maximum 10).
- Unsignalised, crossing 4-5 lanes at 30 mph or less: 7. At 35 mph, or 3 lanes or fewer at 40 mph or more: 5.
- Unsignalised, crossing 6 or more lanes at any speed, or 4-5 lanes at 40 mph or more: 2. With a median
  island at least 6 ft wide, score it as crossing only the wider half.
- Caps: the bike lane drops or merges on the approach: 4. Two right-turn lanes, or a freeway ramp end: 3.

HAZARDS (use these exact ids)
door_zone                     riding line within reach of opening doors of parked cars
no_bike_lane                  no bike facility where bikes share fast or busy traffic
poor_pavement                 cracks, potholes, debris or failing patches in the riding line
blind_corner                  sight line to cross traffic is blocked
right_turn_slip_lane          free-flowing right turn that crosses the bike path
construction                  work zone, steel plates or cones narrowing the road
high_speed_traffic            traffic at 40 mph or more next to the riding line
wide_crossing                 crossing 4 or more traffic lanes
bike_lane_between_turn_lanes  bike lane sandwiched between a through lane and a right-turn lane
bike_lane_drops               bike lane ends with no transition
freeway_ramp_crossing         cars enter or leave a freeway across the bike path
expressway                    only if the name contains "Expressway" or the posted speed is 45 mph or more
bike_lane_blocked             bike lane blocked by parked cars, bins or deliveries
sharrows_only                 shared-lane symbols or "Bike Route" signs are visible, and there is no bike lane
frequent_driveways            many driveways or curb cuts where cars turn across the riding line
dual_right_turn               two right-turn lanes cross the bike path
no_median_refuge              long crossing with no island to wait on halfway

CONFIDENCE
high: clear photos, and photos and facts agree.
medium: view partly blocked, one conflict with the facts, or only a FORWARD photo when the curb side matters.
low: view mostly blocked, a wrong place, or a photo that is likely older than the facts it contradicts.

CALIBRATION
Most quiet residential streets in Cupertino score 8-9. Most arterials score 3-6. Expressways and freeway
ramps score 1-3. Do not default to 6 or 7.
```

## 6. Safety schema (`safe-v1`)

Every property is required, so the model fills the fields in this order. Scores are integer enums, because structured outputs don't support `minimum` / `maximum`.

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["photo_check", "seen", "facts_conflict", "hazards", "lts", "safety_score", "confidence", "note"],
  "properties": {
    "photo_check": {"type": "object", "additionalProperties": false, "required": ["usable", "issues"],
      "properties": {
        "usable": {"type": "string", "enum": ["yes", "partly", "no"]},
        "issues": {"type": "array", "items": {"type": "string", "enum":
          ["vehicle_blocks_view", "construction_blocks_view", "glare_or_dark", "blurry", "off_road_or_wrong_place"]}}}},
    "seen": {"type": "object", "additionalProperties": false,
      "required": ["bike_facility", "facility_condition", "curb_parking", "driveways", "turn_lane_or_slip",
                   "edge_space", "pavement", "sight_lines", "crossing_markings"],
      "properties": {
        "bike_facility":      {"type": "string", "enum": ["none", "sharrows_only", "painted_lane", "buffered_lane", "protected_lane", "separate_path", "cannot_tell"]},
        "facility_condition": {"type": "string", "enum": ["good", "faded_or_debris", "blocked", "not_applicable", "cannot_tell"]},
        "curb_parking":       {"type": "string", "enum": ["none", "some", "continuous", "cannot_tell"]},
        "driveways":          {"type": "string", "enum": ["few", "many", "cannot_tell"]},
        "turn_lane_or_slip":  {"type": "string", "enum": ["no", "right_turn_lane", "slip_lane", "cannot_tell"]},
        "edge_space":         {"type": "string", "enum": ["none", "narrow", "wide", "cannot_tell"]},
        "pavement":           {"type": "string", "enum": ["good", "cracked", "potholed", "cannot_tell"]},
        "sight_lines":        {"type": "string", "enum": ["clear", "partly_blocked", "blocked", "cannot_tell"]},
        "crossing_markings":  {"type": "string", "enum": ["not_intersection", "none", "crosswalk_only", "bike_crossing_or_box"]}}},
    "facts_conflict": {"type": "string", "enum": ["none", "bike_facility", "road_layout", "other"]},
    "hazards": {"type": "array", "items": {"type": "string", "enum": [
      "door_zone", "no_bike_lane", "poor_pavement", "blind_corner", "right_turn_slip_lane", "construction",
      "high_speed_traffic", "wide_crossing", "bike_lane_between_turn_lanes", "bike_lane_drops",
      "freeway_ramp_crossing", "expressway", "bike_lane_blocked", "sharrows_only", "frequent_driveways",
      "dual_right_turn", "no_median_refuge"]}},
    "lts": {"type": "integer", "enum": [1, 2, 3, 4]},
    "safety_score": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]},
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    "note": {"type": "string"}
  }
}
```

**Hazard ids and their rider text** (for the frontend)

| id | Rider text |
|---|---|
| `door_zone` | Parked cars: watch for opening doors |
| `no_bike_lane` | No bike lane: you share the lane with cars |
| `poor_pavement` | Rough pavement in the riding line |
| `blind_corner` | Blind corner: cross traffic is hard to see |
| `right_turn_slip_lane` | Fast right-turn lane crosses your path |
| `construction` | Construction narrows the road |
| `high_speed_traffic` | Cars pass at 40 mph or more |
| `wide_crossing` | Long crossing: 4 or more lanes |
| `bike_lane_between_turn_lanes` | Bike lane squeezed between turning cars |
| `bike_lane_drops` | Bike lane ends suddenly |
| `freeway_ramp_crossing` | Cars enter or leave the freeway across your path |
| `expressway` | Expressway: very fast, heavy traffic |
| `bike_lane_blocked` | Bike lane often blocked by cars or bins |
| `sharrows_only` | Only bike symbols painted, no real bike lane |
| `frequent_driveways` | Many driveways: watch for turning cars |
| `dual_right_turn` | Two right-turn lanes cross your path |
| `no_median_refuge` | No island to wait on mid-crossing |

## 7. Green prompt (`green-v1`, system) and schema

```
You rate how green and natural one spot on a street in Cupertino, California, looks to someone riding a bike.
Your rating feeds the Green route map, which bends routes toward leafy, natural streets. Rate only nature and
greenery. Ignore traffic and safety completely; another rater handles safety.

INPUTS
- Photos: Google Street View, daytime, possibly several years old. FORWARD (direction of travel) and, when
  available, RIGHT (curb side).
- MAP FACTS: the street name, the road class and the month the photos were taken. Deciduous trees can look bare
  from December to February.

HOW TO WORK: fill the JSON fields in order
1. photo_check: can the photos be used?
2. seen: street trees, canopy over the road, roadside planting, nature nearby.
3. shade_sky_pct: in the FORWARD photo, roughly what share of the sky is covered by tree crowns (0-100, steps of 10).
4. greenery_score: 1-10 from the rubric.
5. confidence: high, medium or low.
6. note: one plain-English sentence, at most 20 words, saying what makes this spot green or not.

GREENERY RUBRIC
10  inside a park or creek corridor; continuous canopy; no traffic or buildings in view
9   along a park or creek edge, or tree crowns close over most of the sky
8   residential street with mature trees on both sides; canopy mostly closed
7   tree-lined residential street with gaps in the canopy; greenery fills about a third of the view
6   some street trees, on one side only or young; or a landscaped median
5   suburban arterial with a planted median or planting strips; little canopy over the road
4   wide arterial with a few young trees; mostly pavement and buildings
3   commercial strip; parking lots in view
2   large parking lots or a freeway interchange
1   industrial yard, under a freeway, or a construction site; no vegetation

CONFIDENCE
high: clear photos with leaves on the trees.
medium: view partly blocked, or only a FORWARD photo.
low: view mostly blocked, or bare trees (photos from December to February) make greenery hard to judge.
```

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["photo_check", "seen", "shade_sky_pct", "greenery_score", "confidence", "note"],
  "properties": {
    "photo_check": {"type": "object", "additionalProperties": false, "required": ["usable", "issues"],
      "properties": {
        "usable": {"type": "string", "enum": ["yes", "partly", "no"]},
        "issues": {"type": "array", "items": {"type": "string", "enum":
          ["vehicle_blocks_view", "construction_blocks_view", "glare_or_dark", "blurry", "off_road_or_wrong_place"]}}}},
    "seen": {"type": "object", "additionalProperties": false,
      "required": ["street_trees", "canopy_over_road", "roadside_planting", "nature_nearby"],
      "properties": {
        "street_trees":      {"type": "string", "enum": ["none", "sparse_or_young", "regular_rows"]},
        "canopy_over_road":  {"type": "string", "enum": ["none", "partial", "full"]},
        "roadside_planting": {"type": "string", "enum": ["hardscape", "some", "lush"]},
        "nature_nearby":     {"type": "string", "enum": ["none", "park_or_open_space", "creek_or_riparian", "orchard_or_hills"]}}},
    "shade_sky_pct": {"type": "integer", "enum": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]},
    "greenery_score": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]},
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    "note": {"type": "string"}
  }
}
```

The green system prompt is about 630 tokens, just above the 512-token cache minimum. If `cache_read_input_tokens` stays at 0, the prompt isn't being cached, but that only costs a few cents.

## 8. Order of work: bake-off first, then the city

**1. Pick 20 samples that have photos.** Include:

- the Stevens Creek × De Anza junction
- a sample on a 280 ramp
- Lawrence Expressway
- Mary Ave near the bike bridge (the bridge itself is a path, so it has no photo)
- 4–5 quiet residential streets
- a 6-lane 35 mph arterial with a bike lane
- a residential street with parked cars

Write the sample_ids in `py/data/bakeoff.json`.

**2. Label them.** Two teammates score each spot 1–10 on their own, before anyone sees model output. The mean of their scores is the label.

**3. Run both models:**

- Haiku 5.5: 3 times per spot, with the settings in §2.
- Sonnet 5.5: once per spot, with `thinking={"type": "between_tools"}` (Sonnet 5.5 rejects `disabled`), effort medium, the same prompt and schema, and no temperature.

**4. Apply the decision rule**, fixed now, before the run:

- **Sentinels:** Lawrence Expressway must score ≤2, quiet residential streets ≥8, and the 280 ramp ≤3.
- **Model:** use Haiku 5.5 unless Sonnet's mean absolute error against the labels is at least 1.0 lower, or Haiku fails a sentinel that Sonnet passes.
- **Repeats:** if Haiku's 3 runs differ by more than 1 point on more than 3 of the 20 spots, score every city sample 3 times and keep the median.
- **Prompt fix:** if Haiku scores more than 1 point high on average, tighten the prompt, bump it to `safe-v2` and rerun the 20.

**5. City run:** the safe layer, then the green layer. Green needs no bake-off; check 10 spots by eye.

## 9. Cost and time

- **Smoke-test first.** Before the bake-off, run one Haiku call and one Sonnet call to confirm:
  - the request settings (`thinking`, `output_config`) don't return 400;
  - the real input tokens per photo (the key test measured about 1,000 tokens per 640×640 photo, not 529);
  - the price on the official pricing page.

  Recompute the totals below from those numbers.
- **Draft estimate**, using the draft's assumed $0.10 / $0.50 per MTok, which is still to be confirmed:
  - safe: about $1.8
  - green: about $1.0
  - bake-off: under $1

  Set a spend limit in the Claude Console anyway.
- **Time:** with 8 workers at 3–5 s per call, a layer takes about 40–60 minutes.
- **Run synchronously.** The Batch API would halve the cost, but results can take up to 24 h.

## 10. Request code (Python SDK)

```python
import base64, json, pathlib
import anthropic

client = anthropic.Anthropic(max_retries=6)          # reads ANTHROPIC_API_KEY from the environment

def image_block(path: pathlib.Path) -> dict:
    data = base64.b64encode(path.read_bytes()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}}

def call(system_prompt: str, schema: dict, labels_and_photos: list[tuple[str, pathlib.Path]], facts: str):
    content = []
    for label, path in labels_and_photos:
        content += [{"type": "text", "text": label}, image_block(path)]
    content.append({"type": "text", "text": facts})
    resp = client.messages.create(
        model="claude-haiku-5-5",
        max_tokens=2000,
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": content}],
        thinking={"type": "disabled"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
    )
    if resp.stop_reason != "end_turn":                 # "refusal" or "max_tokens": see §2
        return resp.stop_reason, None, resp
    text = next(b.text for b in resp.content if b.type == "text")
    return "ok", json.loads(text), resp
```

Install the SDK with `cd py && uv add anthropic`. It needs a recent release, because `output_config` and Haiku 5.5 are new.

## 11. From scores to the routing engine

`4_bake.py` turns per-sample scores into per-edge values. `py/scripts/merge_scores.py` then writes them into the engine's graph.

**1. Group by edge.** Group a layer's `status: "ok"` lines by the sample's `edge` `[u, v, key]` and take the **median**. The same value goes to both directions of a two-way street.

**2. Write the values per layer** as `{"u_v_k": value}`:

| Layer field | Engine attribute | Conversion | `merge_scores.py --feature` |
|---|---|---|---|
| `safety_score` (1–10) | `safety_score` (0..1) | `score / 10` | `safety` |
| `greenery_score` (1–10) | `vegetation_vlm` (1–5, paper scale) | `1 + 4 × (g − 1) / 9` | `vegetation` |
| `shade_sky_pct` (0–100) | `shade_vlm` (0..1) | `pct / 100` | `shade` |
| junction `safety_score` | node attribute (intersection penalty) | `score / 10` | — (bake writes it) |

**3. How the engine uses them** (`py/app/bikemap/scoring.py`):

- **vegetation** = `0.75 × photo + 0.25 × OSM proxy`. The OSM proxy is distance to parks and water plus street trees. It stays in because a photo every 80 m often misses the creek or the park beside the road.
- **Edges with no photo** use the OSM proxy only.
- **shade** = `shade_vlm` from the photo when it exists, otherwise OSM tree density. OSM has very few tree points in Cupertino.
- **quiet** = road class. No photo needed.
- **Safety floor:** an edge with `safety_score < 0.2` (an expressway) costs 10× its length on both the Safe and the Green route. It isn't deleted, so the fastest route can still use it.
