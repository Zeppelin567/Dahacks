"""Design A ("homogeneous road sections") for the /network base layer. DISPLAY ONLY.

Copy as-is to py/app/bikemap/sections.py. engine.network() then becomes:

    _NETWORK: dict[str, NetworkResponse] = {}
    def network(layer: Mode) -> NetworkResponse:
        if layer not in _NETWORK:
            from . import sections  # lazy: sections imports engine
            segs = sections.build(_load_graph(), layer)
            _NETWORK[layer] = NetworkResponse(layer=layer, mock=False, segments=segs)
        return _NETWORK[layer]

Reads baked edge attributes only (4_bake.py output). Never writes to the graph. plan_route and every routing
weight are untouched: the router keeps reading the per-edge safety_score / vegetation inputs as baked.

Pipeline (per layer):
  1. display edges: one per physical street (4_bake street_key); highway=service without a photo is dropped
  2. street groups: connected same-(label, highway) edges; untagged maxspeed filled with the group's mode
  3. sections: connected same-(label, highway, facility, speed) edges (green: label + highway only)
  4. sections shorter than MIN_SECTION_M join the longest neighbouring section of the same street group
  5. divided roads: the two one-way carriageways of the same section facts are pooled (TWIN_M apart)
  6. section score = length-weighted median of its photo-scored edges (low-confidence and crossing-scored
     photos left out while others remain); safe: RED_SHARE or more of that photo length red -> red;
     no photo at all -> calibrated value = city-wide photo median of the same (highway, facility, speed),
     except that a ramp (*_link) or a rule-red section is never drawn safer than its map rule
  7. safe: a red photo edge inside a non-red section is never hidden -> drawn red as its own "hazard spot"
     with its own photo note (contiguous spot edges merge into one spot); a photo edge with a SEVERE
     hazard that the section popup does not list becomes a hazard spot too, in the section's colour
     unless its own photo scored a worse level, so the ramp warning sits exactly where the ramp is
     green: a run of good photo edges >= GREEN_SPOT_M inside a non-good section stays dark green on top
     ("green stretch"), so the greenest bits of a long street are not averaged away
  8. reasons: facts line + how it was scored + note of the representative photo (closest to the median)
     + hazards seen on >= HAZARD_SHARE of the section's photo length + one line per SEVERE hazard seen
     at fewer spots (those spots carry the full warning) + rule-red stretches that had no photo
  9. one Segment per walkable chain of a section: merged polyline, simplified SIMPLIFY_M, DECIMALS places;
     safe: hazard spot edges are cut out of their section's lines (each edge drawn once); order good ->
     ok -> bad, spots after the sections of their level (red still paints last);
     green order bad -> ok -> good -> stretches (stretches drawn on top of their section)
"""

from __future__ import annotations

import collections
import math
import re

from shapely.geometry import LineString

from . import engine, scoring
from .models import Segment

# ---- parameters ----------------------------------------------------------------------------------
MIN_SECTION_M = 60.0  # shorter sections join a neighbour of the same street
RED_SHARE = 1 / 3  # safe: a section is red when >= 1/3 of its (filtered) photo length is red
HAZARD_SHARE = 0.40  # a hazard is listed when seen on >= 40 % of the section's photo length
CALIB_MIN_EDGES, CALIB_MIN_M = 5, 300.0  # support a calibration cell needs
TWIN_M = 40.0  # max midpoint distance between the two carriageways of a divided road
TWIN_SHARE = 0.3  # pool when the paired length is >= 30 % of the shorter section
SIMPLIFY_M, DECIMALS = 1.5, 5
DROP_SERVICE = True  # highway=service without a photo: driveways, parking aisles, campus roads (all rule 5)
RED = 0.33  # engine._level's bad cut
GOOD = 0.66  # engine._level's good cut
GREEN_SPOT_M = 80.0  # green: a run of good photos >= this long inside a non-good section stays dark green
CROSSING_HAZARDS = {"wide_crossing", "no_median_refuge"}  # the photo scored the crossing, not the street
SEVERE = {  # never smoothed out of a popup; short name for the section line ("... at 2 photo spots")
    "freeway_ramp_crossing": "Freeway ramp crossing",
    "expressway": "Expressway-speed traffic",
    "dual_right_turn": "Double right-turn lanes",
    "right_turn_slip_lane": "Fast right-turn slip lane",
    "bike_lane_drops": "Bike lane drops",
}  # fmt: skip
CITY_FACILITY = {
    "SEPARATED BIKEWAY": "separated", "BIKE PATH": "separated", "BIKE LANE": "lane",
    "BUFFERED BIKE LANE": "lane", "BIKE ROUTE": "shared", "BIKE BLVD": "shared",
}  # fmt: skip
FACILITY_TEXT = {
    "separated": "mapped separated bikeway", "lane": "mapped bike lane", "shared": "mapped shared lane",
    "none": "no mapped bike lane",
}  # fmt: skip
HW_TEXT = {
    "cycleway": "bike path", "path": "shared path", "track": "track", "pedestrian": "pedestrian street",
    "residential": "residential street", "living_street": "living street", "unclassified": "minor road",
    "tertiary": "collector road", "secondary": "arterial", "primary": "major arterial", "trunk": "expressway",
    "primary_link": "arterial ramp", "secondary_link": "arterial ramp", "tertiary_link": "slip road",
    "trunk_link": "expressway ramp", "service": "service road",
}  # fmt: skip
CONF_RANK = {"low": 0, "medium": 1, "high": 2}
RANK = {"bad": 0, "ok": 1, "good": 2}  # worse level = lower rank


# ---- edge facts ----------------------------------------------------------------------------------
def first(v):
    return v[0] if isinstance(v, list) else v


def _vals(v):
    return v if isinstance(v, list) else [v]


def label(d) -> str:
    nm = first(d.get("name"))
    return str(nm) if nm else f"~{first(d.get('highway'))}"


def facility(d) -> str:
    """none | shared | lane | separated. The City layer wins over OSM (OSM flips lane/separate per way)."""
    c = CITY_FACILITY.get(d.get("city_pathtype"))
    if c:
        return c
    vals = set()
    for t in ("cycleway", "cycleway:right", "cycleway:left", "cycleway:both"):
        vals.update(str(x) for x in _vals(d.get(t)) if x is not None)
    if vals & {"track", "separate"}:
        return "separated"
    if "lane" in vals:
        return "lane"
    if "shared_lane" in vals:
        return "shared"
    return "none"


def speed(d) -> int | None:
    """Speed bucket in mph: 25 (<=25), 30, 35, 40 (>=40), or None when untagged."""
    nums = [int(m.group()) for x in _vals(d.get("maxspeed")) if x and (m := re.match(r"\d+", str(x)))]
    if not nums:
        return None
    s = max(nums)
    return 25 if s <= 25 else 30 if s <= 30 else 35 if s <= 35 else 40


def keep_for_display(d, layer) -> bool:
    if not DROP_SERVICE or first(d.get("highway")) != "service":
        return True
    has_photo = d.get("safety_src") == "photo" if layer == "safe" else d.get("vegetation_vlm") is not None
    return has_photo


def edge_value(d, layer) -> tuple[float, bool]:
    """(score 0..1, scored from a photo?) from baked attributes only, same functions the router reads."""
    if layer == "safe":
        return scoring.safety_score(d), d.get("safety_src") == "photo"
    return scoring.vegetation_score(d), d.get("vegetation_vlm") is not None


def hazards(d) -> list[str]:
    return [h for h in str(d.get("safety_hazards") or "").split(",") if h]


def severe(rows) -> list[str]:
    """SEVERE hazards seen on any of these photo rows, in SEVERE order."""
    seen = {h for r in rows if r["photo"] for h in hazards(r["d"])}
    return [h for h in SEVERE if h in seen]


def wquantile(pairs, q):
    """Length-weighted quantile of (value, weight) pairs."""
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    c = 0.0
    for v, w in pairs:
        c += w
        if c >= q * tot - 1e-9:
            return v
    return pairs[-1][0]


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


# ---- 1-5: display edges -> sections --------------------------------------------------------------
def display_edges(G, layer) -> dict:
    edges = {}
    for u, v, _k, d in G.edges(keys=True, data=True):
        if not keep_for_display(d, layer):
            continue
        key = (min(u, v), max(u, v), round(float(d["length"]), 1))  # 4_bake.street_key
        if key in edges:
            continue  # the other direction of a two-way street: same baked values, draw once
        s, photo = edge_value(d, layer)
        edges[key] = {
            "u": u, "v": v, "d": d, "L": float(d["length"]), "s": s, "photo": photo,
            "label": label(d), "hw": str(first(d.get("highway"))), "fac": facility(d), "spd": speed(d),
        }  # fmt: skip
    return edges


def _components(edges, at_node, keyfn) -> dict:
    """Connected components of edges that share a node and the same keyfn value."""
    uf = UF()
    for key in edges:
        uf.find(key)
    for ks in at_node.values():
        by = collections.defaultdict(list)
        for k in ks:
            by[keyfn(edges[k])].append(k)
        for grp in by.values():
            for k in grp[1:]:
                uf.union(grp[0], k)
    return {k: uf.find(k) for k in edges}


def build_sections(G, edges, layer) -> tuple[dict, dict]:
    at_node = collections.defaultdict(list)
    for key, r in edges.items():
        at_node[r["u"]].append(key)
        at_node[r["v"]].append(key)
    street = _components(edges, at_node, lambda r: (r["label"], r["hw"]))
    spd_len = collections.defaultdict(collections.Counter)  # fill untagged speed with the street's mode
    for key, r in edges.items():
        if r["spd"] is not None:
            spd_len[street[key]][r["spd"]] += r["L"]
    for key, r in edges.items():
        if r["spd"] is None and spd_len[street[key]]:
            r["spd"] = spd_len[street[key]].most_common(1)[0][0]
    if layer == "safe":
        sec_of = _components(edges, at_node, lambda r: (r["label"], r["hw"], r["fac"], r["spd"]))
    else:
        sec_of = dict(street)
    _absorb_short(edges, at_node, street, sec_of)
    _pool_twins(G, edges, sec_of, layer)
    sections = collections.defaultdict(list)
    for key, s in sec_of.items():
        sections[s].append(key)
    return sections, at_node


def _absorb_short(edges, at_node, street, sec_of) -> None:
    for _ in range(3):
        members = collections.defaultdict(list)
        for key, s in sec_of.items():
            members[s].append(key)
        length = {s: sum(edges[k]["L"] for k in ks) for s, ks in members.items()}
        changed = False
        for s in sorted(members, key=lambda s: length[s]):
            if length[s] >= MIN_SECTION_M:
                break
            nbrs = {}
            for k in members[s]:
                for n in (edges[k]["u"], edges[k]["v"]):
                    for k2 in at_node[n]:
                        s2 = sec_of[k2]
                        if s2 != s and street[k2] == street[k]:
                            nbrs[s2] = length[s2]
            if nbrs:
                tgt = max(nbrs, key=nbrs.get)
                for k in members[s]:
                    sec_of[k] = tgt
                members[tgt] += members[s]
                length[tgt] += length[s]
                members[s], length[s] = [], 0.0
                changed = True
        if not changed:
            break


def _mid_and_bearing(G, r):
    ux, uy = G.nodes[r["u"]]["x"], G.nodes[r["u"]]["y"]
    vx, vy = G.nodes[r["v"]]["x"], G.nodes[r["v"]]["y"]
    kx, ky = 111320.0 * math.cos(math.radians(uy)), 111320.0
    g = r["d"].get("geometry")
    if g is not None:
        p = g.interpolate(0.5, normalized=True)
        mx, my = p.x, p.y
    else:
        mx, my = (ux + vx) / 2, (uy + vy) / 2
    return mx * kx, my * ky, math.degrees(math.atan2((vy - uy) * ky, (vx - ux) * kx))


def _pool_twins(G, edges, sec_of, layer) -> None:
    """Divided road: pool the sections of the two carriageways (same name and facts, anti-parallel, close)."""
    one = {
        k: r for k, r in edges.items()
        if r["label"][0] != "~" and str(r["d"].get("oneway")) == "True" and r["hw"] != "service"
    }  # fmt: skip
    geo = {k: _mid_and_bearing(G, r) for k, r in one.items()}
    grid = collections.defaultdict(list)
    for k, (x, y, _) in geo.items():
        grid[(int(x // TWIN_M), int(y // TWIN_M))].append(k)
    facts = (lambda r: (r["hw"], r["fac"], r["spd"])) if layer == "safe" else (lambda r: (r["hw"],))
    paired = collections.Counter()
    for k, (x, y, b) in geo.items():
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k2 in grid[(int(x // TWIN_M) + dx, int(y // TWIN_M) + dy)]:
                    r, r2 = one[k], one[k2]
                    if sec_of[k2] == sec_of[k] or r2["label"] != r["label"] or facts(r2) != facts(r):
                        continue
                    if abs(abs((geo[k2][2] - b + 180) % 360 - 180) - 180) > 45:
                        continue  # not anti-parallel: a ramp or the next piece, not the other carriageway
                    dd = math.hypot(geo[k2][0] - x, geo[k2][1] - y)
                    if dd < TWIN_M and (best is None or dd < best[0]):
                        best = (dd, k2)
        if best:
            paired[(sec_of[k], sec_of[best[1]])] += one[k]["L"]
    length = collections.Counter()
    for k, s in sec_of.items():
        length[s] += edges[k]["L"]
    uf = UF()
    for (a, b), L in paired.items():
        if L >= TWIN_SHARE * min(length[a], length[b]):
            uf.union(a, b)
    for k in sec_of:
        sec_of[k] = uf.find(sec_of[k])


# ---- 6: scores -----------------------------------------------------------------------------------
def calibration(edges) -> dict:
    """City-wide photo medians per (hw, fac, spd) -> (hw, fac) -> (hw). Only for sections with no photo."""
    cells = collections.defaultdict(list)
    for r in edges.values():
        if r["photo"]:
            for c in ((r["hw"], r["fac"], r["spd"]), (r["hw"], r["fac"]), (r["hw"],)):
                cells[c].append((r["s"], r["L"]))
    return {
        c: (wquantile(p, 0.5), len(p))
        for c, p in cells.items()
        if len(p) >= CALIB_MIN_EDGES and sum(w for _, w in p) >= CALIB_MIN_M
    }


def trusted_photos(rows, layer) -> list:
    photo = [r for r in rows if r["photo"]]
    if layer != "safe" or not photo:
        return photo
    good = [
        r for r in photo
        if r["d"].get("safety_confidence") != "low" and not (set(hazards(r["d"])) & CROSSING_HAZARDS)
    ]  # fmt: skip
    return good or photo


def score_section(rows, layer, calib) -> tuple[float, str, list, int]:
    """(score, source, photo rows used, calibration support).

    source: photo | photo-red-zone | calibrated | rule-kept | rule.
    rule-kept: no photo, and the map rule of a ramp (*_link) or of a rule-red road is worse than the
    city-wide calibrated value -> the rule wins (a calibrated guess never makes a ramp look safer)."""
    used = trusted_photos(rows, layer)
    if used:
        pairs = [(r["s"], r["L"]) for r in used]
        med = wquantile(pairs, 0.5)
        if layer == "safe" and med >= RED:
            red = [p for p in pairs if p[0] < RED]
            if sum(w for _, w in red) >= RED_SHARE * sum(w for _, w in pairs):
                return wquantile(red, 0.5), "photo-red-zone", used, 0
        return med, "photo", used, 0
    r0 = max(rows, key=lambda r: r["L"])
    rule = min(r["s"] for r in rows)
    for c in ((r0["hw"], r0["fac"], r0["spd"]), (r0["hw"], r0["fac"]), (r0["hw"],)):
        if c in calib:
            if layer == "safe" and rule < calib[c][0] and (r0["hw"].endswith("_link") or rule < RED):
                return rule, "rule-kept", [], calib[c][1]
            return calib[c][0], "calibrated", [], calib[c][1]
    return r0["s"], "rule", [], 0


# ---- 8: popup text -------------------------------------------------------------------------------
def _fmt_len(L: float) -> str:
    return f"{L / 1000:.1f} km" if L >= 1000 else f"{L:.0f} m"


def _facts_line(r0, L) -> str:
    nm = first(r0["d"].get("name"))
    parts = [str(nm) if nm else HW_TEXT.get(r0["hw"], r0["hw"]).capitalize(), _fmt_len(L)]
    if r0["hw"] not in ("cycleway", "path", "track", "pedestrian"):
        parts.append(FACILITY_TEXT[r0["fac"]])
        if r0["spd"]:
            parts.append(f"{r0['spd']}{'+' if r0['spd'] == 40 else ''} mph")
    return " · ".join(parts)


def _hazard_lines(used, spd) -> list[str]:
    tot = sum(r["L"] for r in used) or 1.0
    hz = collections.Counter()
    for r in used:
        for h in dict.fromkeys(hazards(r["d"])):
            hz[h] += r["L"]
    out = []
    for h, w in sorted(hz.items(), key=lambda x: (-x[1], x[0] not in SEVERE, x[0])):  # ties: severe, then a-z
        if w / tot < HAZARD_SHARE:
            break
        if h == "high_speed_traffic" and spd is not None and spd < 40:
            continue  # defined for 40+ mph only; Claude also uses it at 35 (truth.md §4)
        out.append(h)
    return out[:3]


def _rep(used, med, common):
    """Representative photo: closest to the median, then more confident, then sharing the common hazards."""
    return min(
        used,
        key=lambda r: (
            abs(r["s"] - med),
            -CONF_RANK.get(r["d"].get("safety_confidence"), 1),
            -len(set(hazards(r["d"])) & set(common)),
            -r["L"],
        ),
    )


def section_reasons(rows, layer, med, src, used, support) -> list[str]:
    L = sum(r["L"] for r in rows)
    r0 = max(rows, key=lambda r: r["L"])
    head = _facts_line(r0, L)
    n = len(used)
    pieces = f"{n} photographed piece{'s' if n != 1 else ''}"
    if layer == "green":
        if used:
            rep = min(used, key=lambda r: (abs(r["s"] - med), -r["L"]))
            return [head, f"Colour: median of {pieces}"] + engine._green_reasons(rep["d"])
        return [head, "No street photo: estimated from map data"] + engine._green_reasons(r0["d"])
    if not used:
        out = [head]
        if src == "calibrated":
            out.append(
                f"No street photo here: colour = typical score of {support:,} photographed pieces"
                " with the same road type, bike facility and speed"
            )
        elif src == "rule-kept":
            hw = HW_TEXT.get(r0["hw"], r0["hw"])
            stress = " (high stress)" if med < RED else ""
            out.append(
                f"No street photo here: map data scores this {hw} {med * 10:.0f}/10{stress}, kept because"
                f" it is lower than the typical score of {support:,} photographed pieces of the same type"
            )
        else:
            out.append("No street imagery — scored from map data")
        return out
    common = _hazard_lines(used, r0["spd"])
    rep = _rep(used, med, common)
    out = [head, f"Colour: median of {pieces} along this stretch"]
    if src == "photo-red-zone":
        out.append("Over a third of this stretch scored red from its photos")
    out.append(str(rep["d"].get("safety_note") or ""))
    photos = [r for r in rows if r["photo"]]
    for h in severe(photos):  # a severe hazard at a few spots: name it here, the spots carry the full text
        if h not in common:
            k = sum(1 for r in photos if h in hazards(r["d"]))
            where = f"{k} photo spot{'s' if k != 1 else ''}"
            out.append(f"{SEVERE[h]} at {where} on this stretch (shown as hazard spots)")
    low = [r for r in used if RANK[engine._level(r["s"])] < RANK[engine._level(round(med, 2))]]
    if low:  # smoothing never hides that some spots scored worse (grafted from design B)
        worst = round(10 * min(r["s"] for r in low))
        out.append(f"{len(low)} of {n} photo spots here scored lower (worst {worst}/10)")
    out += [scoring.HAZARD_TEXT.get(h, h) for h in common]
    no_photo_red = sum(r["L"] for r in rows if not r["photo"] and r["s"] < RED)
    if no_photo_red and engine._level(round(med, 2)) != "bad":
        out.append(f"{_fmt_len(no_photo_red)} here had no photo; map rule says high stress")
    confs = sorted(CONF_RANK.get(r["d"].get("safety_confidence"), 1) for r in used)
    if confs[len(confs) // 2] == 0:
        out.append("⚠️ uncertain: the street photos were hard to read")
    return [x for x in out if x]


def spot_reasons(rows, sec_med, sec_name, spd, sec_colour: bool = False) -> list[str]:
    """Hazard spot popup. Every SEVERE hazard of every photo in the spot is listed, first; then the
    representative photo's other hazards up to three lines. sec_colour: drawn in the section's colour
    because its own photo scored a better level (the spot exists for a severe hazard)."""
    L = sum(r["L"] for r in rows)
    med = wquantile([(r["s"], r["L"]) for r in rows], 0.5)
    sev = severe(rows)
    rep = _rep(rows, med, sev)
    rest = "coloured like the rest of" if sec_colour else "the rest of"
    photos = "photos" if len(rows) > 1 else "photo"
    out = [
        f"Hazard spot · {_fmt_len(L)} · scored {med * 10:.0f}/10 from its street {photos}",
        f"({rest} {sec_name}: {sec_med * 10:.0f}/10)",
        str(rep["d"].get("safety_note") or ""),
    ]
    hz = sev + [
        h for h in hazards(rep["d"])
        if h not in sev and not (h == "high_speed_traffic" and spd is not None and spd < 40)
    ]  # fmt: skip
    out += [scoring.HAZARD_TEXT.get(h, h) for h in hz[: max(3, len(sev))]]
    if rep["d"].get("safety_confidence") == "low":
        out.append("⚠️ uncertain: the street photo was hard to read")
    return [x for x in out if x]


def green_spot_reasons(rows, sec_med, sec_name) -> list[str]:
    L = sum(r["L"] for r in rows)
    med = wquantile([(r["s"], r["L"]) for r in rows], 0.5)
    rep = min(rows, key=lambda r: (abs(r["s"] - med), -r["L"]))
    head = [
        f"Green stretch · {_fmt_len(L)} · scored {med * 10:.0f}/10 from its street photos",
        f"(the rest of {sec_name}: {sec_med * 10:.0f}/10)",
    ]
    return head + engine._green_reasons(rep["d"])


def spot_targets(keys, edges, lv, reasons) -> dict:
    """Safe hazard spots of one section: street key -> level to draw.

    A red photo in a non-red section is drawn red. A photo with a SEVERE hazard whose rider text the
    section popup does not carry is drawn in the section's colour, or its own if that is worse."""
    target = {}
    for k in keys:
        r = edges[k]
        if not r["photo"]:
            continue
        if lv != "bad" and r["s"] < RED:
            target[k] = "bad"
        elif any(scoring.HAZARD_TEXT.get(h, h) not in reasons for h in severe([r])):
            target[k] = min(engine._level(r["s"]), lv, key=RANK.get)
    return target


# ---- 9: geometry ---------------------------------------------------------------------------------
def chains(keys, edges) -> list[list[tuple]]:
    """Walk a set of edges into polylines: continue through nodes where exactly two of them meet."""
    keyset = set(keys)
    inc = collections.defaultdict(list)
    for k in keys:
        inc[edges[k]["u"]].append(k)
        inc[edges[k]["v"]].append(k)
    used = set()
    out = []

    def walk(node, k):
        ch = []
        while k is not None and k not in used:
            used.add(k)
            r = edges[k]
            fwd = node == r["u"]
            ch.append((k, fwd))
            node = r["v"] if fwd else r["u"]
            nxt = [x for x in inc[node] if x != k and x in keyset]
            k = nxt[0] if len(nxt) == 1 else None
        return ch

    for n, ks in inc.items():
        if len(ks) != 2:
            for k in ks:
                if k not in used:
                    out.append(walk(n, k))
    for k in keys:  # loops
        if k not in used:
            out.append(walk(edges[k]["u"], k))
    return out


def chain_coords(G, ch, edges) -> list[tuple[float, float]]:
    coords: list = []
    for k, fwd in ch:
        r = edges[k]
        c = engine._edge_coords(G, r["u"], r["v"], r["d"])
        if not fwd:
            c = c[::-1]
        coords.extend(c if not coords else c[1:])
    if len(coords) > 2:
        kx = 111320.0 * math.cos(math.radians(coords[0][0]))
        ls = LineString([(b * kx, a * 111320.0) for a, b in coords]).simplify(
            SIMPLIFY_M, preserve_topology=False
        )
        coords = [(y / 111320.0, x / kx) for x, y in ls.coords]
    return [(round(a, DECIMALS), round(b, DECIMALS)) for a, b in coords]


# ---- entry point ---------------------------------------------------------------------------------
def build(G, layer, with_meta: bool = False):
    edges = display_edges(G, layer)
    sections, _ = build_sections(G, edges, layer)
    calib = calibration(edges)
    segs: list[Segment] = []
    spots: list[Segment] = []
    disp: dict = {}  # street key -> drawn level (metrics only)
    info: dict = {}
    for sid, keys in sections.items():
        rows = [edges[k] for k in keys]
        med, src, used, support = score_section(rows, layer, calib)
        score = round(med, 2)
        lv = engine._level(score)
        info[sid] = (med, src, len(used))
        reasons = section_reasons(rows, layer, med, src, used, support)
        for k in keys:
            disp[k] = lv
        r0 = max(rows, key=lambda r: r["L"])
        name = str(first(r0["d"].get("name")) or f"this {HW_TEXT.get(r0['hw'], r0['hw'])}")
        # safe: hazard spot edges are cut out of the section's lines and drawn as their own segments, so
        # every edge is drawn once (no doubled opacity) and its popup is the spot's
        target = spot_targets(keys, edges, lv, reasons) if layer == "safe" else {}
        for ch in chains([k for k in keys if k not in target], edges):
            segs.append(Segment(coords=chain_coords(G, ch, edges), score=score, level=lv, reasons=reasons))
        if layer == "green":
            if lv == "good":
                continue
            good = [k for k in keys if edges[k]["photo"] and edges[k]["s"] >= GOOD]
            for ch in chains(good, edges):
                srows = [edges[k] for k, _ in ch]
                if sum(r["L"] for r in srows) < GREEN_SPOT_M:
                    continue  # a single green photo does not flicker the street
                for k, _ in ch:
                    disp[k] = "good"
                sc = round(wquantile([(r["s"], r["L"]) for r in srows], 0.5), 2)
                spots.append(
                    Segment(
                        coords=chain_coords(G, ch, edges),
                        score=sc,
                        level=engine._level(sc),
                        reasons=green_spot_reasons(srows, med, name),
                    )
                )
            continue
        for tl in ("good", "ok", "bad"):
            for ch in chains([k for k, t in target.items() if t == tl], edges):
                srows = [edges[k] for k, _ in ch]
                for k, _ in ch:
                    disp[k] = tl
                own = round(wquantile([(r["s"], r["L"]) for r in srows], 0.5), 2)
                sc = own if engine._level(own) == tl else score  # own level better: section's colour
                spots.append(
                    Segment(
                        coords=chain_coords(G, ch, edges),
                        score=sc,
                        level=tl,
                        reasons=spot_reasons(srows, med, name, r0["spd"], sec_colour=sc != own),
                    )
                )
    order = {"good": 0, "ok": 1, "bad": 2} if layer == "safe" else {"bad": 0, "ok": 1, "good": 2}
    out = sorted(segs + spots, key=lambda s: order[s.level])  # stable: spots after sections of their level
    if with_meta:
        return out, {
            "edges": edges,
            "sections": sections,
            "disp": disp,
            "info": info,
            "calib": calib,
            "n_spots": len(spots),
        }
    return out
