"""Bike map routes. Mounted in app.main; public (no sign-in) through the api at /api/py/bikemap/*."""

from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter

from . import engine
from .models import Mode, NetworkResponse, Place, RouteRequest, RouteResponse
from .places import PLACES

router = APIRouter(prefix="/bikemap", tags=["bikemap"])


@router.get("/places", response_model=list[Place])
def places() -> list[Place]:
    return PLACES


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

    坐标都是 [lat, lng]。文件不存在（还没跑 build_graph.py）时返回空结构，
    前端照常工作，不会崩。
    """
    p = _layers_path()
    if not p.exists():
        return {"parks": [], "water": [], "trees": []}
    return json.loads(p.read_text())
