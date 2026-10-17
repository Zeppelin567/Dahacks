"""Preset Cupertino places for the start/end pickers and the demo script.

Each point is the rider-facing entrance (main gate, front door on the street, trail access), checked against
OSM and the routing graph. The engine snaps a point to the nearest node on a public street or bike path of
the main network (engine._nearest_node), so none of these starts inside a parking lot. The first seven ids
are the original presets (the web app's default pair is deanza -> main-street): keep ids stable.
"""

from __future__ import annotations

from .models import Place

PLACES: list[Place] = [
    # original presets (ids unchanged, moved to the verified entrances)
    Place(id="deanza", name="De Anza College", lat=37.32281, lng=-122.04618),
    Place(id="main-street", name="Main Street Cupertino", lat=37.32313, lng=-122.0105),
    Place(id="apple-park", name="Apple Park Visitor Center", lat=37.333328, lng=-122.005696),
    Place(id="library", name="Cupertino Library / Civic Center", lat=37.31786, lng=-122.02928),
    Place(id="memorial-park", name="Memorial Park", lat=37.32467, lng=-122.04422),
    Place(id="monta-vista", name="Monta Vista High School", lat=37.315545, lng=-122.056949),
    Place(id="rancho", name="Rancho San Antonio (trailhead)", lat=37.33152, lng=-122.08315),
    # landmarks
    Place(id="infinite-loop", name="Apple Infinite Loop", lat=37.33116, lng=-122.03078),
    Place(id="vallco", name="Vallco / The Rise (Wolfe Rd)", lat=37.3256, lng=-122.0144),
    Place(id="cupertino-village", name="Cupertino Village (99 Ranch)", lat=37.335968, lng=-122.014368),
    Place(id="quinlan", name="Quinlan Community Center", lat=37.325859, lng=-122.041511),
    # schools
    Place(id="cupertino-hs", name="Cupertino High School", lat=37.319646, lng=-122.010457),
    Place(id="homestead-hs", name="Homestead High School", lat=37.337515, lng=-122.048344),
    Place(id="kennedy-ms", name="Kennedy Middle School", lat=37.310752, lng=-122.050474),
    Place(id="lawson-ms", name="Lawson Middle School", lat=37.328929, lng=-122.026724),
    Place(id="hyde-ms", name="Hyde Middle School", lat=37.310521, lng=-122.011312),
    # parks and trails
    Place(id="wilson-park", name="Wilson Park", lat=37.31903, lng=-122.0201),
    Place(id="regnart-creek-trail", name="Regnart Creek Trail (Blaney Ave)", lat=37.31862, lng=-122.0232),
    Place(id="creekside-park", name="Creekside Park", lat=37.31626, lng=-122.013327),
    Place(id="portal-park", name="Portal Park", lat=37.326584, lng=-122.019646),
    Place(id="jollyman-park", name="Jollyman Park", lat=37.31061, lng=-122.04146),
    Place(id="linda-vista-park", name="Linda Vista Park", lat=37.30778, lng=-122.06033),
    Place(id="blackberry-farm", name="Blackberry Farm Park", lat=37.31741, lng=-122.06154),
    Place(id="mcclellan-ranch", name="McClellan Ranch Preserve", lat=37.31278, lng=-122.0636),
    Place(id="mary-bridge-s", name="Mary Ave Bike Bridge (Cupertino end)", lat=37.3317, lng=-122.05059),
    Place(id="mary-bridge-n", name="Mary Ave Bike Bridge (Sunnyvale end)", lat=37.33555, lng=-122.05062),
]

# Bounding box used by the mock network layer (and a sane default map view).
BBOX = (37.290, -122.090, 37.340, -121.995)  # south, west, north, east
