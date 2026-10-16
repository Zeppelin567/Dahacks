"""Bike map routes. Mounted in app.main; public (no sign-in) through the api at /api/py/bikemap/*."""

from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from . import destinations, engine, street
from .models import (
    DestinationsResponse,
    Mode,
    NetworkResponse,
    Place,
    RouteRequest,
    RouteResponse,
    SearchResult,
    StreetDetail,
)
from .places import PLACES

router = APIRouter(prefix="/bikemap", tags=["bikemap"])


@router.get("/places", response_model=list[Place])
def places() -> list[Place]:
    return PLACES


@router.get("/destinations", response_model=DestinationsResponse)
def nature_destinations() -> DestinationsResponse:
    """Nature-mode pins: live OSM Overpass (5 s budget), else 8 built-in parks."""
    return destinations.nature_destinations()


@router.get("/search", response_model=list[SearchResult])
def search(q: str = Query(min_length=2, max_length=120)) -> list[SearchResult]:
    """Nominatim place search inside the routing area. Call on Enter, not per keystroke."""
    try:
        return destinations.search(q)
    except Exception as exc:  # noqa: BLE001 - network failure; the UI still shows local matches
        raise HTTPException(status_code=502, detail=f"Place search unavailable: {exc}") from exc


@router.get("/street", response_model=StreetDetail)
def street_detail(lat: float, lng: float, mode: Mode) -> StreetDetail:
    """The detail card for the street nearest to a clicked point."""
    detail = street.street_detail(lat, lng, mode)
    if detail is None:
        raise HTTPException(status_code=404, detail="No street within 60 m of that point")
    return detail


@router.get("/photo/{name}")
def photo(name: str) -> FileResponse:
    """A cached Street View photo. Local demo only: the cache is gitignored."""
    p = street.photo_path(name)
    if p is None:
        raise HTTPException(status_code=404, detail="Photo not in the local cache")
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.post("/route", response_model=RouteResponse)
def route(req: RouteRequest) -> RouteResponse:
    """Fastest vs recommended route for one map (safe or green)."""
    return engine.plan_route(req)


@router.get("/network", response_model=NetworkResponse)
def network(layer: Mode) -> NetworkResponse:
    """City-wide coloured segments for the base layer of a map."""
    return engine.network(layer)


def _layers_path() -> Path:
    env = os.environ.get("BIKE_LAYERS_PATH")
    if env:
        return Path(env)
    # py/app/bikemap/__init__.py -> parents[2] = py/
    return Path(__file__).resolve().parents[2] / "data" / "green_layers.json"


@router.get("/green-layers")
def green_layers() -> dict:
    """自然图层：parks/water 多边形 + trees 点，供 Leaflet 画图层开关。

    坐标都是 [lat, lng]。文件不存在（还没跑 1_build_graph.py）时返回空结构，
    前端照常工作，不会崩。
    """
    p = _layers_path()
    if not p.exists():
        return {"parks": [], "water": [], "trees": []}
    return json.loads(p.read_text())
