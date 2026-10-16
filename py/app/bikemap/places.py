"""Preset Cupertino places for the start/end pickers and the demo script.

Coordinates are approximate (good enough to snap to the nearest graph node).
Add the routes your team actually rides.
"""

from __future__ import annotations

from .models import Place

PLACES: list[Place] = [
    Place(id="deanza", name="De Anza College", lat=37.3194, lng=-122.0450),
    Place(id="main-street", name="Main Street Cupertino", lat=37.3237, lng=-122.0107),
    Place(id="apple-park", name="Apple Park Visitor Center", lat=37.3327, lng=-122.0053),
    Place(id="library", name="Cupertino Library / Civic Center", lat=37.3177, lng=-122.0283),
    Place(id="memorial-park", name="Memorial Park", lat=37.3247, lng=-122.0426),
    Place(id="monta-vista", name="Monta Vista High School", lat=37.3164, lng=-122.0569),
    Place(id="rancho", name="Rancho San Antonio (trailhead)", lat=37.3330, lng=-122.0860),
]

# Bounding box used by the mock network layer (and a sane default map view).
BBOX = (37.290, -122.090, 37.340, -121.995)  # south, west, north, east
