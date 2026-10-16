"""构建 Cupertino 自行车路网 + 自然数据（build 时跑一次，落盘，demo 时零网络请求）。

用法（仓库根目录）:
    python py/scripts/build_graph.py

产物（py/data/）:
    cupertino_bike.graphml  路网图（边属性见下）
    place_nodes.json        preset 地点 id -> 最近节点 id（build 时算好，运行时查表）
    green_layers.json       自然图层（公园/水体多边形 + 树点），给 GET /green-layers
    edge_index.json         全部边的 "u_v_k" key 列表，给 A/B 两条管线按 key 输出分数

边属性（graphml 只支持标量，所以只存标量）:
    safety_score   float, 默认 0.5（等 A 的 LLM 分数经 merge_scores.py 写入）
    green_score    float, 默认 0.5
    green_score_src str,  "default" 或 "merged"（B 的精修分数合并后标记为 merged）
    park_dist_m    float, 边到最近公园/绿地的距离（米）；-1 表示该区域无数据
    water_dist_m   float, 边到最近水体的距离（米）；-1 表示无数据
    tree_count     int,   边 25m 缓冲区内的行道树数量
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import osmnx as ox
import pandas as pd
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "py"))

from app.bikemap.places import BBOX, PLACES  # noqa: E402

# places.py 的 BBOX 是 (南, 西, 北, 东)，osmnx 要 (左, 下, 右, 上) = (西, 南, 东, 北)
S, W, N, E = BBOX
OX_BBOX = (W, S, E, N)

OUT_DIR = ROOT / "py" / "data"
UTM = "EPSG:32610"  # Cupertino 所在的 UTM 带，算距离用（单位米）

FEATURE_TAGS = {
    "parks": {"leisure": ["park", "garden", "nature_reserve"]},
    "greens": {"landuse": ["grass", "forest", "meadow"], "natural": ["wood", "scrub"]},
    "water": {"natural": "water"},
    "trees": {"natural": ["tree", "tree_row"]},
}

NO_DATA = -1.0  # 距离类属性的"无数据"哨兵值（scoring.py 遇到它按 0.5 中性值处理）
TREE_BUFFER_M = 25.0  # 统计行道树的缓冲区半径


def _retry(fn, what: str, tries: int = 4, wait_s: int = 15):
    """Overpass 公共 endpoint 会限流/超时，失败就等一会儿重试。"""
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            print(f"  !! {what} 第 {i + 1}/{tries} 次失败: {type(e).__name__}: {e}")
            if i + 1 < tries:
                print(f"  等 {wait_s}s 后重试 ...")
                time.sleep(wait_s)
    raise RuntimeError(f"{what} 重试 {tries} 次仍失败，请检查网络后重新运行")


def fetch_graph(bbox: tuple[float, float, float, float] | None = None):
    """抓自行车路网。graph_from_bbox 默认已经 simplify，不要再调 simplify_graph（会报错）。"""
    bbox = bbox or OX_BBOX
    print("抓路网图 network_type='bike'（自动排除高速）...")
    G = _retry(lambda: ox.graph_from_bbox(bbox, network_type="bike"), "路网下载")
    print(f"  节点 {G.number_of_nodes()} / 边 {G.number_of_edges()}")
    for _, _, _, d in G.edges(keys=True, data=True):
        d.setdefault("safety_score", 0.5)
        d.setdefault("green_score", 0.5)
        d.setdefault("green_score_src", "default")
    return G


def fetch_features(bbox: tuple[float, float, float, float] | None = None):
    """抓四类自然数据。返回 {parks, greens, water, trees} 四个 GeoDataFrame。"""
    bbox = bbox or OX_BBOX
    feats = {}
    for name, tags in FEATURE_TAGS.items():
        print(f"抓 {name} {tags} ...")
        gdf = _retry(lambda: ox.features_from_bbox(bbox, tags), f"{name} 下载")
        print(f"  {name}: {len(gdf)} 条")
        feats[name] = gdf
    return feats


def _clean_geoms(geoms):
    return [g for g in geoms if g is not None and not g.is_empty]


def compute_edge_attributes(G, feats) -> None:
    """算每条边的 park_dist_m / water_dist_m / tree_count（投影坐标系下，单位米）。"""
    print("投影到 EPSG:32610 并建空间索引 ...")
    areas = gpd.GeoDataFrame(
        pd.concat([feats["parks"][["geometry"]], feats["greens"][["geometry"]]], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )
    green_p = areas.to_crs(UTM) if len(areas) else areas
    water_p = feats["water"].to_crs(UTM) if len(feats["water"]) else feats["water"]
    trees_p = feats["trees"].to_crs(UTM) if len(feats["trees"]) else feats["trees"]

    park_geoms = _clean_geoms(green_p.geometry)
    water_geoms = _clean_geoms(water_p.geometry)
    tree_geoms = _clean_geoms(trees_p.geometry)
    park_tree = STRtree(park_geoms) if park_geoms else None
    water_tree = STRtree(water_geoms) if water_geoms else None
    tree_tree = STRtree(tree_geoms) if tree_geoms else None
    print(f"  park/green 多边形 {len(park_geoms)}, 水体 {len(water_geoms)}, 树 {len(tree_geoms)}")

    edges_p = ox.graph_to_gdfs(G, nodes=False).to_crs(UTM)
    n = 0
    for (u, v, k), row in edges_p.iterrows():
        g = row.geometry
        pd_m = g.distance(park_geoms[park_tree.nearest(g)]) if park_tree else NO_DATA
        wd_m = g.distance(water_geoms[water_tree.nearest(g)]) if water_tree else NO_DATA
        tc = len(tree_tree.query(g.buffer(TREE_BUFFER_M))) if tree_tree else 0
        d = G[u][v][k]
        d["park_dist_m"] = float(pd_m)
        d["water_dist_m"] = float(wd_m)
        d["tree_count"] = int(tc)
        n += 1
        if n % 5000 == 0:
            print(f"  已算 {n}/{len(edges_p)} 条边")
    print(f"  完成 {n} 条边")


def _nearest_node(G, lat: float, lng: float):
    """numpy 暴力最近节点（build 时用，不依赖 sklearn）。"""
    nodes = list(G.nodes)
    xs = np.array([G.nodes[n]["x"] for n in nodes])
    ys = np.array([G.nodes[n]["y"] for n in nodes])
    return int(nodes[int(np.argmin((xs - lng) ** 2 + (ys - lat) ** 2))])


def _flip(poly_coords):
    """(lng, lat) -> [lat, lng]（Leaflet / models.py 的顺序）。"""
    return [[round(lat, 6), round(lng, 6)] for lng, lat in poly_coords]


def _polygons_of(gdf) -> list:
    """取多边形外环，转 [lat, lng] 并简化降噪（底图层不需要厘米精度）。"""
    polys = []
    for geom in gdf.geometry:
        if geom is None or geom.is_empty:
            continue
        parts = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        for p in parts:
            if p.geom_type != "Polygon":
                continue
            ring = p.simplify(0.0001, preserve_topology=True).exterior
            coords = _flip(list(ring.coords))
            if len(coords) >= 4:
                polys.append(coords)
    return polys


def _thin_points(pts: list, max_n: int = 30000) -> list:
    if len(pts) <= max_n:
        return pts
    step = math.ceil(len(pts) / max_n)
    print(f"  点太多 ({len(pts)})，均匀抽稀到约 {len(pts) // step} 个")
    return pts[::step]


def write_outputs(G, feats, places, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    gpath = out_dir / "cupertino_bike.graphml"
    ox.save_graphml(G, str(gpath))
    print(f"  写 {gpath}")

    place_nodes = {p.id: _nearest_node(G, p.lat, p.lng) for p in places}
    (out_dir / "place_nodes.json").write_text(json.dumps(place_nodes, indent=1))
    print(f"  写 place_nodes.json（{len(place_nodes)} 个地点）")

    areas = gpd.GeoDataFrame(
        pd.concat([feats["parks"][["geometry"]], feats["greens"][["geometry"]]], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )
    tree_pts = []
    for pt in feats["trees"].geometry:
        if pt is not None and not pt.is_empty and pt.geom_type == "Point":
            x, y = pt.coords[0]
            tree_pts.append([round(y, 6), round(x, 6)])
    layers = {
        "parks": _polygons_of(areas),
        "water": _polygons_of(feats["water"]),
        "trees": _thin_points(tree_pts),
    }
    (out_dir / "green_layers.json").write_text(json.dumps(layers))
    print(
        "  写 green_layers.json "
        f"(parks {len(layers['parks'])}, water {len(layers['water'])}, trees {len(layers['trees'])})"
    )

    keys = [f"{u}_{v}_{k}" for u, v, k in G.edges(keys=True)]
    (out_dir / "edge_index.json").write_text(json.dumps(keys))
    print(f"  写 edge_index.json（{len(keys)} 条边，A/B 按这个 key 输出分数）")


def main() -> None:
    t0 = time.time()
    G = fetch_graph()
    feats = fetch_features()
    compute_edge_attributes(G, feats)
    write_outputs(G, feats, PLACES, OUT_DIR)
    print(f"全部完成，用时 {time.time() - t0:.0f}s。产物在 {OUT_DIR}")
    print("下一步: git add py/data && git commit && git push")


if __name__ == "__main__":
    main()
