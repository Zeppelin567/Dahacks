"""每条边的按特征分数。0..1，1 最好。

配合论文框架（engine.py）：各特征分数在这里算出 0..1，engine 转成
[-1, 1] 的边向量。VLM 精修分数经 merge_scores.py 合并后优先使用。

特征：
  vegetation（1-5 量表，论文 §5 用 1-5）：朋友管线的 VLM 分数优先，
      否则用 OSM 代理（公园距离/树/水）。
  quiet：highway 路类做噪音代理。
  shade：行道树密度做树荫代理（真树荫需太阳位置×树高，诚实标注）。
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


def safety_reasons(edge: Edge) -> list[str]:
    """从 highway / maxspeed 生成人类可读文案（真实值，无 MOCK）。"""
    out: list[str] = []
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


def vegetation_score(edge: Edge) -> float:
    """植被分 0..1。VLM 精修（1-5 量表）优先，否则 OSM 代理公式。"""
    v = _num(edge, "vegetation_vlm")
    if v is not None:
        return _clamp((v - 1.0) / 4.0)  # 论文 §5：1-5 量表 → 0..1
    # OSM 代理：公园距离 0.5 + 树 0.3 + 水 0.2
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
    """树荫分：行道树密度做代理（真树荫需太阳位置×树高，v0 诚实标注为代理值）。"""
    tc = _num(edge, "tree_count")
    return _clamp(min(1.0, tc / 10) if tc is not None else 0.5)
