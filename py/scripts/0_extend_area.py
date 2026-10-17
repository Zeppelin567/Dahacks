"""Step 0 (extended area): build a separate data/ext/ that grows the map beyond Cupertino.

    cd py && uv run python scripts/0_extend_area.py

data/ (the original Cupertino map) is only read, never written. On the first run the files the
pipeline needs are copied from data/ to data/ext/; after that data/ext/ is its own copy and is never
overwritten from data/ again. Then the bike network inside data/ext/extra_area.geojson is downloaded
and merged into data/ext/graph_raw.graphml.

Nothing already in the graph changes: its nodes and edges keep their ids, so the copied samples.jsonl
and score files stay valid. Only new edges that reach outside the Cupertino area (boundary + 500 m)
are added; an edge fully inside it is the old download's business, and taking it from a second
download could duplicate a street that the two downloads simplified differently.
Rerunning is safe: an edge already in the graph is skipped.

Then run steps 1-4 against data/ext/ (PowerShell; in bash use `BIKEMAP_DATA=data/ext uv run ...`):
    $env:BIKEMAP_DATA = "data/ext"
    uv run python scripts/1_build_graph.py                   # facts (signals, parks, trees) for the new area
    uv run python scripts/2_photos.py --only-new             # dry run: photos the new area needs
    uv run python scripts/2_photos.py --only-new --fetch
    uv run python scripts/3_score.py --layer safe  --samples data/ext/cache/new_samples.json
    uv run python scripts/3_score.py --layer green --samples data/ext/cache/new_samples.json
    uv run python scripts/4_bake.py
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
from pathlib import Path

PY = Path(__file__).resolve().parents[1]
SRC = PY / "data"
os.environ["BIKEMAP_DATA"] = "data/ext"  # before loading step 1, so its DATA / EXTRA_AREA point at data/ext

import osmnx as ox  # noqa: E402

spec = importlib.util.spec_from_file_location("build_graph", PY / "scripts" / "1_build_graph.py")
b1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b1)  # same OSM tags, cache folder and Overpass mirrors as step 1

DST = b1.DATA
GRAPH = DST / "graph_raw.graphml"
# What steps 1-4 and the app read. green_layers.json and the baked graph are rebuilt by steps 1 and 4.
COPY = [
    "graph_raw.graphml",
    "samples.jsonl",
    "safety_scores.jsonl",
    "green_scores.jsonl",
    "city_bikeways.geojson",
]


def main() -> None:
    b1.configure()
    extra = b1.extra_polygon()
    if extra is None:
        raise SystemExit(f"{b1.EXTRA_AREA.relative_to(PY)} missing: nothing to add")

    print(f"1/5 copying the original data/ files into {DST.relative_to(PY)}/ (only those not there yet)")
    for name in COPY:
        if (SRC / name).exists() and not (DST / name).exists():
            shutil.copy2(SRC / name, DST / name)
            print(f"   copied {name}")

    print(f"2/5 loading {GRAPH.relative_to(PY)}")
    G = ox.load_graphml(GRAPH)
    before = (G.number_of_nodes(), G.number_of_edges())

    print("3/5 Cupertino area (Nominatim) + extra area bike graph (Overpass)")
    old_area = b1.city_polygon()
    G_new = b1.overpass(
        lambda: ox.graph_from_polygon(extra, network_type="bike", simplify=True, retain_all=False)
    )

    print("4/5 merging")
    edges = ox.graph_to_gdfs(G_new, nodes=False)
    old_nodes = set(G.nodes)
    added, seam_nodes = 0, set()
    for (u, v, k), row in edges.iterrows():
        if G.has_edge(u, v, k) or old_area.contains(row.geometry):
            continue
        for n in (u, v):
            if n in old_nodes:
                seam_nodes.add(n)
            elif n not in G:
                G.add_node(n, **G_new.nodes[n])
        G.add_edge(u, v, k, **G_new.edges[u, v, k])
        added += 1
    # A node where a new street meets an old one has more streets now (step 1 reads street_count).
    for n, c in ox.stats.count_streets_per_node(G, nodes=seam_nodes).items():
        G.nodes[n]["street_count"] = c

    print("5/5 saving")
    ox.save_graphml(G, GRAPH)
    print(json.dumps({
        "nodes": [before[0], G.number_of_nodes()],
        "edges": [before[1], G.number_of_edges()],
        "edges_added": added,
        "old_nodes_joined_to_new_streets": len(seam_nodes),
    }, indent=1))  # fmt: skip


if __name__ == "__main__":
    main()
