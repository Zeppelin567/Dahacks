import pytest

from app.bikemap import engine
from app.bikemap.models import Route, RouteRequest, Segment
from app.bikemap.places import PLACES


def route(vegetation: float | None, score: float = 0.9) -> Route:
    coords = [(37.3, -122.0), (37.301, -122.0)]
    return Route(
        coords=coords,
        distance_m=111,
        duration_min=0.4,
        segments=[
            Segment(
                coords=coords,
                score=score,
                level="good",
                reasons=[],
                features={"vegetation": vegetation, "quiet": 1.0} if vegetation is not None else None,
            )
        ],
    )


def test_greenery_uses_vegetation_instead_of_blended_colour_score():
    assert engine._greenery_pct(route(0.721, score=0.9)) == 72.1
    assert engine._greenery_pct(route(0.724, score=0.6)) == 72.4
    assert not engine._not_worse(route(0.71, score=0.99), route(0.72, score=0.6), "green")


def test_greenery_is_length_weighted_and_accepts_legacy_segments():
    short = route(0.2)
    long = route(0.8)
    long.segments[0].coords[-1] = (37.303, -122.0)
    short.segments.extend(long.segments)
    assert engine._greenery_pct(short) == pytest.approx(65.0)
    assert engine._greenery_pct(route(None, score=0.72)) == 72.0
    assert engine._greenery_pct(route(0.0)) == 0.0


def test_screenshot_trip_compares_real_greenery_and_never_trades_it_for_quiet():
    places = {p.id: p for p in PLACES}
    start, end = places["infinite-loop"], places["creekside-park"]
    req = RouteRequest(start=(start.lat, start.lng), end=(end.lat, end.lng), mode="green", rural=0.6)
    response = engine.plan_route(req)
    for name in ("fastest", "recommended"):
        value = getattr(response, name)
        weights = [engine._coords_m(s.coords) for s in value.segments]
        expected = round(
            100
            * sum(s.features["vegetation"] * w for s, w in zip(value.segments, weights, strict=True))
            / sum(weights),
            2,
        )
        assert getattr(response.compare, f"greenery_pct_{name}") == expected
    assert response.compare.greenery_pct_recommended >= response.compare.greenery_pct_fastest
