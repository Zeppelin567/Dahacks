"""Per-edge scores. THIS IS WHERE THE MODEL / DATA WORK GOES. Nothing calls it yet.

Each function takes one road segment (an osmnx edge's attribute dict, plus anything
you join onto it) and returns 0..1 where 1 is best. The engine multiplies these
into the edge weights; see engine.py.

Candidate inputs (from the 2026-10-16 research, see docs/CONSENSUS.md):
  Safety : OSM maxspeed / lanes / cycleway tags, City of Cupertino Bikeways layer
           (Class I–IV), CCRS crash points near the edge, street-level image model.
  Green  : distance to OSM parks / green landuse / water, vegetation ratio from
           street-level images (Mapillary — NOT Google Street View, its ToS forbids
           building a city-wide index), road class / speed as a noise proxy.
"""

from __future__ import annotations

from typing import Any

Edge = dict[str, Any]


def safety_score(edge: Edge) -> float:
    """1 = very safe to ride, 0 = dangerous. TODO(Safe pipeline owner)."""
    raise NotImplementedError


def safety_reasons(edge: Edge) -> list[str]:
    """Plain-language reasons shown when a rider clicks the segment. TODO."""
    raise NotImplementedError


def green_score(edge: Edge, *, green: bool, quiet: bool, shade: bool) -> float:
    """1 = feels like the countryside, 0 = loud concrete. Combine only the enabled toggles.

    TODO(Green pipeline owner).
    """
    raise NotImplementedError
