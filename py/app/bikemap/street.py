"""The detail card behind a street click: nearest street, its score, Claude's note, chips and photo.

The photo is the representative sample that 4_bake.py took the street's note from, so the
picture and the sentence under it always match. Photos come from the local Street View cache
(gitignored; Google's images must not go into the public repo), so they only show in a local demo.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np

from . import engine, scoring
from .models import LatLng, Mode, Photo, StreetDetail

DATA = Path(__file__).resolve().parents[2] / "data"
PHOTO_DIR = DATA / "cache" / "streetview"
PHOTO_NAME = re.compile(r"^[A-Za-z0-9_-]{5,100}_\d{1,3}\.jpg$")
MAX_CLICK_DIST_M = 60.0

ROAD_TEXT = {
    "cycleway": "bike path",
    "path": "shared path",
    "track": "track",
    "footway": "footway",
    "pedestrian": "pedestrian street",
    "living_street": "living street",
    "residential": "residential street",
    "service": "service road",
    "unclassified": "minor road",
    "tertiary": "collector road",
    "secondary": "secondary road",
    "primary": "primary arterial",
}


def _first(v):
    return (v[0] if v else "") if isinstance(v, list) else (v or "")


class _Index:
    """Every street as straight pieces in local metres, for a brute-force nearest-street lookup."""

    def __init__(self, G):
        self.lat0, self.lng0 = 37.318, -122.04
        self.kx = 111_320 * math.cos(math.radians(self.lat0))
        self.ky = 110_540
        seen: set[tuple] = set()
        self.edges: list[tuple] = []
        ax, ay, bx, by, owner = [], [], [], [], []
        for u, v, k, d in G.edges(keys=True, data=True):
            key = (min(u, v), max(u, v), round(float(d.get("length", 0)), 1))
            if key in seen:
                continue
            seen.add(key)
            coords = engine._edge_coords(G, u, v, d)
            j = len(self.edges)
            self.edges.append((u, v, k, coords))
            for (la1, ln1), (la2, ln2) in zip(coords[:-1], coords[1:], strict=True):
                x1, y1 = self._xy(la1, ln1)
                x2, y2 = self._xy(la2, ln2)
                ax.append(x1)
                ay.append(y1)
                bx.append(x2)
                by.append(y2)
                owner.append(j)
        self.ax, self.ay = np.array(ax), np.array(ay)
        self.bx, self.by = np.array(bx), np.array(by)
        self.owner = np.array(owner)

    def _xy(self, lat: float, lng: float) -> tuple[float, float]:
        return (lng - self.lng0) * self.kx, (lat - self.lat0) * self.ky

    def nearest(self, lat: float, lng: float) -> tuple[int, float]:
        px, py = self._xy(lat, lng)
        dx, dy = self.bx - self.ax, self.by - self.ay
        len2 = np.maximum(dx * dx + dy * dy, 1e-9)
        t = np.clip(((px - self.ax) * dx + (py - self.ay) * dy) / len2, 0, 1)
        dist = np.hypot(self.ax + t * dx - px, self.ay + t * dy - py)
        i = int(np.argmin(dist))
        return int(self.owner[i]), float(dist[i])


_index: _Index | None = None
_samples: dict[tuple, list[dict]] | None = None
_notes: dict[str, dict[str, str]] | None = None  # layer -> sample_id -> note


def _get_index() -> _Index:
    global _index
    if _index is None:
        _index = _Index(engine._load_graph())
    return _index


def _get_samples() -> dict[tuple, list[dict]]:
    """Road samples grouped by physical street (both directions share them, as in 2_photos.py)."""
    global _samples
    if _samples is None:
        _samples = {}
        p = DATA / "samples.jsonl"
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                s = json.loads(line)
                if s.get("kind") == "road" and s.get("status") == "ok" and s.get("photos"):
                    u, v, _ = s["edge"]
                    _samples.setdefault((min(u, v), max(u, v)), []).append(s)
    return _samples


def _get_notes() -> dict[str, dict[str, str]]:
    global _notes
    if _notes is None:
        _notes = {"safe": {}, "green": {}}
        for layer, name in (("safe", "safety_scores.jsonl"), ("green", "green_scores.jsonl")):
            p = DATA / name
            if not p.exists():
                continue
            for line in p.read_text(encoding="utf-8").splitlines():
                r = json.loads(line)
                if r.get("status") == "ok":
                    _notes[layer][r["sample_id"]] = r["result"].get("note", "")
    return _notes


def _pick_sample(u, v, note: str | None, layer: Mode, lat: float, lng: float) -> dict | None:
    samples = _get_samples().get((min(u, v), max(u, v)), [])
    if not samples:
        return None
    notes = _get_notes()[layer]
    if note:
        for s in samples:
            if notes.get(s["sample_id"]) == note:
                return s
    scored = [s for s in samples if s["sample_id"] in notes] or samples
    return min(scored, key=lambda s: (s["lat_lng"][0] - lat) ** 2 + (s["lat_lng"][1] - lng) ** 2)


def _streetview_url(pano: str | None, heading: int | None, at: LatLng) -> str:
    if pano:
        return f"https://www.google.com/maps/@?api=1&map_action=pano&pano={pano}&heading={heading or 0}"
    return f"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={at[0]},{at[1]}"


def _safe_chips(d: dict) -> list[str]:
    chips: list[str] = []
    if d.get("safety_note"):
        hazards = [h for h in str(d.get("safety_hazards") or "").split(",") if h]
        chips += [scoring.HAZARD_TEXT.get(h, h.replace("_", " ")) for h in hazards[:4]]
        if d.get("safety_confidence") == "low":
            chips.append("Uncertain: the street photo was hard to read")
    ms = _first(d.get("maxspeed"))
    if ms:
        chips.append(f"Speed limit {ms}")
    if d.get("city_pathtype"):
        chips.append(f"City bikeway: {str(d['city_pathtype']).capitalize()}")
    return chips


def _green_chips(d: dict) -> list[str]:
    chips = [r for r in engine._green_reasons(d) if r != d.get("green_note") and r != "typical city street"]
    chips = [c[0].upper() + c[1:] for c in chips]
    shade = engine._num(d, "shade_vlm")
    if shade is not None and shade > 0:
        chips.append(f"Trees shade about {round(shade * 100)}% of the sky")
    q = scoring.quiet_score(d)
    chips.append("Quiet street" if q >= 0.9 else "Busy road" if q <= 0.4 else "Moderate traffic")
    return chips


def street_detail(lat: float, lng: float, mode: Mode) -> StreetDetail | None:
    """None when the click is more than 60 m from any street."""
    G = engine._load_graph()
    idx = _get_index()
    j, dist = idx.nearest(lat, lng)
    if dist > MAX_CLICK_DIST_M:
        return None
    u, v, k, coords = idx.edges[j]
    d = G[u][v][k]

    vec01, _ = engine.edge_feature_vector(d, mode)
    score = vec01["safety" if mode == "safe" else "vegetation"]
    if mode == "safe":
        from_photo = d.get("safety_src") == "photo"
        note = d.get("safety_note") if from_photo else None
        chips = _safe_chips(d)
    else:
        from_photo = engine._num(d, "vegetation_vlm") is not None
        note = d.get("green_note") if from_photo else None
        chips = _green_chips(d)

    photo = None
    pano = heading = None
    if from_photo:
        s = _pick_sample(u, v, note, mode, lat, lng)
        if s:
            pano, heading = s["pano_id"], int(s["heading"])
            name = s["photos"][0]
            if PHOTO_NAME.match(name) and (PHOTO_DIR / name).exists():
                url = f"/api/py/bikemap/photo/{name}"
                photo = Photo(url=url, pano_id=pano, heading=heading, date=s.get("pano_date"))

    hw = _first(d.get("highway"))
    return StreetDetail(
        mode=mode,
        name=str(_first(d.get("name")) or "Unnamed street"),
        road=ROAD_TEXT.get(hw, hw.replace("_", " ") or "road"),
        score10=round(max(1.0, min(10.0, score * 10)), 1),
        level=engine._level(score),
        source="photo" if from_photo else "map",
        note=str(note) if note else None,
        chips=chips,
        photo=photo,
        streetview_url=_streetview_url(pano, heading, (lat, lng)),
        coords=coords,
    )


def photo_path(name: str) -> Path | None:
    if not PHOTO_NAME.match(name):
        return None
    p = PHOTO_DIR / name
    return p if p.is_file() else None
