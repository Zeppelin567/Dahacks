"""Routing engine. TODAY: a mock that returns plausible-looking fake routes.

The real engine replaces `plan_route` and `network` with:
  1. osmnx bike graph of Cupertino, saved once to disk (don't hit Overpass at demo time)
  2. per-edge scores from scoring.py: safety (Safe map) and green/quiet/shade (Green map)
  3. weighted shortest path:
       safe : weight = length * risk_penalty(edge)
       green: weight = length * (1 - rural * green_score(edge, prefs))
  4. fastest = plain shortest path by length, for the comparison numbers

Keep the return types identical (models.py) and the web app keeps working.
"""

from __future__ import annotations

import hashlib
import math

from .models import (
    Comparison,
    LatLng,
    Level,
    Mode,
    NetworkResponse,
    Route,
    RouteRequest,
    RouteResponse,
    Segment,
)
from .places import BBOX

BIKE_KMH = 15.0

SAFE_REASONS = {
    "bad": ["MOCK: 40 mph, 3 lanes each way", "MOCK: no bike lane", "MOCK: 2 bike crashes since 2016"],
    "ok": ["MOCK: 30 mph", "MOCK: painted bike lane (Class II)"],
    "good": ["MOCK: 25 mph residential street", "MOCK: separated path (Class I/IV)"],
}
GREEN_REASONS = {
    "bad": ["MOCK: arterial, heavy traffic noise", "MOCK: no trees, full sun"],
    "ok": ["MOCK: some street trees"],
    "good": ["MOCK: runs along a park", "MOCK: quiet residential street, tree canopy"],
}


def _noise(*xs: float) -> float:
    """Deterministic pseudo-random 0..1 from coordinates, so the mock is stable between calls."""
    h = hashlib.sha1(",".join(f"{x:.4f}" for x in xs).encode()).digest()
    return h[0] / 255


def _level(score: float) -> Level:
    return "good" if score >= 0.66 else "ok" if score >= 0.33 else "bad"


def _haversine_m(a: LatLng, b: LatLng) -> float:
    r = 6_371_000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def _curve(start: LatLng, end: LatLng, bend: float, n: int = 24) -> list[LatLng]:
    """Quadratic Bézier from start to end; `bend` pushes the middle sideways (fraction of length)."""
    (y0, x0), (y1, x1) = start, end
    cy, cx = (y0 + y1) / 2 - (x1 - x0) * bend, (x0 + x1) / 2 + (y1 - y0) * bend
    pts = []
    for i in range(n + 1):
        t = i / n
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t**2 * y1
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t**2 * x1
        pts.append((round(y, 6), round(x, 6)))
    return pts


def _segments(coords: list[LatLng], mode: Mode, bias: float) -> list[Segment]:
    """Chop a route into ~8 coloured stretches. `bias` > 0 makes the stretches better on average."""
    reasons = SAFE_REASONS if mode == "safe" else GREEN_REASONS
    step = max(1, len(coords) // 8)
    out = []
    for i in range(0, len(coords) - 1, step):
        chunk = coords[i : i + step + 1]
        score = min(1.0, max(0.0, _noise(*chunk[0], len(mode)) * (1 - bias) + bias))
        level = _level(score)
        out.append(Segment(coords=chunk, score=round(score, 2), level=level, reasons=reasons[level]))
    return out


def _route(coords: list[LatLng], mode: Mode, bias: float) -> Route:
    dist = sum(_haversine_m(a, b) for a, b in zip(coords, coords[1:], strict=False))
    return Route(
        coords=coords,
        distance_m=round(dist),
        duration_min=round(dist / 1000 / BIKE_KMH * 60, 1),
        segments=_segments(coords, mode, bias),
    )


def plan_route(req: RouteRequest) -> RouteResponse:
    fastest = _route(_curve(req.start, req.end, 0.02), req.mode, bias=0.0)

    if req.mode == "safe":
        recommended = _route(_curve(req.start, req.end, 0.22), "safe", bias=0.6)
        risky = lambda r: sum(s.level == "bad" for s in r.segments)  # noqa: E731
        compare = Comparison(
            extra_min=round(recommended.duration_min - fastest.duration_min, 1),
            risky_segments_fastest=risky(fastest),
            risky_segments_recommended=risky(recommended),
        )
    else:
        # The slider decides how far the route is allowed to wander toward greener streets.
        bend, bias = -0.05 - 0.35 * req.rural, 0.2 + 0.6 * req.rural
        recommended = _route(_curve(req.start, req.end, bend), "green", bias)
        green_pct = lambda r: round(100 * sum(s.score for s in r.segments) / len(r.segments))  # noqa: E731
        compare = Comparison(
            extra_min=round(recommended.duration_min - fastest.duration_min, 1),
            greenery_pct_fastest=green_pct(fastest),
            greenery_pct_recommended=green_pct(recommended),
            noise_reduction_db=round(8 * req.rural, 1) if req.prefs.quiet else 0.0,
        )

    return RouteResponse(mode=req.mode, mock=True, fastest=fastest, recommended=recommended, compare=compare)


def _grid_segment(a: LatLng, b: LatLng, layer: Mode) -> Segment:
    score = _noise(*a, *b, len(layer))
    level = _level(score)
    reasons = (SAFE_REASONS if layer == "safe" else GREEN_REASONS)[level]
    return Segment(coords=[a, b], score=round(score, 2), level=level, reasons=reasons)


def network(layer: Mode) -> NetworkResponse:
    """A fake street grid over Cupertino, coloured by score. Real version: every graph edge + its score."""
    s, w, n, e = BBOX
    rows, cols = 10, 14
    segs: list[Segment] = []
    for i in range(rows + 1):
        lat = s + (n - s) * i / rows
        for j in range(cols):
            a, b = (lat, w + (e - w) * j / cols), (lat, w + (e - w) * (j + 1) / cols)
            segs.append(_grid_segment(a, b, layer))
    for j in range(cols + 1):
        lng = w + (e - w) * j / cols
        for i in range(rows):
            a, b = (s + (n - s) * i / rows, lng), (s + (n - s) * (i + 1) / rows, lng)
            segs.append(_grid_segment(a, b, layer))
    return NetworkResponse(layer=layer, mock=True, segments=segs)
