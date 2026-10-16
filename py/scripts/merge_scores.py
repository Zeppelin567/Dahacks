"""把 A/B 两条管线输出的 {"u_v_k": score} JSON 合并进 graphml 边属性。

key 列表见 py/data/edge_index.json（build_graph.py 生成），A/B 照着它输出。

论文映射：VLM 的 vegetation 用 1-5 量表（论文 §5），以原值存入
vegetation_vlm，scoring.vegetation_score 会归一化；safety 用 0..1。

用法:
    python py/scripts/merge_scores.py --graph py/data/cupertino_bike.graphml \
        --feature safety --scores scores_safety.json
    python py/scripts/merge_scores.py --graph py/data/cupertino_bike.graphml \
        --feature vegetation --scores veg_vlm.json
    # --feature vegetation 的 JSON 值应为 1-5；--feature safety 的值为 0..1
    # 旧版 --safety/--green 参数仍可用（--green 现映射为 vegetation 代理分 0..1）

    --out     不填则覆盖原文件
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import osmnx as ox

# feature -> (边属性名, 值是否为 1-5 量表)
FEATURE_ATTRS = {
    "safety": ("safety_score", False),
    "vegetation": ("vegetation_vlm", True),
}


def _keymap(G) -> dict[str, tuple]:
    """从图本身建 key 映射，节点 id 不管是什么类型都能对上。"""
    return {f"{u}_{v}_{k}": (u, v, k) for u, v, k in G.edges(keys=True)}


def apply_scores(
    G, score_map: dict, attr: str, *, one_to_five: bool = False, mark_merged: bool = False
) -> tuple[int, int, int]:
    """返回 (写入条数, key不存在条数, 数值非法条数)。

    one_to_five=True 时值按 1-5 量表 clamp（VLM vegetation）；否则按 0..1。
    """
    keymap = _keymap(G)
    ok = missing = bad = 0
    lo, hi = (1.0, 5.0) if one_to_five else (0.0, 1.0)
    for key, val in score_map.items():
        uvk = keymap.get(key)
        if uvk is None:
            missing += 1
            continue
        try:
            score = float(val)
        except (TypeError, ValueError):
            bad += 1
            continue
        # 注意：不要用 v 做循环变量名，会和节点 id 冲突（曾经的 bug）
        u, vv, k = uvk
        G[u][vv][k][attr] = min(hi, max(lo, score))
        if mark_merged:
            G[u][vv][k][attr + "_src"] = "merged"
        ok += 1
    return ok, missing, bad


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="合并 A/B 的边分数 JSON 进 graphml")
    ap.add_argument("--graph", required=True, help="输入 graphml 路径")
    ap.add_argument(
        "--feature",
        choices=["safety", "vegetation"],
        default=None,
        help="safety: 0..1 → safety_score；vegetation: 1-5 → vegetation_vlm",
    )
    ap.add_argument("--scores", default=None, help="分数 JSON 路径（配合 --feature）")
    ap.add_argument("--safety", default=None, help="[旧版兼容] A 的输出: {u_v_k: 0..1}")
    ap.add_argument("--green", default=None, help="[旧版兼容] B 的输出: {u_v_k: 0..1} → green_score")
    ap.add_argument("--out", default=None, help="输出路径，不填则覆盖输入文件")
    args = ap.parse_args(argv)

    G = ox.load_graphml(args.graph)
    print(f"载入 {args.graph}: {G.number_of_edges()} 条边")

    if args.feature and args.scores:
        attr, one_to_five = FEATURE_ATTRS[args.feature]
        m = json.loads(Path(args.scores).read_text())
        ok, missing, bad = apply_scores(G, m, attr, one_to_five=one_to_five, mark_merged=True)
        scale = "1-5" if one_to_five else "0..1"
        print(f"{args.feature}({scale}): 写入 {ok} 条，key 不存在 {missing}，数值非法 {bad}（已标记 merged）")
    if args.safety:  # 旧版兼容
        m = json.loads(Path(args.safety).read_text())
        ok, missing, bad = apply_scores(G, m, "safety_score")
        print(f"safety: 写入 {ok} 条，key 不存在 {missing}，数值非法 {bad}")
    if args.green:  # 旧版兼容
        m = json.loads(Path(args.green).read_text())
        ok, missing, bad = apply_scores(G, m, "green_score", mark_merged=True)
        print(f"green: 写入 {ok} 条，key 不存在 {missing}，数值非法 {bad}（已标记 merged）")

    out = args.out or args.graph
    ox.save_graphml(G, out)
    print(f"已保存 {out}，记得 git commit + push 让全队同步")


if __name__ == "__main__":
    main()
