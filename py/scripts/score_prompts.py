# ruff: noqa: E501
"""Prompts and schemas for 3_score.py, copied verbatim from .plans/scoring-spec.md (safe-v1, green-v1).

Change a prompt or schema here AND in the spec, and bump its version so old and new scores never mix.
"""

SAFE_VERSION = "safe-v2"
GREEN_VERSION = "green-v1"

SAFE_PROMPT = """\nYou rate one spot on a street in Cupertino, California, for an adult on an ordinary bike: the careful
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
ramps score 1-3. Do not default to 6 or 7."""

GREEN_PROMPT = """\nYou rate how green and natural one spot on a street in Cupertino, California, looks to someone riding a bike.
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
low: view mostly blocked, or bare trees (photos from December to February) make greenery hard to judge."""

SAFE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "photo_check",
        "seen",
        "facts_conflict",
        "hazards",
        "lts",
        "safety_score",
        "confidence",
        "note",
    ],
    "properties": {
        "photo_check": {
            "type": "object",
            "additionalProperties": False,
            "required": ["usable", "issues"],
            "properties": {
                "usable": {"type": "string", "enum": ["yes", "partly", "no"]},
                "issues": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "vehicle_blocks_view",
                            "construction_blocks_view",
                            "glare_or_dark",
                            "blurry",
                            "off_road_or_wrong_place",
                        ],
                    },
                },
            },
        },
        "seen": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "bike_facility",
                "facility_condition",
                "curb_parking",
                "driveways",
                "turn_lane_or_slip",
                "edge_space",
                "pavement",
                "sight_lines",
                "crossing_markings",
            ],
            "properties": {
                "bike_facility": {
                    "type": "string",
                    "enum": [
                        "none",
                        "sharrows_only",
                        "painted_lane",
                        "buffered_lane",
                        "protected_lane",
                        "separate_path",
                        "cannot_tell",
                    ],
                },
                "facility_condition": {
                    "type": "string",
                    "enum": ["good", "faded_or_debris", "blocked", "not_applicable", "cannot_tell"],
                },
                "curb_parking": {"type": "string", "enum": ["none", "some", "continuous", "cannot_tell"]},
                "driveways": {"type": "string", "enum": ["few", "many", "cannot_tell"]},
                "turn_lane_or_slip": {
                    "type": "string",
                    "enum": ["no", "right_turn_lane", "slip_lane", "cannot_tell"],
                },
                "edge_space": {"type": "string", "enum": ["none", "narrow", "wide", "cannot_tell"]},
                "pavement": {"type": "string", "enum": ["good", "cracked", "potholed", "cannot_tell"]},
                "sight_lines": {
                    "type": "string",
                    "enum": ["clear", "partly_blocked", "blocked", "cannot_tell"],
                },
                "crossing_markings": {
                    "type": "string",
                    "enum": ["not_intersection", "none", "crosswalk_only", "bike_crossing_or_box"],
                },
            },
        },
        "facts_conflict": {"type": "string", "enum": ["none", "bike_facility", "road_layout", "other"]},
        "hazards": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "door_zone",
                    "no_bike_lane",
                    "poor_pavement",
                    "blind_corner",
                    "right_turn_slip_lane",
                    "construction",
                    "high_speed_traffic",
                    "wide_crossing",
                    "bike_lane_between_turn_lanes",
                    "bike_lane_drops",
                    "freeway_ramp_crossing",
                    "expressway",
                    "bike_lane_blocked",
                    "sharrows_only",
                    "frequent_driveways",
                    "dual_right_turn",
                    "no_median_refuge",
                ],
            },
        },
        "lts": {"type": "integer", "enum": [1, 2, 3, 4]},
        "safety_score": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "note": {"type": "string"},
    },
}

GREEN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["photo_check", "seen", "shade_sky_pct", "greenery_score", "confidence", "note"],
    "properties": {
        "photo_check": {
            "type": "object",
            "additionalProperties": False,
            "required": ["usable", "issues"],
            "properties": {
                "usable": {"type": "string", "enum": ["yes", "partly", "no"]},
                "issues": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "vehicle_blocks_view",
                            "construction_blocks_view",
                            "glare_or_dark",
                            "blurry",
                            "off_road_or_wrong_place",
                        ],
                    },
                },
            },
        },
        "seen": {
            "type": "object",
            "additionalProperties": False,
            "required": ["street_trees", "canopy_over_road", "roadside_planting", "nature_nearby"],
            "properties": {
                "street_trees": {"type": "string", "enum": ["none", "sparse_or_young", "regular_rows"]},
                "canopy_over_road": {"type": "string", "enum": ["none", "partial", "full"]},
                "roadside_planting": {"type": "string", "enum": ["hardscape", "some", "lush"]},
                "nature_nearby": {
                    "type": "string",
                    "enum": ["none", "park_or_open_space", "creek_or_riparian", "orchard_or_hills"],
                },
            },
        },
        "shade_sky_pct": {"type": "integer", "enum": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]},
        "greenery_score": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "note": {"type": "string"},
    },
}
