"""Step 1: the Cupertino bike graph with every map fact the later steps need.

    cd py && uv run python scripts/1_build_graph.py                # reuse graph_raw.graphml, refresh facts
    cd py && uv run python scripts/1_build_graph.py --redownload   # fetch the road network from OSM again

Adds to each edge:
  - City Bikeways PathType (city_pathtype, city_class)
  - green features for the Green route: park_dist_m, water_dist_m (metres, -1 = no data), and
    tree_count (OSM trees within 25 m)
Adds to junction nodes: signal.

Free: OSM (Nominatim + Overpass) and the City of Cupertino GIS server, no keys.

Output:
  - data/graph_raw.graphml
  - data/city_bikeways.geojson
  - data/green_layers.json (park and water polygons + tree points, served at GET /bikemap/green-layers)
  - a check report and PNG in data/cache/reports/

Plan: .plans/actualproject.md §3 "1. Graph".

The road network is downloaded once and then reused. samples.jsonl and the score files point at its edge ids,
so a fresh download (--redownload) can orphan them if OSM changed in between.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.request
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
import pandas as pd
from shapely.strtree import STRtree

# BIKEMAP_DATA picks the data folder, relative to py/: unset = data/ (original), data/ext = extended area.
DATA = (Path(__file__).resolve().parents[1] / os.environ.get("BIKEMAP_DATA", "data")).resolve()
CACHE = DATA / "cache"
REPORTS = CACHE / "reports"
EXTRA_AREA = DATA / "extra_area.geojson"
UTM = "EPSG:32610"  # metres, UTM zone 10N
BUFFER_M = 500
CITY_URL = (
    "https://gis.cupertino.org/cupgis/rest/services/Public/Traffic_Infrastructure/MapServer/8/query"
    "?where=1%3D1&outFields=*&f=geojson"
)
BUILT = {"Active", "Complete"}
JOIN_BUFFER_M = 10
JOIN_MIN_FRACTION = 0.6
SIGNAL_RADIUS_M = 30  # US mappers often tag the signal on each approach, not on the junction node
# Best first: when an edge overlaps several city features, keep the best facility.
PATHTYPE_RANK = [
    "SEPARATED BIKEWAY",
    "BIKE PATH",
    "BUFFERED BIKE LANE",
    "BIKE BLVD",
    "BIKE LANE",
    "BIKE ROUTE",
]
EXTRA_WAY_TAGS = [
    "cycleway", "cycleway:right", "cycleway:left", "cycleway:both",
    "cycleway:right:buffer", "cycleway:left:buffer", "cycleway:both:buffer",
    "turn:lanes", "cycleway:lanes", "maxspeed", "lanes", "surface", "bicycle", "lit",
]  # fmt: skip
OVERPASS = [  # the main server is often at capacity; mirrors serve the same data
    "https://overpass-api.de/api",
    "https://overpass.private.coffee/api",
    "https://overpass.kumi.systems/api",
]
ARTERIALS = {"primary", "secondary", "tertiary"}
GREEN_TAGS = {  # Green route features (from the BikeButler-style engine's original build script)
    "parks": {"leisure": ["park", "garden", "nature_reserve"]},
    "greens": {"landuse": ["grass", "forest", "meadow"], "natural": ["wood", "scrub"]},
    "water": {"natural": "water"},
    "trees": {"natural": ["tree", "tree_row"]},
}
NO_DATA = -1.0  # distance attributes: no feature of that kind in the area (scoring.py treats it as neutral)
TREE_BUFFER_M = 25.0
TEST_TRIP = ((37.3194, -122.0450), (37.3237, -122.0107))  # De Anza College -> Main Street


def configure() -> None:
    ox.settings.useful_tags_way = sorted(set(ox.settings.useful_tags_way) | set(EXTRA_WAY_TAGS))
    ox.settings.cache_folder = str(CACHE / "osmnx")  # osmnx defaults to ./cache in the cwd
    ox.settings.http_user_agent = "dahacks-bikemap/0.1 (DAHacks 5.0 student project)"
    ox.settings.requests_timeout = 300
    ox.settings.log_console = False


def city_polygon():
    city = ox.geocode_to_gdf("Cupertino, California, USA").to_crs(UTM)
    return city.buffer(BUFFER_M).to_crs("EPSG:4326").iloc[0]


def extra_polygon():
    """The area 0_extend_area.py merged in, or None."""
    if not EXTRA_AREA.exists():
        return None
    return gpd.read_file(EXTRA_AREA).geometry.union_all()


def area_polygon():
    """Cupertino + 500 m, plus data/extra_area.geojson when it exists (see 0_extend_area.py)."""
    extra = extra_polygon()
    return city_polygon() if extra is None else city_polygon().union(extra)


def overpass(fetch):
    """Run an osmnx Overpass call with exponential backoff, cycling through the mirrors."""
    wait = 20
    for attempt in range(1, 7):
        for url in OVERPASS:
            ox.settings.overpass_url = url
            try:
                return fetch()
            except Exception as e:  # noqa: BLE001 - any server error means: try the next mirror
                print(f"   {url}: {str(e).splitlines()[0][:90]}")
        print(f"   all busy (round {attempt}); retrying in {wait}s")
        time.sleep(wait)
        wait *= 2
    sys.exit("Overpass unavailable; try again later")


def first(v):
    """osmnx keeps a list when simplification merges ways with different tag values."""
    return v[0] if isinstance(v, list) else v


def fetch_city_bikeways() -> gpd.GeoDataFrame:
    path = DATA / "city_bikeways.geojson"
    if not path.exists():
        req = urllib.request.Request(CITY_URL, headers={"User-Agent": ox.settings.http_user_agent})
        path.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return gpd.read_file(path)


def join_city(G: nx.MultiDiGraph, city: gpd.GeoDataFrame) -> dict:
    """Give each edge the best built city PathType it overlaps by >= 60% of its length."""
    built = city[city["Status"].isin(BUILT)].to_crs(UTM)
    built = built.assign(geometry=built.buffer(JOIN_BUFFER_M))[["PathType", "CLASS", "geometry"]]
    edges = ox.graph_to_gdfs(G, nodes=False)
    # Parking aisles and driveways next to a bikeway are not the bikeway.
    edges = edges[edges["highway"].map(first) != "service"][["geometry"]].to_crs(UTM)
    edges["edge_len"] = edges.length
    pairs = gpd.sjoin(edges.reset_index(), built, predicate="intersects")
    bufs = gpd.GeoSeries(built.geometry.loc[pairs["index_right"]].to_numpy(), index=pairs.index, crs=UTM)
    pairs["frac"] = pairs.geometry.intersection(bufs).length / pairs["edge_len"].clip(lower=0.01)
    pairs = pairs[pairs["frac"] >= JOIN_MIN_FRACTION].copy()
    rank = {p: i for i, p in enumerate(PATHTYPE_RANK)}
    pairs["rank"] = pairs["PathType"].map(lambda p: rank.get(p, len(rank)))
    best = pairs.sort_values("rank").drop_duplicates(["u", "v", "key"])
    for r in best.itertuples():
        d = G.edges[r.u, r.v, r.key]
        d["city_pathtype"], d["city_class"] = r.PathType, r.CLASS
    return {"matched_edges": len(best)}


def mark_signals(G: nx.MultiDiGraph, poly) -> int:
    """signal=True on junction nodes with an OSM traffic_signals node within 30 m."""
    sig = overpass(lambda: ox.features_from_polygon(poly, {"highway": "traffic_signals"}))
    sig = sig[sig.geometry.geom_type == "Point"].to_crs(UTM)
    nodes = ox.graph_to_gdfs(G, edges=False)
    nodes = nodes[nodes["street_count"] >= 3][["geometry"]].to_crs(UTM)
    hit = gpd.sjoin_nearest(nodes, sig[["geometry"]], max_distance=SIGNAL_RADIUS_M, how="inner")
    for n in set(hit.index):
        G.nodes[n]["signal"] = True
    return len(sig)


def add_green_features(G: nx.MultiDiGraph, poly) -> dict:
    """park_dist_m / water_dist_m / tree_count on every edge, in metres. Returns the raw features."""
    feats = {}
    for name, tags in GREEN_TAGS.items():
        try:
            feats[name] = overpass(lambda tags=tags: ox.features_from_polygon(poly, tags))
        except SystemExit:
            raise
        except Exception:  # noqa: BLE001 - osmnx raises when an area has none of a feature
            feats[name] = gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    def geoms(gdf):
        return [g for g in gdf.to_crs(UTM).geometry if g is not None and not g.is_empty] if len(gdf) else []

    areas = gpd.GeoDataFrame(
        pd.concat([feats["parks"][["geometry"]], feats["greens"][["geometry"]]], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )
    parks, water, trees = geoms(areas), geoms(feats["water"]), geoms(feats["trees"])
    park_t, water_t, tree_t = (STRtree(g) if g else None for g in (parks, water, trees))
    for (u, v, k), row in ox.graph_to_gdfs(G, nodes=False).to_crs(UTM).iterrows():
        g, d = row.geometry, G.edges[u, v, k]
        d["park_dist_m"] = float(g.distance(parks[park_t.nearest(g)])) if park_t else NO_DATA
        d["water_dist_m"] = float(g.distance(water[water_t.nearest(g)])) if water_t else NO_DATA
        d["tree_count"] = len(tree_t.query(g.buffer(TREE_BUFFER_M))) if tree_t else 0
    feats["areas"] = areas
    return feats


def write_green_layers(feats: dict) -> dict:
    """Park/water polygons and tree points as [lat, lng] for the map's nature layer."""

    def polygons(gdf) -> list:
        out = []
        for geom in gdf.geometry:
            if geom is None or geom.is_empty:
                continue
            for p in geom.geoms if geom.geom_type == "MultiPolygon" else [geom]:
                if p.geom_type == "Polygon":
                    ring = p.simplify(0.0001, preserve_topology=True).exterior.coords
                    if len(ring) >= 4:
                        out.append([[round(lat, 6), round(lng, 6)] for lng, lat in ring])
        return out

    trees = [
        [round(p.y, 6), round(p.x, 6)]
        for p in feats["trees"].geometry
        if p is not None and not p.is_empty and p.geom_type == "Point"
    ]
    step = max(1, math.ceil(len(trees) / 30_000))
    layers = {"parks": polygons(feats["areas"]), "water": polygons(feats["water"]), "trees": trees[::step]}
    (DATA / "green_layers.json").write_text(json.dumps(layers))
    return {k: len(v) for k, v in layers.items()}


def undirected_edges(G: nx.MultiDiGraph):
    """Each physical street once: a two-way road appears as (u,v) and (v,u) in the directed graph."""
    seen = set()
    for u, v, k, d in G.edges(keys=True, data=True):
        key = (min(u, v), max(u, v), round(d["length"], 1))
        if key not in seen:
            seen.add(key)
            yield u, v, k, d


def nearest_node(G: nx.MultiDiGraph, lat: float, lng: float):
    return min(G.nodes, key=lambda n: (G.nodes[n]["y"] - lat) ** 2 + ((G.nodes[n]["x"] - lng) * 0.795) ** 2)


def report(G: nx.MultiDiGraph, city: gpd.GeoDataFrame, join: dict, osm_signals: int, green: dict) -> dict:
    und = list(undirected_edges(G))
    km = sum(d["length"] for *_, d in und) / 1000
    art = [d for *_, d in und if first(d.get("highway")) in ARTERIALS]
    cov = {t: round(100 * sum(t in d for d in art) / max(len(art), 1)) for t in ("maxspeed", "lanes")}
    cov["cycleway*"] = round(
        100 * sum(any(k.startswith("cycleway") and k != "city_pathtype" for k in d) for d in art) / len(art)
    )

    miles = {}
    for *_, d in und:
        if "city_pathtype" in d:
            miles[d["city_pathtype"]] = miles.get(d["city_pathtype"], 0) + d["length"] / 1609.34
    built = city[city["Status"].isin(BUILT)].to_crs(UTM)
    city_miles = (built.length / 1609.34).groupby(built["PathType"]).sum().round(1).to_dict()

    def name_has(s):
        return [d for *_, d in und if s in str(d.get("name", ""))]

    spot = {
        "McClellan Road pathtypes": sorted({str(d.get("city_pathtype")) for d in name_has("McClellan Road")}),
        "Stevens Creek Boulevard pathtypes": sorted(
            {str(d.get("city_pathtype")) for d in name_has("Stevens Creek Boulevard")}
        ),
        "Lawrence Expressway edges": len(name_has("Lawrence Expressway")),
    }
    scc = max(nx.strongly_connected_components(G), key=len)
    a, b = (nearest_node(G, *p) for p in TEST_TRIP)
    route = nx.shortest_path(G, a, b, weight="length")
    route_km = nx.path_weight(G, route, "length") / 1000
    route_names = []
    for u, v in zip(route, route[1:], strict=False):
        n = str(first(min(G[u][v].values(), key=lambda e: e["length"]).get("name", "?")))
        if not route_names or route_names[-1] != n:
            route_names.append(n)

    return {
        "nodes": G.number_of_nodes(),
        "directed_edges": G.number_of_edges(),
        "streets_undirected": len(und),
        "network_km": round(km, 1),
        "arterial_tag_coverage_pct": cov,
        "city_join": join,
        "city_pathtype_miles_matched": {k: round(v, 1) for k, v in sorted(miles.items())},
        "city_pathtype_miles_built": city_miles,
        "spot_checks": spot,
        "signalised_junctions": sum(bool(G.nodes[n].get("signal")) for n in G.nodes),
        "osm_signal_points": osm_signals,
        "green_layers": green,
        "streets_within_100m_of_park_pct": round(
            100 * sum(0 <= float(d.get("park_dist_m", -1)) < 100 for *_, d in und) / len(und)
        ),
        "streets_with_osm_trees_pct": round(
            100 * sum(int(d.get("tree_count", 0)) > 0 for *_, d in und) / len(und)
        ),
        "largest_strongly_connected_pct": round(100 * len(scc) / G.number_of_nodes(), 1),
        "test_route": {
            "trip": "De Anza College -> Main Street",
            "km": round(route_km, 2),
            "via": route_names,
        },
    }


def plot(G: nx.MultiDiGraph) -> Path:
    colors = {
        "SEPARATED BIKEWAY": "#15803d", "BIKE PATH": "#15803d", "BUFFERED BIKE LANE": "#22c55e",
        "BIKE BLVD": "#0ea5e9", "BIKE LANE": "#2563eb", "BIKE ROUTE": "#f59e0b",
    }  # fmt: skip
    ec = [colors.get(d.get("city_pathtype"), "#d4d4d8") for *_, d in G.edges(keys=True, data=True)]
    lw = [1.6 if d.get("city_pathtype") else 0.4 for *_, d in G.edges(keys=True, data=True)]
    out = REPORTS / "graph_pathtype.png"
    ox.plot_graph(G, node_size=0, edge_color=ec, edge_linewidth=lw, bgcolor="white", figsize=(14, 10),
                  show=False, close=True, save=True, filepath=str(out), dpi=150)  # fmt: skip
    return out


def main() -> None:
    configure()
    REPORTS.mkdir(parents=True, exist_ok=True)
    ap = argparse.ArgumentParser()
    ap.add_argument("--redownload", action="store_true", help="fetch the road network from OSM again")
    args = ap.parse_args()
    out = DATA / "graph_raw.graphml"
    print("1/5 area: Cupertino boundary + 500 m (Nominatim), plus extra_area.geojson if present")
    poly = area_polygon()
    if out.exists() and not args.redownload:
        print(f"2/5 reusing {out.relative_to(DATA.parent)} (edge ids stay stable for samples.jsonl)")
        G = ox.load_graphml(out)
    else:
        print("2/5 bike graph (Overpass; first run takes a minute)")
        G = overpass(
            lambda: ox.graph_from_polygon(poly, network_type="bike", simplify=True, retain_all=False)
        )
    print("3/5 City Bikeways join + traffic signals")
    city = fetch_city_bikeways()
    join = join_city(G, city)
    osm_signals = mark_signals(G, poly)
    print("4/5 green features: parks, water, trees (Overpass)")
    green = write_green_layers(add_green_features(G, poly))
    ox.save_graphml(G, out)
    print(f"5/5 saved {out.relative_to(DATA.parent)} ({out.stat().st_size / 1e6:.1f} MB); writing report")
    rep = report(G, city, join, osm_signals, green)
    rep["plot"] = str(plot(G).relative_to(DATA.parent))
    (REPORTS / "build_graph.json").write_text(json.dumps(rep, indent=1))
    json.dump(rep, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
