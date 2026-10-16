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
from pathlib import Path

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
DETOUR_CAP = 1.5  # 加权路线超过最快路线 1.5 倍时，把 d 向 1 推一把重算（防绕路失控）
SAFE_D_TOL = 0.5  # safe 地图的 detour tolerance（可调）

GREEN_FEATURES = ["vegetation", "quiet", "shade"]
SAFE_FEATURES = ["safety"]

# 团队硬性安全要求（论文之外）：这些路永远不进路网
UNSAFE_HIGHWAYS = {"motorway", "trunk", "motorway_link", "trunk_link"}
SAFETY_FLOOR = 0.2  # safety_score 低于此的边：推荐路线按论文 disqualify 处理（α = 10·length），不删边


def _graph_path() -> Path:
    env = os.environ.get("BIKE_GRAPH_PATH")
    if env:
        return Path(env)
    # py/app/bikemap/engine.py -> parents[2] = py/
    data = Path(__file__).resolve().parents[2] / "data"
    baked = data / "cupertino_bike.graphml"  # 4_bake.py 写分数后的图
    return baked if baked.exists() else data / "graph_raw.graphml"  # 还没 bake：分数用默认值


_G = None
_NODE_IDS: list | None = None
_NODE_XS: np.ndarray | None = None
_NODE_YS: np.ndarray | None = None


def _load_graph():
    """启动时加载一次，常驻内存。文件不存在时给明确报错。"""
    global _G
    if _G is None:
        p = _graph_path()
        if not p.exists():
            raise RuntimeError(f"路网文件不存在: {p}，请先运行 cd py && uv run python scripts/1_build_graph.py")
        _G = ox.load_graphml(str(p))
    return _G


def _nearest_node(G, lat: float, lng: float):
    """numpy 暴力最近节点（不用 sklearn；全城几万节点也只要几毫秒）。"""
    global _NODE_IDS, _NODE_XS, _NODE_YS
    if _NODE_IDS is None or len(_NODE_IDS) != G.number_of_nodes():
        _NODE_IDS = list(G.nodes)
        _NODE_XS = np.array([G.nodes[n]["x"] for n in _NODE_IDS])
        _NODE_YS = np.array([G.nodes[n]["y"] for n in _NODE_IDS])
    i = int(np.argmin((_NODE_XS - lng) ** 2 + (_NODE_YS - lat) ** 2))
    return _NODE_IDS[i]


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


def _make_weight(prefs: dict[str, float], d_tol: float, mode: Mode):
    """造一个 Dijkstra 用的代价函数。

    注意 networkx 3.x 的坑：在 MultiDiGraph 上，weight 可调用时收到的 d
    是 {key: 边数据} 字典而不是单条边数据，这里做了防御处理：
    平行边之间取代价最小的那条（等价于先把图压成 DiGraph）。
    """

    def cost(e: dict) -> float:
        length = _num(e, "length") or 0.0
        if scoring.safety_score(e) < SAFETY_FLOOR:
            # 安全底线（safe 和 green 都适用）：几乎不走，但边还在，
            # 所以最快路线照样能走 Lawrence，对比才看得出来；也不会把起终点孤立。
            return DISQUALIFY_MULT * length
        _, v11 = edge_feature_vector(e, mode)
        return preference_weight(v11, prefs, d_tol, length)

    def w(u, v, d):
        if "length" not in d:  # 平行边字典
            return min(cost(e) for e in d.values())
        return cost(d)

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
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


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


def _path_length(Gv, path) -> float:
    return sum(float(next(iter(Gv[u][v].values()))["length"]) for u, v in zip(path[:-1], path[1:]))


def _no_path() -> RuntimeError:
    return RuntimeError("起点和终点之间没有满足安全底线的可行路线")


def _build_route(Gv, path, w, prefs, mode: Mode, primary: str) -> Route:
    """把节点 path 转成 Route：论文余弦分段 + 边几何拼接。"""
    # 1) 逐边收集 (u,v,k,d,vec01,vec11)，平行边按 weight 决胜规则选
    infos = []
    for u, v in zip(path[:-1], path[1:]):
        k = _pick_key(Gv, u, v, w)
        d = Gv[u][v][k]
        vec01, vec11 = edge_feature_vector(d, mode)
        infos.append((u, v, k, d, vec01, vec11))
    total_m = sum(float(infos[i][3].get("length", 0)) for i in range(len(infos)))

    # 2) 论文分段
    seg_idx = _segment_by_similarity(
        [(u, v, k) for (u, v, k, _, _, _) in infos],
        [v11 for (_, _, _, _, _, v11) in infos],
        prefs,
        Gv,
    )

    # 3) 每段拼几何 + 长度加权平均分（论文：segment statistics 取 length 加权平均）
    active = [f for f, p in prefs.items() if abs(p) >= NEUTRAL_EPS] or [primary]
    segments: list[Segment] = []
    full: list[LatLng] = []
    for idxs in seg_idx:
        coords: list[LatLng] = []
        wsum, ssum = 0.0, 0.0
        reasons: list[str] = []
        for i in idxs:
            u, v, k, d, vec01, _ = infos[i]
            c = _edge_coords(Gv, u, v, d)
            coords.extend(c if not coords else c[1:])
            full.extend(c if not full else c[1:])
            ln = float(d.get("length", 0)) or 1.0
            ssum += sum(vec01[f] for f in active) / len(active) * ln
            wsum += ln
            if not reasons:
                reasons = scoring.safety_reasons(d) if mode == "safe" else _green_reasons(d)
        avg = ssum / wsum if wsum else 0.5
        segments.append(Segment(coords=coords, score=round(avg, 2), level=_level(avg), reasons=reasons))

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
    o = _nearest_node(Gv, req.start[0], req.start[1])
    t = _nearest_node(Gv, req.end[0], req.end[1])

    prefs, d_tol = build_preferences(req)
    primary = "safety" if req.mode == "safe" else "vegetation"

    try:
        p_fast = nx.shortest_path(Gv, o, t, weight=_length_weight)
    except nx.NetworkXNoPath:
        raise _no_path()
    fast_len = _path_length(Gv, p_fast)

    w = _make_weight(prefs, d_tol, req.mode)
    try:
        path = nx.shortest_path(Gv, o, t, weight=w)
    except nx.NetworkXNoPath:
        raise _no_path()

    # detour cap：绕太远就把 d 向 1 推（更看重距离）重算，防 rural=1 时绕路失控
    if d_tol < 1.0 and _path_length(Gv, path) > DETOUR_CAP * fast_len:
        w = _make_weight(prefs, min(1.0, d_tol + 0.3), req.mode)
        path = nx.shortest_path(Gv, o, t, weight=w)

    w0 = _make_weight(prefs, 1.0, req.mode)  # d=1 时 weight=length，用于 fastest 的平行边决胜
    fastest = _build_route(Gv, p_fast, w0, prefs, req.mode, primary)
    recommended = _build_route(Gv, path, w, prefs, req.mode, primary)

    extra = round(recommended.duration_min - fastest.duration_min, 1)
    if req.mode == "safe":
        compare = Comparison(
            extra_min=extra,
            risky_segments_fastest=sum(s.level == "bad" for s in fastest.segments),
            risky_segments_recommended=sum(s.level == "bad" for s in recommended.segments),
        )
    else:

        def greenery_pct(r: Route) -> float:
            if not r.segments:
                return 0.0
            return round(100 * sum(s.score for s in r.segments) / len(r.segments), 1)

        compare = Comparison(
            extra_min=extra,
            greenery_pct_fastest=greenery_pct(fastest),
            greenery_pct_recommended=greenery_pct(recommended),
            # noise_reduction_db 等 B 的真实计算，目前诚实留空（前端类型允许 null）
            noise_reduction_db=None,
        )
    return RouteResponse(mode=req.mode, mock=False, fastest=fastest, recommended=recommended, compare=compare)


def network(layer: Mode) -> NetworkResponse:
    """全城底图：所有边按 layer 的主特征着色。mock=False。"""
    G = _load_graph()
    primary = "safety" if layer == "safe" else "vegetation"
    segments = []
    for u, v, k, d in G.edges(keys=True, data=True):
        vec01, _ = edge_feature_vector(d, layer)
        score = max(0.0, min(1.0, vec01[primary]))
        segments.append(
            Segment(
                coords=_edge_coords(G, u, v, d),
                score=round(score, 2),
                level=_level(score),
                reasons=scoring.safety_reasons(d) if layer == "safe" else _green_reasons(d),
            )
        )
    return NetworkResponse(layer=layer, mock=False, segments=segments)
