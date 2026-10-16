"""
backend.py — OpenStreetMap Live Green Destination Recommendation Backend
========================================================================
Full backend service for the BikeMap green destination discovery engine.
Features:
1. /api/recommendations — Queries live OSM Overpass across multiple mirrors,
   filters, deduplicates, and runs a green scoring & recommendation algorithm.
2. /api/search — Live Nominatim search proxy with local spatial bias.
3. /api/health — Status & health check endpoint.
4. Static file serving for the map frontend (index.html, style.css, map.js).
"""

from __future__ import annotations

import json
import logging
import math
import os
import urllib.parse
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("bikemap.backend")

# Initialize FastAPI app
app = FastAPI(
    title="BikeMap OSM Recommendation Backend",
    description="Live OpenStreetMap Green Destination Recommendation Engine",
    version="1.0.0",
)

# Enable CORS for local dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reliable Overpass API mirrors with failover
OVERPASS_MIRRORS = [
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
]

# Category definitions and scoring
CATEGORY_METADATA = {
    "nature_reserve": {
        "label": "Nature Reserve",
        "icon": "🌿",
        "base_score": 95,
        "description": "Protected natural habitat with trails & biodiversity",
    },
    "national_park": {
        "label": "National Park",
        "icon": "🌲",
        "base_score": 96,
        "description": "Expansive scenic wilderness and protected nature",
    },
    "peak": {
        "label": "Mountain Peak",
        "icon": "⛰️",
        "base_score": 95,
        "description": "Scenic summit, mountain ridge & panoramic overlook",
    },
    "viewpoint": {
        "label": "Scenic Viewpoint",
        "icon": "🌅",
        "base_score": 93,
        "description": "Panoramic scenic overlook and vista point",
    },
    "water": {
        "label": "Lake & Reservoir",
        "icon": "💧",
        "base_score": 92,
        "description": "Scenic freshwater lake, reservoir or waterfront",
    },
    "wood": {
        "label": "Woodland",
        "icon": "🌲",
        "base_score": 90,
        "description": "Dense tree canopy and quiet natural grove",
    },
    "park": {
        "label": "Public Park",
        "icon": "🌳",
        "base_score": 85,
        "description": "Community green space, lawns & recreational paths",
    },
    "garden": {
        "label": "Public Garden",
        "icon": "🌸",
        "base_score": 86,
        "description": "Curated flora, flowering beds and peaceful seating",
    },
    "recreation_ground": {
        "label": "Recreation Ground",
        "icon": "🏞️",
        "base_score": 80,
        "description": "Open grass fields for leisure and outdoor activities",
    },
    "wetland": {
        "label": "Wetland",
        "icon": "🌊",
        "base_score": 88,
        "description": "Natural wetland and riparian corridor",
    },
    "default": {
        "label": "Nature Spot",
        "icon": "🌿",
        "base_score": 80,
        "description": "Local natural retreat",
    },
}

# Names that represent internal campus quads rather than public green destinations
IGNORE_PATTERNS = [" Quad", " Courtyard", " Parking", " Lot "]


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in meters."""
    r = 6371000.0  # Earth's radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def query_overpass_mirrors(query_ql: str, timeout_sec: int = 15) -> dict[str, Any]:
    """Execute Overpass QL query with automatic failover across reliable mirrors."""
    post_data = f"data={urllib.parse.quote(query_ql)}".encode("utf-8")
    last_err = None

    for mirror in OVERPASS_MIRRORS:
        try:
            logger.info("Querying Overpass mirror: %s", mirror)
            req = urllib.request.Request(
                mirror,
                data=post_data,
                headers={
                    "User-Agent": "BikeMapCupertino/1.0 (hackathon live green recommendation backend)",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    elements = data.get("elements", [])
                    if isinstance(elements, list):
                        logger.info("Mirror %s succeeded with %d elements", mirror, len(elements))
                        data["_mirror_used"] = mirror
                        return data
        except Exception as exc:
            logger.warning("Mirror %s failed: %s", mirror, exc)
            last_err = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=f"All OpenStreetMap Overpass mirrors failed or timed out: {last_err}",
    )


def extract_amenities(tags: dict[str, str]) -> list[str]:
    """Extract human-readable amenity badges from OSM tags."""
    amenities = []
    if tags.get("amenity") == "drinking_water" or tags.get("drinking_water") == "yes":
        amenities.append("Drinking Water")
    if tags.get("amenity") == "toilets" or tags.get("toilets") == "yes":
        amenities.append("Restrooms")
    if tags.get("amenity") == "bench" or tags.get("bench") == "yes":
        amenities.append("Benches")
    if tags.get("wheelchair") in ("yes", "designated"):
        amenities.append("Wheelchair Accessible")
    if tags.get("lit") == "yes":
        amenities.append("Lit Paths")
    if tags.get("dog") in ("yes", "leashed"):
        amenities.append("Dog Friendly")
    if tags.get("leisure") == "playground" or tags.get("playground") == "yes":
        amenities.append("Playground")
    if tags.get("picnic_table") == "yes" or tags.get("tourism") == "picnic_site":
        amenities.append("Picnic Tables")
    if "trail_visibility" in tags or tags.get("highway") == "path":
        amenities.append("Nature Trails")
    if tags.get("surface") in ("grass", "ground", "dirt", "wood"):
        amenities.append("Natural Grass")
    if tags.get("natural") in ("water", "wetland") or tags.get("water") in ("lake", "reservoir") or "reservoir" in tags.get("name", "").lower():
        amenities.append("Water Views")
    if tags.get("natural") == "peak" or tags.get("tourism") == "viewpoint":
        amenities.append("Scenic Mountain Views")
    return amenities


def calculate_green_score(
    category_key: str,
    dist_m: float,
    max_radius_m: float,
    tags: dict[str, str],
) -> int:
    """
    Score the green destination (0 to 100) based on:
    1. Base category quality (nature reserve > peak > viewpoint > water > park > wood)
    2. Amenity bonuses (restrooms, water, trails, dog friendly, accessibility, water/mountain views)
    3. Proximity score (closer destinations within the search radius gain an edge)
    """
    cat_info = CATEGORY_METADATA.get(category_key, CATEGORY_METADATA["default"])
    base = cat_info["base_score"]

    # Feature bonuses
    bonus = 0
    if tags.get("amenity") == "drinking_water" or tags.get("drinking_water") == "yes":
        bonus += 2
    if tags.get("amenity") == "toilets" or tags.get("toilets") == "yes":
        bonus += 3
    if tags.get("wheelchair") in ("yes", "designated"):
        bonus += 2
    if tags.get("lit") == "yes":
        bonus += 2
    if tags.get("dog") in ("yes", "leashed"):
        bonus += 2
    if tags.get("surface") in ("grass", "wood"):
        bonus += 2
    if tags.get("leisure") == "nature_reserve" or tags.get("natural") == "wood":
        bonus += 3
    if tags.get("natural") in ("water", "peak") or tags.get("tourism") == "viewpoint":
        bonus += 3

    # Proximity adjustment (up to +4 points for closer spots within radius)
    ratio = min(max(dist_m / max(max_radius_m, 1000.0), 0.0), 1.0)
    proximity_mod = (1.0 - ratio) * 4.0

    final_score = int(round(base + bonus + proximity_mod))
    return min(max(final_score, 50), 99)


# ============================================================
# API Routes
# ============================================================

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "osm-green-recommendation-backend",
        "mirrors_configured": len(OVERPASS_MIRRORS),
        "primary_mirror": OVERPASS_MIRRORS[0],
    }


@app.get("/api/recommendations")
def get_recommendations(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius: int = Query(3500, ge=500, le=25000, description="Search proximity radius in meters"),
    limit: int = Query(30, ge=1, le=100, description="Max recommendations to return"),
) -> dict[str, Any]:
    """
    Live OpenStreetMap Overpass Recommendation Endpoint.
    Searches for parks, reserves, gardens, recreation grounds, woodlands, water bodies,
    and mountain peaks/viewpoints within `radius` meters of (lat, lng),
    ranks them using the green scoring algorithm, and returns top destinations.
    """
    # Overpass QL query targeting real nature spaces (parks, water, peaks, reserves)
    ql = f"""
[out:json][timeout:15];
(
  nwr["leisure"="park"](around:{radius},{lat},{lng});
  nwr["leisure"="nature_reserve"](around:{radius},{lat},{lng});
  nwr["leisure"="garden"](around:{radius},{lat},{lng});
  nwr["leisure"="recreation_ground"](around:{radius},{lat},{lng});
  nwr["natural"="wood"](around:{radius},{lat},{lng});
  nwr["natural"="wetland"](around:{radius},{lat},{lng});
  nwr["natural"="water"](around:{radius},{lat},{lng});
  nwr["natural"="peak"](around:{radius},{lat},{lng});
  nwr["tourism"="viewpoint"](around:{radius},{lat},{lng});
  nwr["boundary"="national_park"](around:{radius},{lat},{lng});
  nwr["boundary"="protected_area"](around:{radius},{lat},{lng});
);
out center tags;
""".strip()

    raw_data = query_overpass_mirrors(ql)
    elements = raw_data.get("elements", [])

    # Process and deduplicate elements
    seen_names: dict[str, dict[str, Any]] = {}

    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name or len(name.strip()) < 2:
            continue
        name = name.strip()

        # Filter out campus quads and private lots
        if any(pat in name for pat in IGNORE_PATTERNS) or tags.get("operator") == "De Anza College":
            continue

        # Coordinates: center for ways/relations, lat/lon for nodes
        center = el.get("center") or {}
        item_lat = center.get("lat") or el.get("lat")
        item_lng = center.get("lon") or el.get("lon")
        if item_lat is None or item_lng is None:
            continue

        # Determine category (prioritizing mountains/peaks, viewpoints, water, and reserves)
        natural_val = tags.get("natural")
        tourism_val = tags.get("tourism")
        leisure_val = tags.get("leisure")
        boundary_val = tags.get("boundary")

        if natural_val in ("peak", "water", "wood", "wetland"):
            cat_key = natural_val
        elif tourism_val == "viewpoint":
            cat_key = "viewpoint"
        elif leisure_val in CATEGORY_METADATA:
            cat_key = leisure_val
        elif boundary_val == "national_park":
            cat_key = "national_park"
        elif boundary_val == "protected_area":
            cat_key = "nature_reserve"
        elif natural_val in CATEGORY_METADATA:
            cat_key = natural_val
        else:
            cat_key = "default"
        if cat_key not in CATEGORY_METADATA:
            cat_key = "default"

        dist = haversine_m(lat, lng, item_lat, item_lng)
        if dist > radius * 1.08:  # slight leeway
            continue

        score = calculate_green_score(cat_key, dist, radius, tags)
        amenities = extract_amenities(tags)
        cat_meta = CATEGORY_METADATA[cat_key]

        place_obj = {
            "id": f"{el.get('type')}/{el.get('id')}",
            "name": name,
            "lat": round(item_lat, 6),
            "lng": round(item_lng, 6),
            "category": cat_key,
            "category_label": cat_meta["label"],
            "icon": cat_meta["icon"],
            "description": cat_meta["description"],
            "score": score,
            "distance_m": int(round(dist)),
            "distance_km": round(dist / 1000.0, 2),
            "amenities": amenities,
            "tags": tags,
        }

        # Deduplicate by name: keep the closer or higher-scored instance
        if name in seen_names:
            prev = seen_names[name]
            if place_obj["score"] > prev["score"] or place_obj["distance_m"] < prev["distance_m"]:
                merged_amenities = list(set(prev["amenities"] + amenities))
                place_obj["amenities"] = merged_amenities
                seen_names[name] = place_obj
        else:
            seen_names[name] = place_obj

    # Sort recommendations by score descending, then by distance ascending
    recommendations = list(seen_names.values())
    recommendations.sort(key=lambda x: (-x["score"], x["distance_m"]))
    recommendations = recommendations[:limit]

    return {
        "success": True,
        "source": "live_osm_overpass",
        "mirror": raw_data.get("_mirror_used"),
        "user_location": {"lat": lat, "lng": lng},
        "radius_m": radius,
        "total_found": len(recommendations),
        "recommendations": recommendations,
    }


@app.get("/api/search")
def search_places(
    q: str = Query(..., min_length=1, description="Search query string"),
    lat: float | None = Query(None, description="Center latitude for proximity bias"),
    lng: float | None = Query(None, description="Center longitude for proximity bias"),
) -> dict[str, Any]:
    """Proxy live Nominatim search with local spatial bias."""
    params: dict[str, Any] = {
        "q": q,
        "format": "json",
        "addressdetails": 1,
        "limit": 8,
    }
    if lat is not None and lng is not None:
        delta = 0.15
        params["viewbox"] = f"{lng - delta},{lat + delta},{lng + delta},{lat - delta}"
        params["bounded"] = 0

    url = f"https://nominatim.openstreetmap.org/search?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "BikeMapCupertino/1.0 (hackathon-search-proxy)"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"success": True, "results": data}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Nominatim search failed: {exc}")


# ============================================================
# Static Files & Frontend Serving
# ============================================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(os.path.join(CURRENT_DIR, "index.html"))

@app.get("/style.css")
def serve_css() -> FileResponse:
    return FileResponse(os.path.join(CURRENT_DIR, "style.css"), media_type="text/css")

@app.get("/map.js")
def serve_js() -> FileResponse:
    return FileResponse(os.path.join(CURRENT_DIR, "map.js"), media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    # Start on port 8000 when run directly
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
