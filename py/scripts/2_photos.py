"""Step 2: sample the graph, check Street View coverage, and fetch the photos (shared by Safe + Green).

    cd py && uv run python scripts/2_photos.py            # dry run: free Metadata API only, no photos
    cd py && uv run python scripts/2_photos.py --fetch    # also download photos, never past the free tier
    cd py && uv run python scripts/2_photos.py --only-new # after 0_extend_area.py: leave scored samples alone

Free by construction:
  - Metadata requests are free and unlimited (Google Maps Platform pricing list, checked 2026-10-16).
  - Photos (Static Street View) are free for the first 10,000 a month. Every photo is recorded in
    data/cache/streetview_usage.json BEFORE it is requested, and fetching stops at PHOTO_CAP for the
    month. Photos are fetched in priority order (TIERS), so if the city doesn't fit, the least useful
    photos are the ones left out, and their samples fall back to the map-data rule in step 4.
Plan: .plans/actualproject.md §3 "2. Photos".
"""

from __future__ import annotations

import argparse
import collections
import json
import math
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import networkx as nx
import osmnx as ox
from pyproj import Transformer

PY = Path(__file__).resolve().parents[1]
DATA = (PY / os.environ.get("BIKEMAP_DATA", "data")).resolve()  # data/ext = extended area
CACHE = DATA / "cache"
META_DIR = CACHE / "metadata"
PHOTO_DIR = CACHE / "streetview"
REPORTS = CACHE / "reports"
USAGE = CACHE / "streetview_usage.json"
SAMPLES = DATA / "samples.jsonl"
NEW_IDS = CACHE / "new_samples.json"
ENV = PY.parent / ".env"

UTM = "EPSG:32610"
SPACING_M = 80
MAX_PANO_DIST_M = 15
FREE_PHOTOS_PER_MONTH = 10_000
PHOTO_CAP = 9_000  # leaves 1,000 of the free tier for anything else on the same Google account
# Photos already used this month before this script existed (key tests on 2026-10-16).
USED_BEFORE_SCRIPT = {"2026-10": 6}
WORKERS = 12

# Streets a Street View car drives. Service roads (parking aisles, driveways), paths, cycleways and
# tracks get no photos: Google rarely covers them, and a nearby road photo would be the wrong street.
PHOTO_HIGHWAYS = {
    "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "trunk", "trunk_link", "residential", "living_street", "unclassified",
}  # fmt: skip
ARTERIAL = {h for h in PHOTO_HIGHWAYS if h.split("_")[0] in ("primary", "secondary", "tertiary", "trunk")}
# Fetch order when the free tier can't cover everything. Lower number = fetched first.
TIERS = {
    ("arterial", "forward"): 1,
    ("arterial", "right"): 2,
    ("arterial", "junction"): 3,
    ("residential", "forward"): 4,
    ("residential", "junction"): 5,
    ("residential", "right"): 6,
}

TO_LATLNG = Transformer.from_crs(UTM, "EPSG:4326", always_xy=True)
_usage_lock = threading.Lock()


def env(name: str) -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        k, _, v = line.partition("=")
        if k.strip() == name and v.strip():
            return v.strip()
    sys.exit(f"{name} missing in {ENV}")


def first(v):
    return v[0] if isinstance(v, list) else v


def bearing(dx: float, dy: float) -> int:
    return round(math.degrees(math.atan2(dx, dy))) % 360


def latlng(x: float, y: float) -> tuple[float, float]:
    lng, lat = TO_LATLNG.transform(x, y)
    return round(lat, 6), round(lng, 6)


def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


# ---------------------------------------------------------------- sampling


def build_samples(G: nx.MultiDiGraph) -> list[dict]:
    edges = ox.graph_to_gdfs(G, nodes=False).to_crs(UTM)
    seen: set = set()
    samples: list[dict] = []
    incident: dict = collections.defaultdict(set)  # node -> photographed streets touching it
    node_arterial: dict = collections.defaultdict(bool)

    for (u, v, k), row in edges.iterrows():
        key = (min(u, v), max(u, v), round(float(row["length"]), 1))
        if key in seen or u == v:
            continue
        seen.add(key)
        hw = first(row["highway"])
        if hw not in PHOTO_HIGHWAYS:
            continue
        cls = "arterial" if hw in ARTERIAL else "residential"
        for n in (u, v):
            incident[n].add(key)
            node_arterial[n] |= cls == "arterial"
        geom, length = row.geometry, row.geometry.length
        count = max(1, round(length / SPACING_M))
        for i in range(count):
            pos = (i + 0.5) * length / count
            p = geom.interpolate(pos)
            a, b = geom.interpolate(max(pos - 5, 0)), geom.interpolate(min(pos + 5, length))
            samples.append({
                "sample_id": f"r{u}_{v}_{k}_{i}", "kind": "road", "edge": [int(u), int(v), int(k)], "i": i,
                "highway": hw, "class": cls, "name": str(first(row.get("name")) or ""),
                "lat_lng": latlng(p.x, p.y), "heading": bearing(b.x - a.x, b.y - a.y),
            })  # fmt: skip

    for n, streets in incident.items():
        if len(streets) >= 3:
            d = G.nodes[n]
            samples.append({
                "sample_id": f"x{n}", "kind": "junction", "node": int(n),
                "class": "arterial" if node_arterial[n] else "residential",
                "signal": bool(d.get("signal")), "lat_lng": (round(d["y"], 6), round(d["x"], 6)),
            })  # fmt: skip
    return samples


# ---------------------------------------------------------------- metadata (free)


def metadata(s: dict, key: str) -> dict:
    path = META_DIR / f"{s['sample_id']}.json"
    if path.exists():
        return json.loads(path.read_text())
    lat, lng = s["lat_lng"]
    q = urllib.parse.urlencode(
        {"location": f"{lat},{lng}", "source": "outdoor", "radius": MAX_PANO_DIST_M, "key": key}
    )
    try:
        url = f"https://maps.googleapis.com/maps/api/streetview/metadata?{q}"
        with urllib.request.urlopen(url, timeout=30) as r:
            m = json.loads(r.read())
    except (urllib.error.URLError, TimeoutError) as e:
        return {"status": f"NETWORK_{type(e).__name__}"}  # not cached: retried on the next run
    if m.get("status") in ("OK", "ZERO_RESULTS"):  # anything else is transient: don't cache it
        path.write_text(json.dumps(m))
    return m


def classify(s: dict, m: dict) -> None:
    st = m.get("status")
    if st == "ZERO_RESULTS":
        s["status"] = "no_imagery"
        return
    if st != "OK":
        s["status"] = f"error:{st}"
        return
    loc = (m["location"]["lat"], m["location"]["lng"])
    s["pano_id"], s["pano_date"] = m["pano_id"], m.get("date")
    s["pano_dist_m"] = round(dist_m(tuple(s["lat_lng"]), loc), 1)
    if s["pano_dist_m"] > MAX_PANO_DIST_M:
        s["status"] = "too_far"
    elif "Google" not in m.get("copyright", ""):
        s["status"] = "third_party"  # user-uploaded photosphere, not the Street View car
    else:
        s["status"] = "ok"


# ---------------------------------------------------------------- photo plan + budget


def photo_requests(s: dict) -> list[tuple[str, int, int]]:
    """(file name, heading, tier) for every photo this sample wants."""
    if s.get("status") != "ok":
        return []
    if s["kind"] == "junction":
        views = [(h, TIERS[(s["class"], "junction")]) for h in (0, 90, 180, 270)]
    else:
        h = s["heading"]
        views = [(h, TIERS[(s["class"], "forward")]), ((h + 90) % 360, TIERS[(s["class"], "right")])]
    # Neighbouring samples often snap to the same pano; round the heading so their photos dedupe.
    return [(f"{s['pano_id']}_{round(h / 10) * 10 % 360}.jpg", round(h / 10) * 10 % 360, t) for h, t in views]


def month() -> str:
    return date.today().strftime("%Y-%m")


def load_usage() -> dict:
    usage = json.loads(USAGE.read_text()) if USAGE.exists() else {}
    for m, n in USED_BEFORE_SCRIPT.items():
        usage[m] = max(usage.get(m, 0), n)
    return usage


def reserve_photo() -> bool:
    """Count a photo against this month's free tier BEFORE requesting it. False = cap reached."""
    with _usage_lock:
        usage = load_usage()
        if usage.get(month(), 0) >= PHOTO_CAP:
            return False
        usage[month()] = usage.get(month(), 0) + 1
        USAGE.write_text(json.dumps(usage, indent=1))
        return True


def fetch_photo(name: str, pano: str, heading: int, key: str) -> str:
    path = PHOTO_DIR / name
    if path.exists():
        return "cached"
    q = urllib.parse.urlencode({"pano": pano, "heading": heading, "fov": 90, "size": "640x640", "key": key})
    url = f"https://maps.googleapis.com/maps/api/streetview?{q}"
    for attempt in range(3):
        if not reserve_photo():  # every attempt counts against the free tier, to be safe
            return "cap"
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                body, ctype = r.read(), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                return f"quota_{e.code}"
            time.sleep(2 * (attempt + 1))  # 5xx: Google-side hiccup, retry
            continue
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (attempt + 1))
            continue
        if not ctype.startswith("image/"):
            return "not_image"
        path.write_bytes(body)
        return "fetched"
    return "failed"


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="download photos (within the free tier)")
    ap.add_argument("--workers", type=int, default=WORKERS, help="parallel photo downloads")
    ap.add_argument("--only-new", action="store_true",
                    help="keep every sample already in data/samples.jsonl as it is (no metadata, no photos); "
                    "check and fetch only the new ones, e.g. after 0_extend_area.py")  # fmt: skip
    args = ap.parse_args()
    key = env("GOOGLE_MAPS_API_KEY")
    for d in (META_DIR, PHOTO_DIR, REPORTS):
        d.mkdir(parents=True, exist_ok=True)

    print("1/4 sampling data/graph_raw.graphml")
    G = ox.load_graphml(DATA / "graph_raw.graphml")
    samples = build_samples(G)
    # --only-new: rows already in samples.jsonl are written back unchanged, so their scores stay valid
    # and their photos (which may live only on the machine that scored them) are not fetched again.
    # Rows an earlier --only-new run added (NEW_IDS) are not "already there": they are checked again,
    # so a later run can fetch their photos or retry a failed metadata request.
    kept: dict[str, dict] = {}
    if args.only_new and SAMPLES.exists():
        added = set(json.loads(NEW_IDS.read_text())) if NEW_IDS.exists() else set()
        rows = (json.loads(line) for line in SAMPLES.read_text(encoding="utf-8").splitlines() if line.strip())
        kept = {
            r["sample_id"]: r
            for r in rows
            if r["sample_id"] not in added and not r.get("status", "").startswith("error")
        }
    check = [s for s in samples if s["sample_id"] not in kept]
    if args.only_new:
        print(f"   {len(kept)} samples kept as they are, {len(check)} new")

    print(f"2/4 Street View metadata for {len(check)} samples (free; cached in data/cache/metadata)")
    with ThreadPoolExecutor(WORKERS) as pool:
        for s, m in zip(check, pool.map(lambda s: metadata(s, key), check), strict=True):
            classify(s, m)

    # One entry per distinct photo, at the best (lowest) tier any sample needs it for. Within a tier,
    # the first sample of every street comes before any street's second one, so when the free tier
    # runs out we lose density evenly instead of whole neighbourhoods.
    wanted: dict[str, dict] = {}
    for s in check:
        for name, heading, tier in photo_requests(s):
            w = wanted.setdefault(name, {"pano": s["pano_id"], "heading": heading, "tier": tier, "order": 99})
            w["tier"], w["order"] = min(w["tier"], tier), min(w["order"], s.get("i", 0))
    on_disk = {n for n in wanted if (PHOTO_DIR / n).exists()}
    remaining = PHOTO_CAP - load_usage().get(month(), 0)
    plan, budget = set(on_disk), remaining
    by_tier = collections.Counter(w["tier"] for w in wanted.values())
    tier_fit = {}
    for t in sorted(by_tier):
        new = sorted((n for n, w in wanted.items() if w["tier"] == t and n not in on_disk),
                     key=lambda n: wanted[n]["order"])  # fmt: skip
        take = new[: max(budget, 0)]
        plan.update(take)
        budget -= len(take)
        cached = sum(n in on_disk for n, w in wanted.items() if w["tier"] == t)
        tier_fit[t] = {"photos": by_tier[t], "included": len(take) + cached}

    fetch_stats: collections.Counter = collections.Counter()
    if args.fetch:
        print(f"3/4 fetching up to {len(plan - on_disk)} photos (cap {PHOTO_CAP}/month, {remaining} left)")

        def get(n):
            return fetch_photo(n, wanted[n]["pano"], wanted[n]["heading"], key)

        # A fresh quota change takes a while to reach every Google server, so a 403 can be
        # temporary: back off and retry a few rounds before giving up for today.
        for rnd in range(5):
            todo = sorted((n for n in plan if not (PHOTO_DIR / n).exists()),
                          key=lambda n: (wanted[n]["tier"], wanted[n]["order"]))  # fmt: skip
            if not todo:
                break
            stop = None
            with ThreadPoolExecutor(args.workers) as pool:
                for i, r in enumerate(pool.map(get, todo), 1):
                    fetch_stats[r] += 1
                    if i % 500 == 0:
                        print(f"   {i}/{len(todo)} {dict(fetch_stats)}")
                    if r.startswith("quota_") or r == "cap":
                        stop = r
                        break
            if stop == "cap" or stop is None:
                break
            print(f"   {stop}: waiting 60 s (round {rnd + 1}/5)")
            time.sleep(60)
        else:
            print("   still blocked by Google's quota; rerun later, it resumes")
    else:
        print("3/4 dry run: no photos fetched (add --fetch)")

    print("4/4 writing data/samples.jsonl + report")
    with SAMPLES.open("w", encoding="utf-8") as f:
        for s in samples:
            if s["sample_id"] in kept:
                f.write(json.dumps(kept.pop(s["sample_id"])) + "\n")
                continue
            names = [n for n, *_ in photo_requests(s)]
            s["photos"] = [n for n in names if (PHOTO_DIR / n).exists()]  # what step 3 can score
            s["photos_missing"] = [n for n in names if not (PHOTO_DIR / n).exists()]
            f.write(json.dumps(s) + "\n")
        for r in kept.values():  # old rows this graph no longer yields: kept so their scores still bake
            f.write(json.dumps(r) + "\n")
    if args.only_new:
        NEW_IDS.write_text(json.dumps([s["sample_id"] for s in check]))
        print(f"   new sample ids -> {NEW_IDS.relative_to(PY)} (pass to 3_score.py --samples)")

    planned_new = len(plan - on_disk)
    write_report(check, wanted, plan, tier_fit, remaining, planned_new, fetch_stats, args.fetch)


def write_report(samples, wanted, plan, tier_fit, remaining, planned_new, fetch_stats, fetched) -> None:
    status = collections.Counter(s["status"] for s in samples)
    by_hw: dict = collections.defaultdict(collections.Counter)
    for s in samples:
        by_hw[s.get("highway", "junction")][s["status"]] += 1
    ok_pct = {h: f"{100 * c['ok'] / c.total():.0f}% of {c.total()}" for h, c in sorted(by_hw.items())}
    years = collections.Counter((s.get("pano_date") or "?")[:4] for s in samples if s["status"] == "ok")
    old = sum(n for y, n in years.items() if y < "2022") / max(sum(years.values()), 1)
    raw = sum(len(photo_requests(s)) for s in samples)
    tier_names = {v: f"{a} {b}" for (a, b), v in TIERS.items()}
    ok = [s for s in samples if s["status"] == "ok" and s["kind"] == "road"]
    checks = [
        {
            "name": s["name"], "highway": s["highway"], "sample": s["lat_lng"], "pano_date": s["pano_date"],
            "street_view": "https://www.google.com/maps/@?api=1&map_action=pano"
            f"&pano={s['pano_id']}&heading={s['heading']}",
        }
        for s in random.Random(7).sample(ok, min(5, len(ok)))
    ]  # fmt: skip
    rep = {
        "samples": dict(collections.Counter(s["kind"] for s in samples)),
        "status": dict(status),
        "ok_by_highway": ok_pct,
        "photos_before_dedupe": raw,
        "photos_after_dedupe": len(wanted),
        "free_tier": {
            "cap_per_month": PHOTO_CAP,
            "left_this_month_at_start": remaining,
            "photos_planned": len(plan),
            "photos_left_out": len(wanted) - len(plan),
        },  # fmt: skip
        "tiers": {tier_names[t]: v for t, v in tier_fit.items()},
        "pano_years": dict(sorted(years.items())),
        "older_than_2022_pct": round(100 * old),
        # Proof of $0: everything planned plus what was already used stays inside the free tier.
        "projected_photos_this_month": PHOTO_CAP - remaining + planned_new,
        "within_free_tier": PHOTO_CAP - remaining + planned_new <= FREE_PHOTOS_PER_MONTH,
        "fetched": dict(fetch_stats) if fetched else "dry run",
        "photos_used_this_month": load_usage().get(month(), 0),
        "spot_check": checks,
    }
    (REPORTS / "photos.json").write_text(json.dumps(rep, indent=1))
    json.dump(rep, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
