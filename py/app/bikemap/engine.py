"""真实路由引擎：复刻 BikeButler 论文方法（CHI'26 §4.3 + 附录 A.1）。

论文核心机制（本文件忠实实现，公式细节见 DELIVERY.md 的"论文映射"一节）：

  偏好向量 preference vector：每个特征 ∈ [-5, +5]，负 = 想要，正 = 避开；
    另有 detour tolerance d ∈ [0, 1]，0 = 无限愿意绕路，1 = 完全不绕。
    UI 映射：green 地图 rural slider r∈[0,1] → vegetation/quiet/shade 的偏好
    = -5·r（按 toggle 开关），d = 1-r；safe 地图固定 safety 偏好 -5，d = 0.5。

  边向量 edge vector：每个特征 ∈ [-1, +1]，负 = 最宜骑，正 = 最不宜骑
    （由 scoring.py 的 0..1 分数经 s11 = 1 - 2·s01 转换）。

  权重（bonus/penalty 框架）：对每个有偏好的特征定义一个 "bonus window"——
    窗口大小随偏好强度变小（越在乎越挑剔），位置随偏好方向；
    边分数落入窗内 → bonus（越接近最优越大）；落到窗外 → penalty。
    论文是硬 disqualify（α = 10·length）；本实现默认用强 penalty 代替
    （STRICT_DISQUALIFY 可切回论文模式，原因见 DELIVERY）。
    无 penalty 时 α = (1-bonuses)·length；
    最终 weight = (1-d)·α + d·length，再用 Dijkstra 求解。

  分段：相邻边向量的余弦相似度（只看有偏好的特征），> 0.5 并段，
    ≤ 0.5 切段；第二遍把 < 20m 的段并入最相似的邻居。

论文是 7 维特征，本实现按 mode 取子集：green → {vegetation, quiet, shade}，
safe → {safety}。返回形状与 models.py 完全一致，前端不用改。
"""

from __future__ import annotations

import math
import os
from functools import wraps
from pathlib import Path
from threading import RLock

import networkx as nx
import numpy as np
import osmnx as ox

from . import scoring
from .models import (
    Comparison,
    LatLng,
    Level,
    Mode,
    NetworkResponse,
    Route,
    RouteRequest,
    RouteResponse,
    Segment,
)

BIKE_KMH = 15.0  # 骑行速度（和原来 mock 一致）

# ---- 论文 §4.3 参数 ----
NEUTRAL_EPS = 0.5  # |偏好| < 0.5 视为 "don't care"，该特征不参与计算
BONUS_MAX = 0.3  # 单个特征的最大 bonus
BONUS_CAP = 0.9  # bonus 总和上限，保证 α > 0
DISQUALIFY_MULT = 10.0  # 论文：任一特征出 bonus window → α = 10·length
STRICT_DISQUALIFY = False  # True = 论文硬模式；False = 出窗按距离加 penalty（demo 友好）
PENALTY_MAX = 2.0  # 软模式下单个特征的最大 penalty 系数
DETOUR_CAP = 1.5  # Safe 路线最多比最快路线长 50%（plan §3）；Green 的上限随 slider 从 1.1 涨到这里
SAFE_D_TOL = 0.5  # safe 地图的 detour tolerance（可调）

GREEN_FEATURES = ["vegetation", "quiet", "shade"]
SAFE_FEATURES = ["safety"]

# 团队硬性安全要求（论文之外）：这些路永远不进路网
UNSAFE_HIGHWAYS = {"motorway", "trunk", "motorway_link", "trunk_link"}
SAFETY_FLOOR = 0.2  # safety_score 低于此的边：推荐路线按论文 disqualify 处理（α = 10·length），不删边

# ---- Routing weights (plan §3 felt distance). The bonus/penalty weight above only spans 0.85x-1.8x
# on the Safe map and is not monotonic on the Green map, so plan_route uses these instead; the paper
# functions stay for segmentation and apply_vote. Measured in routing_check/report.md.
SAFE_LAMBDA = 3.0  # Safe: weight = length * (1 + λ*(1 - s)); s = 1.0 -> 1x, 0.5 -> 2.5x, 0.2 -> 3.4x
CROSS_K = 1000.0  # Safe: + K*(1-j)^2 m entering a busy junction from a smaller street (j=0.2 -> 640 m)
CROSS_POW = 2.0  # 1.0 with K = 200 is the plan's linear "k = 20 m per point"
CROSS_MIN_RANK = 3  # only junctions whose busiest street is tertiary or busier
CLUSTER_M = 35.0  # nodes of one divided-road junction (< 35 m apart) are charged once
JUNCTION_ATTRS = ("junction_safety",)  # node score 0..1 written by 4_bake.py
ALONG_RED_SIGNAL = True  # also charge riding along the busy street through a red signalised / ramp junction
GREEN_ALPHA = 5.0  # Green: weight = length * (1 + r*(α*(1 - g) + β*[s < RED_BELOW])), monotonic in g
GREEN_RED_BETA = 2.0
GREEN_CROSS = 3.0  # Green: + r * this * junction cost, red (< RED_BELOW) junctions only
RED_BELOW = 0.4  # "red" edge = safety < 0.4
GREEN_CAP_MIN = 1.1  # Green detour cap = 1.1 at r=0 ... DETOUR_CAP at r=1
RELAX_STEPS = (1.0, 0.5, 0.25, 0.125)  # weight strength per try; all over the cap -> fastest (always ends)
MARK_M = 12.0  # Safe: a red intersection is drawn as a red piece this far either side of its node
CLASS_RANK = {
    "motorway": 6, "motorway_link": 6, "trunk": 6, "trunk_link": 6, "primary": 5, "primary_link": 5,
    "secondary": 4, "secondary_link": 4, "tertiary": 3, "tertiary_link": 3, "unclassified": 2,
}  # fmt: skip  # everything else (residential, service, cycleway, path ...) = 1


def _graph_path() -> Path:
    env = os.environ.get("BIKE_GRAPH_PATH")
    if env:
        return Path(env)
    # py/app/bikemap/engine.py -> parents[2] = py/
    data = Path(__file__).resolve().parents[2] / "data"
    baked = data / "cupertino_bike.graphml"  # 4_bake.py 写分数后的图
    return baked if baked.exists() else data / "graph_raw.graphml"  # 还没 bake：分数用默认值


_G = None
_INIT_LOCK = RLock()


def _serialized_init(fn):
    @wraps(fn)
    def locked(*args, **kwargs):
        with _INIT_LOCK:
            return fn(*args, **kwargs)

    return locked


# ---- Snapping: where a start / end point may attach to the graph (demo/lmgraph.py rule)
SNAP_HIGHWAYS = {
    "residential", "tertiary", "secondary", "primary", "unclassified", "living_street",
    "cycleway", "path", "pedestrian", "track",
}  # fmt: skip  # public streets and bike paths; not service roads (parking aisles, driveways) or ramps
SNAP_NO_ACCESS = {"private", "no"}


@_serialized_init
def _load_graph():
    """启动时加载一次，常驻内存。文件不存在时给明确报错。"""
    global _G
    if _G is None:
        p = _graph_path()
        if not p.exists():
            raise RuntimeError(
                f"路网文件不存在: {p}，请先运行 cd py && uv run python scripts/1_build_graph.py"
            )
        _G = ox.load_graphml(str(p))
    return _G


def _vals(x) -> list[str]:
    """OSM tag value(s) as a list of strings (osmnx keeps merged ways' tags as lists)."""
    if x is None:
        return []
    return [str(i) for i in x] if isinstance(x, list) else [str(x)]


def _snap_edge_ok(d: dict) -> bool:
    """A public street or bike path a rider can start on: not a service road (parking aisle, driveway),
    not a ramp, freeway or expressway, not private / no-bikes."""
    hw = set(_vals(d.get("highway")))
    if hw & UNSAFE_HIGHWAYS or not hw & SNAP_HIGHWAYS:
        return False
    if any("Expressway" in n or "Freeway" in n for n in _vals(d.get("name"))):
        return False
    return not (set(_vals(d.get("access"))) | set(_vals(d.get("bicycle")))) & SNAP_NO_ACCESS


def _snap_candidates(G, H) -> tuple[list, np.ndarray, np.ndarray]:
    """Nodes a start / end may snap to: in the largest strongly connected piece of the routable view H (so
    there is always a path both ways) and touching at least one _snap_edge_ok edge. Built once with _index."""
    big = max(nx.strongly_connected_components(H), key=len)
    ok = set()
    for u, v, d in G.edges(data=True):
        if (u in big or v in big) and _snap_edge_ok(d):
            ok.update((u, v))
    ids = [n for n in G.nodes if n in big and n in ok]
    return ids, np.array([G.nodes[n]["x"] for n in ids]), np.array([G.nodes[n]["y"] for n in ids])


def _nearest_node(G, lat: float, lng: float):
    """Nearest snap candidate (see _snap_candidates) to (lat, lng), equirectangular metres. A point in a
    parking lot attaches to the street outside instead of the aisle; a point by an isolated stub attaches to
    the main network, so every pair of points has a route. G is kept for callers; the index is the loaded
    graph's."""
    idx = _index(_load_graph())
    ids, xs, ys = idx["snap"]
    kx = math.cos(math.radians(lat))
    i = int(np.argmin(((xs - lng) * kx) ** 2 + (ys - lat) ** 2))
    return ids[i]


def _num(d: dict, key: str) -> float | None:
    """读数值属性；graphml 往返后自定义属性会变字符串，这里统一转 float。"""
    try:
        v = d.get(key)
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- 论文 §4.3
def build_preferences(req: RouteRequest) -> tuple[dict[str, float], float]:
    """UI → 论文的 preference vector [-5,5] + detour tolerance [0,1]。

    green：rural slider r → 各特征偏好 -5·r（toggle 关 = 0 = don't care），
           d = 1-r（r=1 最愿意绕，r=0 时 d=1 精确退化成最快路线）。
    safe：safety 偏好固定 -5（永远想要安全的路），d = 0.5。
    """
    if req.mode == "green":
        r = max(0.0, min(1.0, req.rural))
        p = req.prefs
        prefs = {
            "vegetation": -5.0 * r if p.green else 0.0,
            "quiet": -5.0 * r if p.quiet else 0.0,
            "shade": -5.0 * r if p.shade else 0.0,
        }
        d_tol = 1.0 - r
    else:
        prefs = {"safety": -5.0}
        d_tol = SAFE_D_TOL
    if req.pref_override:
        for feature, value in req.pref_override.items():
            if feature in prefs:
                prefs[feature] = max(-5.0, min(5.0, value))
    return prefs, d_tol


def edge_feature_vector(edge: dict, mode: Mode) -> tuple[dict[str, float], dict[str, float]]:
    """边向量：返回 (vec01, vec11)，vec11 = 1 - 2·vec01 ∈ [-1,1]（论文归一化）。"""
    if mode == "green":
        vec01 = {
            "vegetation": scoring.vegetation_score(edge),
            "quiet": scoring.quiet_score(edge),
            "shade": scoring.shade_score(edge),
        }
    else:
        vec01 = {"safety": scoring.safety_score(edge)}
    vec11 = {f: 1.0 - 2.0 * v for f, v in vec01.items()}
    return vec01, vec11


def preference_weight(vec11: dict[str, float], prefs: dict[str, float], d_tol: float, length: float) -> float:
    """论文的 bonus/penalty 权重（附录 A.1）。

    对每个有偏好的特征：bonus window 以 ideal = p/5 为中心，半宽随偏好强度
    变小（越在乎越挑剔）；落窗内 → bonus（越接近最优越大）；落窗外 →
    论文是硬 disqualify（α=10·length），STRICT_DISQUALIFY=False 时改为按
    距离加 penalty（demo 友好，见 DELIVERY 说明）。
    最终 weight = (1-d)·α + d·length。
    """
    bonuses, penalties = 0.0, 0.0
    for f, p in prefs.items():
        if abs(p) < NEUTRAL_EPS:
            continue  # don't care
        ideal = p / 5.0
        half = max(0.05, 0.6 * (1.0 - abs(p) / 5.0))
        dist = abs(vec11[f] - ideal)
        if dist <= half:
            bonuses += BONUS_MAX * (1.0 - dist / half)
        elif STRICT_DISQUALIFY:
            return DISQUALIFY_MULT * length
        else:
            penalties += PENALTY_MAX * min(1.0, (dist - half) / (2.0 - half))
    bonuses = min(bonuses, BONUS_CAP)
    alpha = max(0.1 * length, (1.0 - bonuses + penalties) * length)
    return (1.0 - d_tol) * alpha + d_tol * length


def safe_factor(s01, strength: float = 1.0):
    """Safe weight / length (felt distance). Monotonic: a safer edge never costs more. Works on arrays."""
    return 1.0 + strength * SAFE_LAMBDA * (1.0 - s01)


def green_factor(g01, r: float, s01, strength: float = 1.0):
    """Green weight / length; g = mean of the enabled toggles (0..1). Monotonic in g for every r, and
    r = 0 gives exactly length (City end of the slider = fastest). Works on arrays."""
    return 1.0 + strength * r * (GREEN_ALPHA * (1.0 - g01) + GREEN_RED_BETA * (s01 < RED_BELOW))


def junction_cost(j01: float) -> float:
    """Metres added for crossing / turning onto a busier street at a junction scored j (0..1)."""
    return CROSS_K * (1.0 - max(0.0, min(1.0, j01))) ** CROSS_POW


def _rank(e: dict) -> int:
    hw = e.get("highway", "")
    if isinstance(hw, list):
        hw = hw[0] if hw else ""
    return CLASS_RANK.get(hw, 1)


def _crossing(u, v, e: dict, idx: dict) -> float | None:
    """Score (0..1) of the junction charged for entering v over edge e, or None. Charged when v's busiest
    street is tertiary or busier and e is a smaller street (crossing it or turning onto it). Riding along
    the busy street pays only at a red signalised or freeway-ramp junction (ALONG_RED_SIGNAL: the photo
    prompt caps those at 3 for dual right turns, slip lanes, dropped bike lanes and ramp ends, which hit
    through riders), once per intersection. Bike paths between quiet streets and the link inside one
    divided-road junction pay nothing."""
    cl = idx.get("cluster") or {}
    c = cl.get(v)
    if c is None or cl.get(u) == c:
        return None
    top, j = idx["ctop"].get(c, 0), idx["cj"].get(c)
    if j is None or top < CROSS_MIN_RANK:
        return None
    if _rank(e) < top:
        return j
    if not (ALONG_RED_SIGNAL and j < RED_BELOW and idx["csig"].get(c)):
        return None
    cu = cl.get(u)
    red_corner = idx["cj"].get(cu, 1.0) < RED_BELOW and idx["csig"].get(cu)
    if red_corner and (_num(e, "length") or 0.0) < CLUSTER_M:
        return None  # short link from another red corner of the same intersection: paid there
    return j


_IDX: dict | None = None


@_serialized_init
def _index(G) -> dict:
    """Built once per graph (first request, ~0.3 s): junction clusters + their crossing cost, and a collapsed
    DiGraph H (one edge per u->v of the motorway-free view) with per-edge float arrays, so a request is
    numpy math + Dijkstra on H instead of parsing graphml strings on every edge relaxation; plus the snap
    candidates (idx["snap"]) that _nearest_node searches."""
    global _IDX
    if _IDX is not None and _IDX["gid"] == id(G):
        return _IDX
    top: dict = {}
    for u, v, d in G.edges(data=True):
        top[u] = max(top.get(u, 0), _rank(d))
        top[v] = max(top.get(v, 0), _rank(d))
    parent = {n: n for n in G.nodes}

    def find(n):
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    for u, v, d in G.edges(data=True):  # a divided road's two carriageways = one junction
        lo = min(top.get(u, 0), top.get(v, 0))
        if (_num(d, "length") or 0.0) < CLUSTER_M and lo >= CROSS_MIN_RANK and _rank(d) < lo:
            parent[find(u)] = find(v)
    cluster = {n: find(n) for n in G.nodes}
    ctop: dict = {}
    cj: dict = {}
    csig: dict = {}  # junction has a signal or a freeway ramp
    for n, nd in G.nodes(data=True):
        c = cluster[n]
        ctop[c] = max(ctop.get(c, 0), top.get(n, 0))
        x = next((x for x in (_num(nd, a) for a in JUNCTION_ATTRS) if x is not None), None)
        if x is not None:
            cj[c] = min(cj.get(c, x), x)  # worst corner of the junction
        if str(nd.get("signal")) == "True" or top.get(n, 0) >= CLASS_RANK["motorway"]:
            csig[c] = True
    idx: dict = {"gid": id(G), "cluster": cluster, "ctop": ctop, "cj": cj, "csig": csig}

    pair_of: dict = {}
    rows = []
    for u, v, _k, d in _safety_floor_view(G).edges(keys=True, data=True):
        p = pair_of.setdefault((u, v), len(pair_of))
        vec01, _ = edge_feature_vector(d, "green")
        rows.append((p, _num(d, "length") or 0.0, scoring.safety_score(d), vec01, _crossing(u, v, d, idx)))
    rows.sort(key=lambda row: row[0])  # parallel edges next to each other for np.minimum.reduceat
    pid = np.array([row[0] for row in rows])
    idx["starts"] = np.flatnonzero(np.r_[True, pid[1:] != pid[:-1]])
    idx["L"] = np.array([row[1] for row in rows])
    idx["S"] = np.array([row[2] for row in rows])
    J = [row[4] for row in rows]  # score of the junction charged on entry, or None
    idx["X"] = np.array([0.0 if j is None else junction_cost(j) for j in J])
    idx["XR"] = np.array([0.0 if j is None or j >= RED_BELOW else junction_cost(j) for j in J])  # Green
    for f in GREEN_FEATURES:
        idx[f] = np.array([row[3][f] for row in rows])
    H = nx.DiGraph()
    H.add_nodes_from(G.nodes)
    min_len = np.minimum.reduceat(idx["L"], idx["starts"]).tolist()
    H.add_edges_from((u, v, {"i": p, "length": min_len[p]}) for (u, v), p in pair_of.items())
    idx["H"] = H
    idx["snap"] = _snap_candidates(G, H)
    _IDX = idx
    return idx


def _pair_costs(idx: dict, prefs: dict[str, float], d_tol: float, mode: Mode, strength: float = 1.0) -> list:
    """Vector form of _make_weight's cost(), min over parallel edges: one cost per H edge (H[u][v]["i"])."""
    L, s = idx["L"], idx["S"]
    if mode == "safe":
        c = L * safe_factor(s, strength) + strength * idx["X"]
    else:
        on = [f for f in GREEN_FEATURES if prefs.get(f, 0.0) != 0.0]
        g = (
            np.average(
                [idx[f] if prefs[f] < 0 else 1.0 - idx[f] for f in on],
                axis=0,
                weights=[abs(prefs[f]) for f in on],
            )
            if on
            else 1.0
        )
        r = max(0.0, min(1.0, 1.0 - d_tol))
        c = L * green_factor(g, r, s, strength) + strength * r * GREEN_CROSS * idx["XR"]
    c = np.where(s < SAFETY_FLOOR, DISQUALIFY_MULT * L, c)
    return np.minimum.reduceat(c, idx["starts"]).tolist()


def _make_weight(prefs: dict[str, float], d_tol: float, mode: Mode, strength: float = 1.0):
    """造一个 Dijkstra 用的代价函数。

    注意 networkx 3.x 的坑：在 MultiDiGraph 上，weight 可调用时收到的 d
    是 {key: 边数据} 字典而不是单条边数据，这里做了防御处理：
    平行边之间取代价最小的那条（等价于先把图压成 DiGraph）。

    Patched: Safe = felt distance + junction crossing cost; Green = monotonic greenness weight + red-edge
    penalty, scaled by the slider r = 1 - d_tol. `strength` < 1 relaxes them for the detour cap. plan_route
    runs Dijkstra on _pair_costs (same formula, vectorised); this one picks parallel edges for drawing.
    """
    idx = _index(_G) if _G is not None else {}
    r = max(0.0, min(1.0, 1.0 - d_tol))
    on = [f for f in GREEN_FEATURES if prefs.get(f, 0.0) != 0.0]  # enabled toggles (p = -5r)

    def cost(e: dict, u, v) -> float:
        length = _num(e, "length") or 0.0
        s = scoring.safety_score(e)
        if s < SAFETY_FLOOR:
            # 安全底线（safe 和 green 都适用）：几乎不走，但边还在，
            # 所以最快路线照样能走 Lawrence，对比才看得出来；也不会把起终点孤立。
            return DISQUALIFY_MULT * length
        j = _crossing(u, v, e, idx)
        jc = 0.0 if j is None else junction_cost(j)
        if mode == "safe":
            return length * safe_factor(s, strength) + strength * jc
        g = 1.0  # no toggle on: only the red-edge / red-junction penalty is left
        if on:
            vec01, _ = edge_feature_vector(e, mode)
            g = sum(abs(prefs[f]) * (vec01[f] if prefs[f] < 0 else 1.0 - vec01[f]) for f in on) / sum(
                abs(prefs[f]) for f in on
            )
        red_jc = jc if j is not None and j < RED_BELOW else 0.0
        return length * green_factor(g, r, s, strength) + strength * r * GREEN_CROSS * red_jc

    def w(u, v, d):
        if "length" not in d:  # 平行边字典
            return min(cost(e, u, v) for e in d.values())
        return cost(d, u, v)

    return w


def _length_weight(u, v, d) -> float:
    """纯距离代价（算最快路线用），同样防御 multigraph。"""
    if "length" not in d:
        return min(float(e["length"]) for e in d.values())
    return float(d["length"])


def _safety_floor_view(G):
    """只删高速路（自行车不能上）。safety<0.2 的边不删，在 _make_weight 里重罚。"""

    def ok(u, v, k):
        hw = G[u][v][k].get("highway", "")
        if isinstance(hw, list):
            hw = hw[0] if hw else ""
        return hw not in UNSAFE_HIGHWAYS

    return nx.subgraph_view(G, filter_edge=ok)


def _cosine(a: list[float], b: list[float]) -> float:
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na < 1e-9 or nb < 1e-9:
        return 1.0
    return sum(x * y for x, y in zip(a, b, strict=False)) / (na * nb)


def _segment_by_similarity(edge_keys, edge_vecs11, prefs, G) -> list[list[int]]:
    """论文 §4.3 的分段：相邻边向量余弦相似度（只看有偏好的特征）>0.5 并段；
    第二遍把 <20m 的段并入余弦最相似的邻居。返回每段的边下标列表。"""
    active = [f for f, p in prefs.items() if abs(p) >= NEUTRAL_EPS]
    if not active or len(edge_keys) <= 1:
        return [list(range(len(edge_keys)))]
    vecs = [[ev[f] for f in active] for ev in edge_vecs11]
    segs: list[list[int]] = []
    cur = [0]
    for i in range(1, len(edge_keys)):
        if _cosine(vecs[i], vecs[i - 1]) > 0.5:
            cur.append(i)
        else:
            segs.append(cur)
            cur = [i]
    segs.append(cur)

    def seg_len(idxs: list[int]) -> float:
        return sum(float(G[u][v][k].get("length", 0)) for (u, v, k) in (edge_keys[i] for i in idxs))

    def seg_mean(idxs: list[int]) -> list[float]:
        n = len(idxs)
        return [sum(vecs[i][j] for i in idxs) / n for j in range(len(active))]

    while True:
        merged = False
        for si, s in enumerate(segs):
            if len(segs) == 1 or not s or seg_len(s) >= 20.0:
                continue
            best, best_sim = None, -2.0
            for ni in (si - 1, si + 1):
                if 0 <= ni < len(segs) and segs[ni]:
                    sim = _cosine(seg_mean(s), seg_mean(segs[ni]))
                    if sim > best_sim:
                        best, best_sim = ni, sim
            if best is not None:
                if best < si:
                    segs[best].extend(s)
                else:
                    segs[best] = s + segs[best]
                segs[si] = []
                merged = True
                break
        segs = [s for s in segs if s]
        if not merged:
            break
    return segs


ROUTE_MIN_SEG_M = 20.0  # route pieces shorter than this join a neighbour (never a Safe red piece)
_LEVEL_RANK = {"bad": 0, "ok": 1, "good": 2}
_LEVEL_BAND = {"bad": (0.0, 0.32), "ok": (0.33, 0.65), "good": (0.66, 1.0)}  # rounded scores per _level


def _segment_by_level(levels: list[Level], lengths: list[float], mode: Mode) -> list[tuple[Level, list[int]]]:
    """Route segments for drawing: runs of consecutive edges with the same display level (_level of the
    edge's own score), so an orange or red stretch is never averaged into a green one (the paper's cosine
    split on the 1-D safety feature only cut where safety crossed 0.5). A run shorter than ROUTE_MIN_SEG_M
    joins the neighbour with the closest level (ties: Safe -> the worse level, Green -> the longer run) and
    keeps that neighbour's level; a Safe red run is never absorbed, however short.
    Returns (level, edge indices) per segment, in route order."""
    runs: list[tuple[Level, list[int]]] = []
    for i, lv in enumerate(levels):
        if runs and runs[-1][0] == lv:
            runs[-1][1].append(i)
        else:
            runs.append((lv, [i]))

    def run_m(r) -> float:
        return sum(lengths[i] for i in r[1])

    keep_red = mode == "safe"
    while len(runs) > 1:
        short = [k for k, r in enumerate(runs) if run_m(r) < ROUTE_MIN_SEG_M]
        short = [k for k in short if not (keep_red and runs[k][0] == "bad")]
        if not short:
            break
        k = min(short, key=lambda k: run_m(runs[k]))
        rank_k = _LEVEL_RANK[runs[k][0]]
        nbrs = [(j, runs[j]) for j in (k - 1, k + 1) if 0 <= j < len(runs)]
        j = min(
            nbrs,
            key=lambda jr: (
                abs(_LEVEL_RANK[jr[1][0]] - rank_k),
                _LEVEL_RANK[jr[1][0]] if keep_red else -run_m(jr[1]),
            ),
        )[0]
        runs[j] = (runs[j][0], sorted(runs[j][1] + runs[k][1]))
        del runs[k]
        merged: list[tuple[Level, list[int]]] = []  # the absorbed run may have split two same-level runs
        for r in runs:
            if merged and merged[-1][0] == r[0]:
                merged[-1] = (r[0], merged[-1][1] + r[1])
            else:
                merged.append(r)
        runs = merged
    return runs


def apply_vote(prefs: dict[str, float], seg_vec11: dict[str, float], like: bool) -> dict[str, float]:
    """论文 §4.3 segment voting：like → 偏好向量加上该段特征分数；
    dislike → 减去；clamp 到 [-5, 5]。给前端点赞/点踩用（D 接）。"""
    out = dict(prefs)
    s = 1.0 if like else -1.0
    for f in out:
        out[f] = max(-5.0, min(5.0, out[f] + s * seg_vec11.get(f, 0.0)))
    return out


# ---------------------------------------------------------------- 几何与输出
def _level(score: float) -> Level:
    return "good" if score >= 0.66 else "ok" if score >= 0.33 else "bad"


def _pick_key(Gv, u, v, w):
    """按和 weight 函数完全一致的决胜规则选平行边，保证几何形状就是 Dijkstra 走的那条。"""
    kd = Gv[u][v]
    return min(kd, key=lambda k: w(u, v, {k: kd[k]}))


def _edge_coords(G, u, v, d) -> list[LatLng]:
    """边的真实几何。osmnx 存的是 (lng, lat)，输出必须翻成 models.py 的 (lat, lng)！"""
    g = d.get("geometry")
    if g is not None:
        pts = list(g.coords)
    else:
        pts = [(G.nodes[u]["x"], G.nodes[u]["y"]), (G.nodes[v]["x"], G.nodes[v]["y"])]
    # geometry 方向可能和 u->v 相反，对齐一下
    ux, uy = G.nodes[u]["x"], G.nodes[u]["y"]
    vx, vy = G.nodes[v]["x"], G.nodes[v]["y"]
    d0 = (pts[0][0] - ux) ** 2 + (pts[0][1] - uy) ** 2
    d1 = (pts[0][0] - vx) ** 2 + (pts[0][1] - vy) ** 2
    if d1 < d0:
        pts = pts[::-1]
    return [(round(lat, 6), round(lng, 6)) for lng, lat in pts]


def _green_reasons(d: dict) -> list[str]:
    out: list[str] = [str(d["green_note"])] if d.get("green_note") else []  # 照片打分的一句话（4_bake.py）
    pd = _num(d, "park_dist_m")
    if pd is not None and 0 <= pd < 50:
        out.append("runs next to a park/green space")
    elif pd is not None and pd < 300:
        out.append(f"about {pd:.0f} m from green space")
    tc = _num(d, "tree_count")
    if tc is not None and tc > 0:
        out.append(f"{int(tc)} street trees within 25 m")
    wd = _num(d, "water_dist_m")
    if wd is not None and 0 <= wd < 200:
        out.append(f"about {wd:.0f} m from water")
    return out or ["typical city street"]


def _path_length(Gv, path, w=_length_weight) -> float:
    """Length of the parallel edges the weight picks = the ones drawn (the old version read the first key)."""
    pairs = zip(path[:-1], path[1:], strict=False)
    return sum(float(Gv[u][v][_pick_key(Gv, u, v, w)]["length"]) for u, v in pairs)


def _risky_spots(Gv, path, w, idx: dict) -> int:
    """Edge-level count: red (< 0.4) street stretches + red intersections passed (once per junction).
    Kept for the measurement harnesses. The panel now counts the red pieces drawn (_risky_count), which
    include the same red intersections as clickable marks (_red_junctions)."""
    cl, cj, ctop = idx["cluster"], idx["cj"], idx["ctop"]

    def corner(n) -> bool:
        return cl.get(n) in cj and ctop.get(cl.get(n), 0) >= CROSS_MIN_RANK

    n_red, in_run, seen = 0, False, set()
    for i, (u, v) in enumerate(zip(path[:-1], path[1:], strict=False)):
        d = Gv[u][v][_pick_key(Gv, u, v, w)]
        # a short link between two corners of one intersection is counted as that junction, not a stretch
        if not ((_num(d, "length") or 0.0) < CLUSTER_M and corner(u) and corner(v)):
            red = scoring.safety_score(d) < RED_BELOW
            n_red += red and not in_run
            in_run = red
        j = next((x for x in (_num(Gv.nodes[v], a) for a in JUNCTION_ATTRS) if x is not None), None)
        if i < len(path) - 2 and j is not None and j < RED_BELOW and cl.get(v) not in seen:
            seen.add(cl.get(v))
            n_red += 1
    return n_red


def _junction_score(nd: dict) -> float | None:
    return next((x for x in (_num(nd, a) for a in JUNCTION_ATTRS) if x is not None), None)


def _red_junctions(Gv, path, idx: dict) -> dict[int, tuple]:
    """Red intersections a Safe route passes: {position in path: (node, score)} for interior nodes with
    junction_safety < RED_BELOW, once per junction cluster (the same spots _risky_spots counts). Each one is
    drawn as a red mark on the route, so every risky spot the panel counts can be seen and clicked."""
    cl, seen, out = idx["cluster"], set(), {}
    for i in range(1, len(path) - 1):
        j = _junction_score(Gv.nodes[path[i]])
        c = cl.get(path[i], path[i])
        if j is not None and j < RED_BELOW and c not in seen:
            seen.add(c)
            out[i] = (path[i], j)
    return out


_JNOTES: dict | None = None


def _junction_notes() -> dict:
    """node -> Claude's photo verdict for that intersection (note, hazards, confidence), read once from the
    scoring outputs (samples.jsonl maps a junction sample to its node). 4_bake.py bakes only the score onto
    the node, so this is where a red mark's popup text comes from. Missing files -> {} (score-only text)."""
    global _JNOTES
    if _JNOTES is None:
        import json

        data, node_of, out = Path(__file__).resolve().parents[2] / "data", {}, {}
        try:
            with open(data / "samples.jsonl", encoding="utf-8") as f:
                for line in f:
                    if '"kind": "junction"' in line:
                        s = json.loads(line)
                        node_of[s["sample_id"]] = s["node"]
            with open(data / "safety_scores.jsonl", encoding="utf-8") as f:
                for line in f:
                    if '"sample_id": "x' not in line[:60]:  # junction samples are "x<node>"
                        continue
                    r = json.loads(line)
                    n = node_of.get(r["sample_id"])
                    # safe-v2 = scripts/score_prompts.SAFE_VERSION, the version 4_bake.py baked
                    if n is not None and r.get("status") == "ok" and r.get("prompt_version") == "safe-v2":
                        out[str(n)] = r["result"]
        except (OSError, ValueError, KeyError):
            out = {}
        _JNOTES = out
    return _JNOTES


def _junction_reasons(n, j: float, nd: dict) -> list[str]:
    src = "street photos" if nd.get("junction_src") == "photo" else "map data"
    out = [f"Risky intersection: scored {round(j * 10)}/10 from {src}"]
    r = _junction_notes().get(str(n))
    if r:
        if r.get("note"):
            out.append(str(r["note"]))
        out += [scoring.HAZARD_TEXT.get(h, h) for h in (r.get("hazards") or [])[:3]]
        if r.get("confidence") == "low":
            out.append("⚠️ uncertain: the street photo was hard to read")
    return out


def _cut(coords: list[LatLng], m: float) -> tuple[list[LatLng], list[LatLng]]:
    """Split a (lat, lng) polyline m metres from its start (_coords_m metric); both halves share the cut."""
    acc = 0.0
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        seg = _coords_m([a, b])
        if seg > 0 and acc + seg >= m:
            f = max(0.0, (m - acc) / seg)
            p = (round(a[0] + f * (b[0] - a[0]), 6), round(a[1] + f * (b[1] - a[1]), 6))
            return _dedup(coords[: i + 1] + [p]), _dedup([p] + coords[i + 1 :])
        acc += seg
    return list(coords), [coords[-1]]


def _dedup(coords: list[LatLng]) -> list[LatLng]:
    out: list[LatLng] = []
    for c in coords:
        if not out or c != out[-1]:
            out.append(c)
    return out


def _risky_count(r: Route) -> int:
    """Safe panel 'Risky segments': the red pieces drawn on the route (red stretches and red intersection
    marks; touching red pieces are one). What the panel counts is exactly what the rider can see and click."""
    return sum(s.level == "bad" for s in r.segments)


def _greenery_pct(r: Route) -> float:
    """Green panel 'Greenery': length-weighted mean segment score (a plain mean let a short grey stub
    outweigh a long green stretch)."""
    if not r.segments:
        return 0.0
    ws = [max(1.0, _coords_m(s.coords)) for s in r.segments]
    return round(100 * sum(s.score * w for s, w in zip(r.segments, ws, strict=True)) / sum(ws), 1)


def _not_worse(rec: Route, fast: Route, mode: Mode) -> bool:
    """The recommended route may never read worse than fastest on its panel's own headline metric."""
    if mode == "safe":
        return _risky_count(rec) <= _risky_count(fast)
    return _greenery_pct(rec) >= _greenery_pct(fast)


def _detour_cap(req: RouteRequest) -> float:
    if req.mode == "safe":
        return DETOUR_CAP
    r = max(0.0, min(1.0, req.rural))
    return GREEN_CAP_MIN + (DETOUR_CAP - GREEN_CAP_MIN) * r


def _coords_m(coords: list[LatLng]) -> float:
    """Approximate length in metres of a (lat, lng) polyline (equirectangular; used as a weight)."""
    return sum(
        111_320.0 * math.hypot(b[0] - a[0], (b[1] - a[1]) * math.cos(math.radians(a[0])))
        for a, b in zip(coords[:-1], coords[1:], strict=False)
    )


def _no_path() -> RuntimeError:
    return RuntimeError("起点和终点之间没有满足安全底线的可行路线")


def _segment_reasons(
    infos: list, idxs: list[int], avg: float, mode: Mode, marks: list | None = None
) -> list[str]:
    """Popup text of one route segment (idxs = the edges it covers). Safe: the worst edge's reasons (lowest
    safety; ties -> a photo-scored edge, then the longest), so the popup names the stress the colour shows;
    a red segment holding red intersection marks lists each intersection first, then its worst red street
    if it has one. Green: the representative edge, the photo-noted edge whose score is closest to the
    segment's mean (no photo note: the longest edge)."""
    if mode == "safe":

        def worst(ks: list[int]) -> int:
            return min(
                ks, key=lambda i: (infos[i][5], not infos[i][3].get("safety_note"), -_seg_len(infos[i]))
            )

        if marks:
            out = [line for m in marks for line in m]
            red = [i for i in idxs if _level(infos[i][5]) == "bad"]
            out += scoring.safety_reasons(infos[worst(red)][3]) if red else []
            return list(dict.fromkeys(out))  # unique lines (the UI keys popup rows by their text)
        return scoring.safety_reasons(infos[worst(idxs)][3])
    noted = [i for i in idxs if infos[i][3].get("green_note")]
    if noted:
        i = min(noted, key=lambda i: (abs(infos[i][5] - avg), -_seg_len(infos[i])))
    else:
        i = max(idxs, key=lambda i: _seg_len(infos[i]))
    return _green_reasons(infos[i][3])


def _seg_len(info) -> float:
    return _num(info[3], "length") or 0.0


def _route_pieces(Gv, path, infos: list, lengths: list[float], marks: dict) -> list[tuple]:
    """Drawable pieces in route order: (coords, length_m, score, level, edge indices, mark reasons or None).
    Without marks each edge is one piece (Green, and Safe routes with no red intersection). A red
    intersection at path[i] becomes its own red piece: the last MARK_M m of edge i-1 + the first MARK_M m of
    edge i (shared out evenly when two marks sit on one short edge); the rest of each edge keeps its level."""
    pieces: list[tuple] = []
    tail: list[LatLng] = []  # the previous edge's last MARK_M m, waiting for the mark it belongs to
    for k, (u, v, _k, d, _vec, score) in enumerate(infos):
        c = _edge_coords(Gv, u, v, d)
        if not marks:
            pieces.append((c, lengths[k], score, _level(score), [k], None))
            continue
        geo = _coords_m(c)
        a = MARK_M if k in marks else 0.0  # path[k] = this edge's start node
        b = MARK_M if k + 1 in marks else 0.0  # path[k + 1] = its end node
        if a + b > geo:
            a, b = (geo / 2, geo / 2) if a and b else (min(a, geo), min(b, geo))
        head, mid = _cut(c, a) if a else ([], c)
        mid, tl = _cut(mid, _coords_m(mid) - b) if b else (mid, [])
        if a:
            n, j = marks[k]
            mc = _dedup(tail + head)
            reasons = _junction_reasons(n, j, Gv.nodes[n])
            pieces.append((mc, _coords_m(mc), min(j, _LEVEL_BAND["bad"][1]), "bad", [k - 1, k], reasons))
        if len(mid) >= 2:
            frac = _coords_m(mid) / geo if (a or b) and geo > 0 else 1.0
            pieces.append((mid, lengths[k] * frac, score, _level(score), [k], None))
        tail = tl
    return pieces


def _build_route(Gv, path, w, prefs, mode: Mode, primary: str) -> Route:
    """把节点 path 转成 Route：按显示等级分段（_segment_by_level）+ 边几何拼接。Safe 路线上的红色路口
    （_red_junctions）画成一小段红色（可点击），所以面板数的每个 risky spot 都看得见。"""
    # 1) 逐边收集 (u,v,k,d,vec01,score)，平行边按 weight 决胜规则选
    #    score = 有偏好特征的均值（没有就用 primary）
    active = [f for f, p in prefs.items() if abs(p) >= NEUTRAL_EPS] or [primary]
    infos = []
    for u, v in zip(path[:-1], path[1:], strict=False):
        k = _pick_key(Gv, u, v, w)
        d = Gv[u][v][k]
        vec01, _ = edge_feature_vector(d, mode)
        infos.append((u, v, k, d, vec01, sum(vec01[f] for f in active) / len(active)))
    lengths = [float(x[3].get("length", 0)) for x in infos]
    total_m = sum(lengths)

    # 2) 分段：显示等级一变就切段（橙 / 红不会被平均进绿段）；Safe 的红路口是单独的红色小段
    marks = _red_junctions(Gv, path, _index(_load_graph())) if mode == "safe" else {}
    pieces = _route_pieces(Gv, path, infos, lengths, marks)
    seg_idx = _segment_by_level([p[3] for p in pieces], [p[1] for p in pieces], mode)

    # 3) 每段拼几何 + 长度加权平均分，夹在本段等级的区间里（score 和 level 永远一致）
    segments: list[Segment] = []
    full: list[LatLng] = [] if infos else [(Gv.nodes[path[0]]["y"], Gv.nodes[path[0]]["x"])]
    for x in infos:
        c = _edge_coords(Gv, x[0], x[1], x[3])
        full.extend(c if not full else c[1:])
    for lv, pidx in seg_idx:
        coords: list[LatLng] = []
        for i in pidx:
            c = pieces[i][0]
            coords.extend(c if not coords else c[1:])
        wts = [pieces[i][1] or 1.0 for i in pidx]
        avg = sum(pieces[i][2] * wt for i, wt in zip(pidx, wts, strict=True)) / sum(wts)
        lo, hi = _LEVEL_BAND[lv]
        score = min(hi, max(lo, round(avg, 2)))
        edges = list(dict.fromkeys(k for i in pidx for k in pieces[i][4]))
        reasons = _segment_reasons(infos, edges, avg, mode, [pieces[i][5] for i in pidx if pieces[i][5]])
        # Attribute each displayed piece by its source-edge length, then combine
        # using the displayed piece length (including split junction pieces).
        totals = {f: 0.0 for f in infos[0][4]} if infos else {}
        for i, wt in zip(pidx, wts, strict=True):
            source_edges = pieces[i][4]
            edge_weights = [lengths[k] or 1.0 for k in source_edges]
            for f in totals:
                value = sum(infos[k][4][f] * ew for k, ew in zip(source_edges, edge_weights, strict=True))
                totals[f] += value / sum(edge_weights) * wt
        features = {f: round(v / sum(wts), 4) for f, v in totals.items()} or None
        segments.append(
            Segment(coords=_dedup(coords), score=score, level=lv, reasons=reasons, features=features)
        )

    return Route(
        coords=full,
        distance_m=round(total_m),
        duration_min=round(total_m / 1000 / BIKE_KMH * 60, 1),
        segments=segments,
    )


def plan_route(req: RouteRequest) -> RouteResponse:
    """算 fastest + recommended 两条路线。mock=False，真路网 + 论文权重。"""
    G = _load_graph()
    Gv = _safety_floor_view(G)
    idx = _index(G)
    H = idx["H"]  # Gv collapsed to one edge per u->v; fastest and recommended both run on it
    o = _nearest_node(Gv, req.start[0], req.start[1])
    t = _nearest_node(Gv, req.end[0], req.end[1])

    prefs, d_tol = build_preferences(req)
    primary = "safety" if req.mode == "safe" else "vegetation"

    try:
        p_fast = nx.shortest_path(H, o, t, weight="length")
    except nx.NetworkXNoPath:
        raise _no_path() from None
    fast_len = _path_length(Gv, p_fast)

    fastest = _build_route(Gv, p_fast, _length_weight, prefs, req.mode, primary)

    # detour cap：full-strength weights first, then relaxed a bounded number of times. A try is kept only if
    # it is within the cap AND not worse than fastest on the panel's own metric (Safe: no more red pieces;
    # Green: no less greenery), so the panel never reads "Risky 0 -> 1" or "greenery 70% -> 60%". If no try
    # passes, recommend the fastest route (always ends; at most len(RELAX_STEPS) Dijkstra runs).
    cap = _detour_cap(req)
    recommended = fastest
    for strength in RELAX_STEPS:
        cp = _pair_costs(idx, prefs, d_tol, req.mode, strength)
        cand = nx.shortest_path(H, o, t, weight=lambda u, v, d, cp=cp: cp[d["i"]])
        wk = _make_weight(prefs, d_tol, req.mode, strength)
        if _path_length(Gv, cand, wk) > cap * fast_len + 1e-6:
            continue
        r = _build_route(Gv, cand, wk, prefs, req.mode, primary)
        if _not_worse(r, fastest, req.mode):
            recommended = r
            break

    extra = round(recommended.duration_min - fastest.duration_min, 1)
    if req.mode == "safe":
        compare = Comparison(
            extra_min=extra,
            risky_segments_fastest=_risky_count(fastest),
            risky_segments_recommended=_risky_count(recommended),
        )
    else:
        compare = Comparison(
            extra_min=extra,
            greenery_pct_fastest=_greenery_pct(fastest),
            greenery_pct_recommended=_greenery_pct(recommended),
            # noise_reduction_db 等 B 的真实计算，目前诚实留空（前端类型允许 null）
            noise_reduction_db=None,
        )
    return RouteResponse(mode=req.mode, mock=False, fastest=fastest, recommended=recommended, compare=compare)


_NETWORK: dict[str, NetworkResponse] = {}


@_serialized_init
def network(layer: Mode) -> NetworkResponse:
    """City-wide base layer, display only: one Segment per homogeneous road section (sections.py).

    Routing never reads this; plan_route keeps the per-edge baked scores. Built once per layer and cached
    (the graph is static while the server runs)."""
    if layer not in _NETWORK:
        from . import sections  # lazy: sections imports engine

        segs = sections.build(_load_graph(), layer)
        _NETWORK[layer] = NetworkResponse(layer=layer, mock=False, segments=segs)
    return _NETWORK[layer]
