"""Integrated contracts: weighted votes, scoring guarantees and the expanded graph."""

from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pytest
from pydantic import ValidationError

from app.bikemap import engine
from app.bikemap.models import RouteRequest
from app.bikemap.places import PLACES


def request(mode="green", **kwargs):
    places = {p.id: p for p in PLACES}
    a, b = places["library"], places["main-street"]
    return RouteRequest(start=(a.lat, a.lng), end=(b.lat, b.lng), mode=mode, **kwargs)


def test_override_clamps_and_ignores_unknown_keys():
    prefs, _ = engine.build_preferences(request(pref_override={"vegetation": -99, "quiet": 99, "fake": 4}))
    assert prefs == {"vegetation": -5, "quiet": 5, "shade": 0}
    with pytest.raises(ValidationError):
        request(pref_override={"quiet": float("nan")})


@pytest.mark.parametrize(
    "preferences",
    [
        {"vegetation": -5, "quiet": -1},
        {"vegetation": -1, "quiet": -5},
        {"vegetation": 5, "quiet": -1},
    ],
)
def test_vector_and_scalar_costs_agree_for_votes(monkeypatch, preferences):
    idx = {
        "L": np.array([100.0, 100.0]),
        "S": np.array([0.9, 0.9]),
        "X": np.zeros(2),
        "XR": np.zeros(2),
        "starts": np.arange(2),
        "vegetation": np.array([1.0, 0.0]),
        "quiet": np.array([0.0, 1.0]),
        "shade": np.zeros(2),
    }
    monkeypatch.setattr(engine, "_G", None)
    monkeypatch.setattr(engine, "_crossing", lambda *args: None)
    monkeypatch.setattr(engine.scoring, "safety_score", lambda e: 0.9)
    monkeypatch.setattr(engine, "edge_feature_vector", lambda e, mode: (e["features"], {}))
    vector = engine._pair_costs(idx, preferences, 0.4, "green")
    scalar = engine._make_weight(preferences, 0.4, "green")
    values = [
        scalar(1, 2, {"length": 100, "features": {f: idx[f][i] for f in engine.GREEN_FEATURES}})
        for i in range(2)
    ]
    assert vector == pytest.approx(values)
    if preferences["vegetation"] == -5:
        assert vector[0] < vector[1]
    else:
        assert vector[1] < vector[0]


def test_concurrent_real_routes_keep_safety_and_feature_contracts():
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(engine.plan_route, request(mode)) for mode in ["safe", "green"]]
        for future in futures:
            route = future.result(timeout=60)
            assert route.mock is False
            assert engine._not_worse(route.recommended, route.fastest, route.mode)
            assert route.recommended.segments
            for segment in route.recommended.segments:
                assert segment.features
                assert all(0 <= v <= 1 for v in segment.features.values())
    for r in [0, 0.5, 1]:
        route = engine.plan_route(request(rural=r, pref_override={"vegetation": -2, "quiet": -5}))
        assert engine._not_worse(route.recommended, route.fastest, "green")


def test_eastern_extension_is_routable():
    req = request("safe")
    req.end = (37.303, -121.981)
    route = engine.plan_route(req)
    assert route.recommended.coords[-1][1] > -121.995
    assert route.recommended.distance_m > 0
