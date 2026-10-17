"""Step 4: bake the per-sample scores into the routing graph the API loads.

    cd py && uv run python scripts/4_bake.py

Reads  data/graph_raw.graphml, data/samples.jsonl, data/safety_scores.jsonl, data/green_scores.jsonl
Writes data/cupertino_bike.graphml (engine.py loads it when it exists) + data/cache/reports/bake.json

Per edge (both directions of a two-way street get the same values):
  safety_score  0..1   median photo score / 10, or the road-type rule when the street has no photo
  safety_src    photo | rule
  safety_note, safety_hazards, safety_confidence   from the photo scores (shown when a rider clicks)
  vegetation_vlm 1..5  median greenery_score mapped to the paper's 1-5 scale (scoring.py blends it with OSM)
  shade_vlm     0..1   median shade_sky_pct / 100
  green_note
Per junction node: junction_safety 0..1 (photo score, or the Aggie rule: T 7, 4-way 5.5, +1.5 signal).

Only the current prompt versions count (score_prompts.py), so a prompt bump never mixes old and new scores.
Cheap and safe to rerun: run it again whenever a scoring layer gains rows.
Spec: .plans/scoring-spec.md §11.
"""

from __future__ import annotations

import collections
import json
import os
import statistics
import sys
from pathlib import Path

import osmnx as ox
import score_prompts as sp  # noqa: I001  (sibling module: scripts/ is on sys.path)

DATA = (
    Path(__file__).resolve().parents[1] / os.environ.get("BIKEMAP_DATA", "data")
).resolve()  # data/ext = extended area
REPORTS = DATA / "cache" / "reports"
OVERRIDES = DATA / "overrides.json"

# Fallback for streets without a photo (1-10). Plan §3 "4. Bake".
RULE_BY_HIGHWAY = {
    "cycleway": 9, "path": 9, "footway": 8, "pedestrian": 8, "track": 7,
    "living_street": 8, "residential": 7, "unclassified": 6, "service": 5,
    "tertiary": 5, "tertiary_link": 5, "secondary": 4, "secondary_link": 4,
    "primary": 3, "primary_link": 3, "trunk": 1, "trunk_link": 2,
}  # fmt: skip
RULE_BY_CITY = {"SEPARATED BIKEWAY": 9, "BIKE PATH": 9}
RULE_DEFAULT = 5
CONF_ORDER = {"low": 0, "medium": 1, "high": 2}


def first(v):
    return v[0] if isinstance(v, list) else v


def street_key(u, v, d) -> tuple:
    """Same key as 2_photos.py: one physical street = both directed edges of a two-way road."""
    return (min(u, v), max(u, v), round(float(d["length"]), 1))


def load_scores(path: Path, version: str) -> dict[str, dict]:
    if not path.exists():
        return {}
    rows = (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    return {
        r["sample_id"]: r["result"] for r in rows if r["status"] == "ok" and r["prompt_version"] == version
    }


def summarise(results: list[dict], score_key: str) -> dict:
    """Median score; note and hazards from the sample closest to the median (it explains the score)."""
    med = statistics.median(r[score_key] for r in results)
    rep = min(results, key=lambda r: abs(r[score_key] - med))
    return {"median": med, "rep": rep, "results": results}


def main() -> None:
    graph = DATA / "graph_raw.graphml"
    print(f"1/4 loading {graph.relative_to(DATA.parent)}")
    G = ox.load_graphml(graph)
    samples = [json.loads(line) for line in (DATA / "samples.jsonl").read_text(encoding="utf-8").splitlines()]
    safe = load_scores(DATA / "safety_scores.jsonl", sp.SAFE_VERSION)
    green = load_scores(DATA / "green_scores.jsonl", sp.GREEN_VERSION)
    print(f"2/4 scores: {len(safe)} safety ({sp.SAFE_VERSION}), {len(green)} green ({sp.GREEN_VERSION})")

    edge_safe: dict[tuple, list] = collections.defaultdict(list)
    edge_green: dict[tuple, list] = collections.defaultdict(list)
    junctions: dict = {}
    for s in samples:
        if s["kind"] == "junction":
            if s["sample_id"] in safe:
                junctions[s["node"]] = safe[s["sample_id"]]
            continue
        u, v, k = s["edge"]
        key = street_key(u, v, G.edges[u, v, k])
        if s["sample_id"] in safe:
            edge_safe[key].append(safe[s["sample_id"]])
        if s["sample_id"] in green:
            edge_green[key].append(green[s["sample_id"]])
    safe_sum = {key: summarise(rs, "safety_score") for key, rs in edge_safe.items()}
    green_sum = {key: summarise(rs, "greenery_score") for key, rs in edge_green.items()}

    print("3/4 baking edges and junctions")
    src = collections.Counter()
    for u, v, _k, d in G.edges(keys=True, data=True):
        key = street_key(u, v, d)
        if key in safe_sum:
            ss = safe_sum[key]
            rep = ss["rep"]
            hazards = sorted({h for r in ss["results"] for h in r["hazards"]})
            d["safety_score"] = round(ss["median"] / 10, 3)
            d["safety_src"] = "photo"
            d["safety_note"] = rep["note"]
            d["safety_hazards"] = ",".join(hazards)
            d["safety_confidence"] = min((r["confidence"] for r in ss["results"]), key=CONF_ORDER.get)
        else:
            rule = RULE_BY_CITY.get(
                d.get("city_pathtype"), RULE_BY_HIGHWAY.get(first(d.get("highway")), RULE_DEFAULT)
            )
            d["safety_score"] = rule / 10
            d["safety_src"] = "rule"
        src[d["safety_src"]] += 1
        if key in green_sum:
            gs = green_sum[key]
            d["vegetation_vlm"] = round(1 + 4 * (gs["median"] - 1) / 9, 3)
            d["shade_vlm"] = round(statistics.median(r["shade_sky_pct"] for r in gs["results"]) / 100, 2)
            d["green_note"] = gs["rep"]["note"]
            src["green_photo"] += 1

    # Hand-set scores (DATA/overrides.json, optional). Labelled safety_src="manual" so they never pass
    # for photo scores; the LLM results stay untouched in the score files. Delete the file to undo.
    for o in json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else []:
        keep = {tuple(e) for e in o.get("except_edges", [])}  # [u, v, key]: these keep their own score
        only = {tuple(e) for e in o.get("edges", [])}  # [u, v, key]: these exact edges
        for u, v, k, d in G.edges(keys=True, data=True):
            if (u, v, k) in keep:
                continue
            if (u, v, k) in only or any(s in str(d.get("name") or "") for s in o.get("name_contains", [])):
                src[d["safety_src"]] -= 1
                d["safety_score"], d["safety_src"] = o["safety_score"], "manual"
                d["safety_note"], d["safety_hazards"] = o["note"], ""
                if o.get("photo_sample"):  # the sample whose Street View the detail card shows
                    d["manual_sample"] = o["photo_sample"]
                src["manual"] += 1

    for n, d in G.nodes(data=True):
        if int(d.get("street_count", 0)) < 3:
            continue
        if n in junctions:
            d["junction_safety"] = junctions[n]["safety_score"] / 10
            d["junction_src"] = "photo"
        else:
            base = 7.0 if int(d["street_count"]) == 3 else 5.5
            d["junction_safety"] = min(10.0, base + (1.5 if str(d.get("signal")) == "True" else 0)) / 10
            d["junction_src"] = "rule"
        src[f"junction_{d['junction_src']}"] += 1

    out = DATA / "cupertino_bike.graphml"
    ox.save_graphml(G, out)
    levels = collections.Counter(
        "good" if float(d["safety_score"]) >= 0.66 else "ok" if float(d["safety_score"]) >= 0.33 else "bad"
        for *_, d in G.edges(keys=True, data=True)
    )
    rep = {
        "versions": [sp.SAFE_VERSION, sp.GREEN_VERSION],
        "scored_samples": {"safety": len(safe), "green": len(green)},
        "directed_edges": G.number_of_edges(),
        "sources": dict(src),
        "edge_levels": dict(levels),
        "output": str(out.relative_to(DATA.parent)),
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "bake.json").write_text(json.dumps(rep, indent=1))
    print(f"4/4 saved {out.relative_to(DATA.parent)} ({out.stat().st_size / 1e6:.1f} MB)")
    json.dump(rep, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
