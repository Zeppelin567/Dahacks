"""每条边的按特征分数。0..1，1 最好。

配合论文框架（engine.py）：各特征分数在这里算出 0..1，engine 转成
[-1, 1] 的边向量。VLM 精修分数经 merge_scores.py 合并后优先使用。

特征：
  vegetation：照片分（VLM greenery，存成论文的 1-5 量表 vegetation_vlm）占 75%，
      OSM 代理（公园/水体距离、行道树）占 25%。照片 80 m 一张，常常拍不到旁边的
      溪和公园，所以代理分不丢掉。没照片的边只用代理分。
  quiet：highway 路类做噪音代理。
  shade：照片量出来的树冠遮天比例（shade_vlm 0..1）优先；没照片才用行道树密度代理。
  safety：读预计算的 safety_score（等 A 的 LLM 分数），缺省 0.5。
"""

from __future__ import annotations

import math
from typing import Any

Edge = dict[str, Any]


def _num(edge: Edge, key: str) -> float | None:
    try:
        v = edge.get(key)
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def safety_score(edge: Edge) -> float:
    """1 = 很好骑，0 = 危险。读预计算属性；没有（A 还没跑完）就默认 0.5。"""
    v = _num(edge, "safety_score")
    return _clamp(v) if v is not None else 0.5


HAZARD_TEXT = {  # scoring-spec.md §6: rider text for each hazard id
    "door_zone": "Parked cars: watch for opening doors",
    "no_bike_lane": "No bike lane: you share the lane with cars",
    "poor_pavement": "Rough pavement in the riding line",
    "blind_corner": "Blind corner: cross traffic is hard to see",
    "right_turn_slip_lane": "Fast right-turn lane crosses your path",
    "construction": "Construction narrows the road",
    "high_speed_traffic": "Cars pass at 40 mph or more",
    "wide_crossing": "Long crossing: 4 or more lanes",
    "bike_lane_between_turn_lanes": "Bike lane squeezed between turning cars",
    "bike_lane_drops": "Bike lane ends suddenly",
    "freeway_ramp_crossing": "Cars enter or leave the freeway across your path",
    "expressway": "Expressway: very fast, heavy traffic",
    "bike_lane_blocked": "Bike lane often blocked by cars or bins",
    "sharrows_only": "Only bike symbols painted, no real bike lane",
    "frequent_driveways": "Many driveways: watch for turning cars",
    "dual_right_turn": "Two right-turn lanes cross your path",
    "no_median_refuge": "No island to wait on mid-crossing",
}


def safety_reasons(edge: Edge) -> list[str]:
    """What a rider sees on click: Claude's note + hazards (photo-scored), else the map-data reason."""
    note = edge.get("safety_note")
    if note:
        hazards = [h for h in str(edge.get("safety_hazards") or "").split(",") if h]
        out = [str(note)] + [HAZARD_TEXT.get(h, h) for h in hazards[:3]]
        if edge.get("safety_confidence") == "low":
            out.append("⚠️ uncertain: the street photo was hard to read")
        return out
    out = ["No street imagery — scored from map data"]
    hw = edge.get("highway", "")
    if isinstance(hw, list):
        hw = hw[0] if hw else ""
    out.append(
        {
            "cycleway": "dedicated bike path",
            "path": "shared path",
            "track": "track",
            "footway": "footway",
            "residential": "residential street",
            "service": "service road",
            "living_street": "living street",
            "tertiary": "tertiary road",
            "unclassified": "unclassified road",
            "secondary": "secondary road",
            "primary": "primary arterial",
        }.get(hw, hw or "road")
    )
    ms = edge.get("maxspeed", "")
    if isinstance(ms, list):
        ms = ms[0] if ms else ""
    if ms:
        out.append(f"speed limit {ms}")
    return out


VLM_WEIGHT = 0.75  # vegetation 里照片分的权重，其余给 OSM 代理


def vegetation_score(edge: Edge) -> float:
    """植被分 0..1。有照片：0.75·VLM + 0.25·OSM 代理；没照片：只用代理。"""
    proxy = vegetation_proxy(edge)
    v = _num(edge, "vegetation_vlm")
    if v is None:
        return proxy
    vlm = _clamp((v - 1.0) / 4.0)  # 论文 §5：1-5 量表 → 0..1
    return _clamp(VLM_WEIGHT * vlm + (1 - VLM_WEIGHT) * proxy)


def vegetation_proxy(edge: Edge) -> float:
    """OSM 代理：公园距离 0.5 + 树 0.3 + 水 0.2。"""
    total, wsum = 0.0, 0.0
    pd = _num(edge, "park_dist_m")
    total += (math.exp(-pd / 150) if pd is not None and pd >= 0 else 0.5) * 0.5
    wsum += 0.5
    tc = _num(edge, "tree_count")
    total += (min(1.0, tc / 6) if tc is not None else 0.5) * 0.3
    wsum += 0.3
    wd = _num(edge, "water_dist_m")
    total += (math.exp(-wd / 200) if wd is not None and wd >= 0 else 0.5) * 0.2
    wsum += 0.2
    return _clamp(total / wsum)


def quiet_score(edge: Edge) -> float:
    """安静分：路越小越安静（road class 做噪音代理）。"""
    hw = edge.get("highway", "")
    if isinstance(hw, list):
        hw = hw[0] if hw else ""
    return {
        "cycleway": 1.0,
        "path": 1.0,
        "track": 1.0,
        "footway": 1.0,
        "living_street": 1.0,
        "residential": 1.0,
        "service": 1.0,
        "tertiary": 0.7,
        "unclassified": 0.6,
        "secondary": 0.4,
        "primary": 0.2,
    }.get(hw, 0.5)


def shade_score(edge: Edge) -> float:
    """树荫分：照片量的树冠遮天比例优先（OSM 的树点很少），没照片才用行道树密度代理。"""
    sv = _num(edge, "shade_vlm")
    if sv is not None:
        return _clamp(sv)
    tc = _num(edge, "tree_count")
    return _clamp(min(1.0, tc / 10) if tc is not None else 0.5)
