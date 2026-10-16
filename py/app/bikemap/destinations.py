"""Nature destination pins and place search (merged from Hong Zhe's map-recommendation/backend.py).

Pins: live OSM Overpass query + Hong Zhe's 0-100 green score. Overpass gets a 5 s budget across
its mirrors; past that we serve 8 built-in Cupertino parks so the map is never empty in a demo.
Search: Nominatim, bounded to the routing area. The web app calls it on Enter only, because
Nominatim's usage policy forbids search-as-you-type.
"""

from __future__ import annotations

import json
import logging
import math
import time
import urllib.parse
import urllib.request
from typing import Any

from . import engine
from .models import Destination, DestinationsResponse, SearchResult
from .places import BBOX

log = logging.getLogger("bikemap.destinations")

USER_AGENT = "BikeMapCupertino/1.0 (DAHacks 5.0 demo)"
OVERPASS_MIRRORS = [
    "https://overpass.openstreetmap.fr/api/interpreter",  # 3.4 s in a 2026-10-16 test
    "https://overpass-api.de/api/interpreter",  # 27 s in the same test
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
]
BUDGET_S = 5.0
CENTER = (37.318, -122.04)  # Cupertino; 5 km covers the city and its 500 m buffer
RADIUS_M = 5000
LIVE_TTL_S = 30 * 60
FALLBACK_TTL_S = 2 * 60  # retry Overpass soon after a miss, but don't stall every page load
MAX_SNAP_M = 400  # a pin farther than this from any routable road is dropped

CATEGORY_METADATA = {
    "nature_reserve": ("Nature Reserve", "🌿", 95, "Protected natural habitat with trails & biodiversity"),
    "national_park": ("National Park", "🌲", 96, "Expansive scenic wilderness and protected nature"),
    "peak": ("Mountain Peak", "⛰️", 95, "Scenic summit, mountain ridge & panoramic overlook"),
    "viewpoint": ("Scenic Viewpoint", "🌅", 93, "Panoramic scenic overlook and vista point"),
    "water": ("Lake & Reservoir", "💧", 92, "Scenic freshwater lake, reservoir or waterfront"),
    "wood": ("Woodland", "🌲", 90, "Dense tree canopy and quiet natural grove"),
    "park": ("Public Park", "🌳", 85, "Community green space, lawns & recreational paths"),
    "garden": ("Public Garden", "🌸", 86, "Curated flora, flowering beds and peaceful seating"),
    "recreation_ground": ("Recreation Ground", "🏞️", 80, "Open grass fields for leisure and outdoors"),
    "wetland": ("Wetland", "🌊", 88, "Natural wetland and riparian corridor"),
    "default": ("Nature Spot", "🌿", 80, "Local natural retreat"),
}
# Campus quads and lots are tagged like parks but aren't destinations.
IGNORE_PATTERNS = [" Quad", " Courtyard", " Parking", " Lot "]

FALLBACK = [
    ("Cupertino Memorial Park", 37.3242, -122.0401, "park", ["Restrooms", "Drinking Water", "Benches"]),
    ("McClellan Ranch Preserve", 37.3140, -122.0680, "nature_reserve", ["Nature Trails", "Benches"]),
    ("Blackberry Farm Park", 37.3130, -122.0635, "park", ["Picnic Tables", "Restrooms"]),
    ("Stevens Creek County Park", 37.3100, -122.0760, "national_park", ["Nature Trails", "Drinking Water"]),
    ("Linda Vista Park", 37.3300, -122.0600, "park", ["Playground", "Benches"]),
    ("Jollyman Park", 37.3100, -122.0310, "park", ["Natural Grass", "Benches"]),
    ("Portal Park", 37.3280, -122.0380, "park", ["Natural Grass"]),
    ("Wilson Park", 37.3210, -122.0520, "park", ["Playground"]),
]

_cache: tuple[float, DestinationsResponse] | None = None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _overpass(query: str) -> dict[str, Any] | None:
    """Try the mirrors in order until the 5 s budget runs out."""
    body = f"data={urllib.parse.quote(query)}".encode()
    deadline = time.monotonic() + BUDGET_S
    for mirror in OVERPASS_MIRRORS:
        left = deadline - time.monotonic()
        if left <= 0.2:
            break
        try:
            req = urllib.request.Request(
                mirror,
                data=body,
                headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=left) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data.get("elements"), list):
                    return data
        except Exception as exc:  # noqa: BLE001 - any failure means "try the next mirror"
            log.warning("Overpass mirror %s failed: %s", mirror, exc)
    return None


def _amenities(tags: dict[str, str]) -> list[str]:
    out = []
    if tags.get("amenity") == "drinking_water" or tags.get("drinking_water") == "yes":
        out.append("Drinking Water")
    if tags.get("amenity") == "toilets" or tags.get("toilets") == "yes":
        out.append("Restrooms")
    if tags.get("amenity") == "bench" or tags.get("bench") == "yes":
        out.append("Benches")
    if tags.get("wheelchair") in ("yes", "designated"):
        out.append("Wheelchair Accessible")
    if tags.get("lit") == "yes":
        out.append("Lit Paths")
    if tags.get("dog") in ("yes", "leashed"):
        out.append("Dog Friendly")
    if tags.get("leisure") == "playground" or tags.get("playground") == "yes":
        out.append("Playground")
    if tags.get("picnic_table") == "yes" or tags.get("tourism") == "picnic_site":
        out.append("Picnic Tables")
    if "trail_visibility" in tags or tags.get("highway") == "path":
        out.append("Nature Trails")
    if tags.get("surface") in ("grass", "ground", "dirt", "wood"):
        out.append("Natural Grass")
    if (
        tags.get("natural") in ("water", "wetland")
        or tags.get("water") in ("lake", "reservoir")
        or "reservoir" in tags.get("name", "").lower()
    ):
        out.append("Water Views")
    if tags.get("natural") == "peak" or tags.get("tourism") == "viewpoint":
        out.append("Scenic Mountain Views")
    return out


def _green_score(cat: str, dist_m: float, tags: dict[str, str]) -> int:
    """Hong Zhe's 0-100 score: category base + amenity bonuses + up to +4 for being close."""
    base = CATEGORY_METADATA[cat][2]
    bonus = 0
    bonus += 2 if tags.get("amenity") == "drinking_water" or tags.get("drinking_water") == "yes" else 0
    bonus += 3 if tags.get("amenity") == "toilets" or tags.get("toilets") == "yes" else 0
    bonus += 2 if tags.get("wheelchair") in ("yes", "designated") else 0
    bonus += 2 if tags.get("lit") == "yes" else 0
    bonus += 2 if tags.get("dog") in ("yes", "leashed") else 0
    bonus += 2 if tags.get("surface") in ("grass", "wood") else 0
    bonus += 3 if tags.get("leisure") == "nature_reserve" or tags.get("natural") == "wood" else 0
    bonus += 3 if tags.get("natural") in ("water", "peak") or tags.get("tourism") == "viewpoint" else 0
    proximity = (1.0 - min(max(dist_m / max(RADIUS_M, 1000.0), 0.0), 1.0)) * 4.0
    return min(max(int(round(base + bonus + proximity)), 50), 99)


def _category(tags: dict[str, str]) -> str:
    natural, leisure, boundary = tags.get("natural"), tags.get("leisure"), tags.get("boundary")
    if natural in ("peak", "water", "wood", "wetland"):
        return natural
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if leisure in CATEGORY_METADATA:
        return leisure
    if boundary == "national_park":
        return "national_park"
    if boundary == "protected_area":
        return "nature_reserve"
    return "default"


def _dest(id_: str, name: str, lat: float, lng: float, cat: str, score: int, amenities: list[str]):
    label, icon, _, desc = CATEGORY_METADATA[cat]
    return Destination(
        id=id_,
        name=name,
        lat=round(lat, 6),
        lng=round(lng, 6),
        icon=icon,
        category_label=label,
        description=desc,
        score=score,
        amenities=amenities,
    )


def _routable(d: Destination) -> bool:
    """Peaks in the hills score high but sit outside the road graph, so 'Route here' can't reach them."""
    G = engine._load_graph()
    n = engine._nearest_node(G, d.lat, d.lng)
    return haversine_m(d.lat, d.lng, G.nodes[n]["y"], G.nodes[n]["x"]) <= MAX_SNAP_M


def _fallback() -> DestinationsResponse:
    out = []
    for name, lat, lng, cat, amen in FALLBACK:
        dist = haversine_m(CENTER[0], CENTER[1], lat, lng)
        out.append(_dest(f"fallback/{name}", name, lat, lng, cat, _green_score(cat, dist, {}), amen))
    return DestinationsResponse(source="fallback", destinations=out)


def nature_destinations(limit: int = 60) -> DestinationsResponse:
    global _cache
    now = time.monotonic()
    if _cache and now < _cache[0]:
        return _cache[1]

    lat, lng = CENTER
    around = f"(around:{RADIUS_M},{lat},{lng})"
    selectors = [
        '["leisure"="park"]', '["leisure"="nature_reserve"]', '["leisure"="garden"]',
        '["leisure"="recreation_ground"]', '["natural"="wood"]', '["natural"="wetland"]',
        '["natural"="water"]', '["natural"="peak"]', '["tourism"="viewpoint"]',
        '["boundary"="national_park"]', '["boundary"="protected_area"]',
    ]  # fmt: skip
    query = "[out:json][timeout:15];(" + "".join(f"nwr{s}{around};" for s in selectors) + ");out center tags;"
    raw = _overpass(query)
    if raw is None:
        res = _fallback()
        _cache = (now + FALLBACK_TTL_S, res)
        return res

    by_name: dict[str, Destination] = {}
    for el in raw["elements"]:
        tags = el.get("tags", {})
        name = (tags.get("name") or "").strip()
        if len(name) < 2 or any(p in name for p in IGNORE_PATTERNS):
            continue
        if tags.get("operator") == "De Anza College":
            continue
        center = el.get("center") or {}
        plat, plng = center.get("lat") or el.get("lat"), center.get("lon") or el.get("lon")
        if plat is None or plng is None:
            continue
        dist = haversine_m(lat, lng, plat, plng)
        if dist > RADIUS_M * 1.08:
            continue
        cat = _category(tags)
        score = _green_score(cat, dist, tags)
        d = _dest(f"{el.get('type')}/{el.get('id')}", name, plat, plng, cat, score, _amenities(tags))
        prev = by_name.get(name)
        if prev is None:
            by_name[name] = d
        elif (d.score or 0) > (prev.score or 0):
            d.amenities = sorted(set(prev.amenities + d.amenities))
            by_name[name] = d
    dests = sorted((d for d in by_name.values() if _routable(d)), key=lambda d: -(d.score or 0))[:limit]
    if not dests:
        res = _fallback()
        _cache = (now + FALLBACK_TTL_S, res)
        return res
    res = DestinationsResponse(source="live_osm_overpass", destinations=dests)
    _cache = (now + LIVE_TTL_S, res)
    return res


def search(q: str) -> list[SearchResult]:
    """Nominatim, bounded to the routing area (a result outside it couldn't be routed to)."""
    south, west, north, east = BBOX
    pad = 0.01
    params = {
        "q": q,
        "format": "json",
        "limit": 6,
        "viewbox": f"{west - pad},{north + pad},{east + pad},{south - pad}",
        "bounded": 1,
    }
    url = f"https://nominatim.openstreetmap.org/search?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=6) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    out = []
    for r in rows:
        full = str(r.get("display_name", ""))
        name, _, rest = full.partition(", ")
        out.append(SearchResult(name=name or full, detail=rest, lat=float(r["lat"]), lng=float(r["lon"])))
    return out
