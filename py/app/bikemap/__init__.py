"""Bike map routes. Mounted in app.main; public (no sign-in) through the api at /api/py/bikemap/*."""

from __future__ import annotations

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
