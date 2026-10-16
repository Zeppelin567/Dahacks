"""The data contract between the routing engine, the scoring pipelines and the web app.

Everyone codes against these shapes. The mock engine fills them with fake numbers
today; the real engine (osmnx graph + scores) must return exactly the same thing,
so the frontend never has to change when the mock is swapped out.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["safe", "green"]
Level = Literal["good", "ok", "bad"]

LatLng = tuple[float, float]  # (lat, lng)


class Place(BaseModel):
    id: str
    name: str
    lat: float
    lng: float


class GreenPrefs(BaseModel):
    """The three toggles on the Green map. Which kinds of 'rural' the rider cares about."""

    green: bool = True  # parks, trees, water nearby
    quiet: bool = True  # low-speed, low-traffic streets
    shade: bool = False  # tree canopy over the road (hot days)


class RouteRequest(BaseModel):
    start: LatLng
    end: LatLng
    mode: Mode
    rural: float = Field(
        default=0.5,
        ge=0,
        le=1,
        description="Green map only: the City (0) ↔ Rural (1) slider. How much detour the rider accepts.",
    )
    prefs: GreenPrefs = GreenPrefs()


class Segment(BaseModel):
    """One stretch of road, coloured on the map. Click it to see `reasons`."""

    coords: list[LatLng]
    score: float = Field(ge=0, le=1, description="1 = best (safest / greenest), 0 = worst")
    level: Level
    reasons: list[str] = Field(description="Human-readable why, e.g. 'Speed limit 40 mph, no bike lane'")


class Route(BaseModel):
    coords: list[LatLng]
    distance_m: float
    duration_min: float
    segments: list[Segment]


class Comparison(BaseModel):
    extra_min: float = Field(description="recommended − fastest, in minutes")
    # Safe map
    risky_segments_fastest: int | None = None
    risky_segments_recommended: int | None = None
    # Green map
    greenery_pct_fastest: float | None = None
    greenery_pct_recommended: float | None = None
    noise_reduction_db: float | None = None


class RouteResponse(BaseModel):
    mode: Mode
    mock: bool = Field(description="True while the engine is still the placeholder")
    fastest: Route
    recommended: Route
    compare: Comparison


class NetworkResponse(BaseModel):
    """City-wide coloured base layer (Safe map: risk heatmap; Green map: greenery)."""

    layer: Mode
    mock: bool
    segments: list[Segment]
