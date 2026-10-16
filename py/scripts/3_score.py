"""Step 3: score the Street View photos with Claude, one layer at a time.

    cd py && uv run python scripts/3_score.py --layer safe --samples data/bakeoff.json   # the 20-spot test
    cd py && uv run python scripts/3_score.py --layer green --samples data/bakeoff.json
    cd py && uv run python scripts/3_score.py --layer safe                               # the whole city

Spec: .plans/scoring-spec.md (prompts and schemas live in score_prompts.py).
Output: data/{safety,green}_scores.jsonl, one line per sample. Raw replies go to data/cache/llm/{layer}/.
Resumable: a sample that already has an "ok" line for this prompt_version + model is skipped, so the
20-spot test is never paid for twice when the city run starts.
"""

from __future__ import annotations

import argparse
import base64
import collections
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic
import networkx as nx
import osmnx as ox
import score_prompts as sp  # noqa: I001  (sibling module: scripts/ is on sys.path)

PY = Path(__file__).resolve().parents[1]
DATA = PY / "data"
PHOTOS = DATA / "cache" / "streetview"
RAW = DATA / "cache" / "llm"
OUT = {"safe": DATA / "safety_scores.jsonl", "green": DATA / "green_scores.jsonl"}
LAYER = {
    "safe": (sp.SAFE_VERSION, sp.SAFE_PROMPT, sp.SAFE_SCHEMA),
    "green": (sp.GREEN_VERSION, sp.GREEN_PROMPT, sp.GREEN_SCHEMA),
}
# USD per million tokens, prompts under 100K (platform.claude.com/docs/en/about-claude/pricing, 2026-10-16).
PRICES = {
    "claude-haiku-5-5": {"input_tokens": 0.10, "output_tokens": 0.50,
                         "cache_read_input_tokens": 0.01, "cache_creation_input_tokens": 0.125},
}  # fmt: skip
MIN_JUNCTION_PHOTOS = 2  # one photo can't show a whole intersection; those get the rule fallback
COMPASS = {0: "NORTH", 90: "EAST", 180: "SOUTH", 270: "WEST"}
_write_lock = threading.Lock()


def load_env() -> None:
    for line in (PY.parent / ".env").read_text(encoding="utf-8").splitlines():
        k, _, v = line.partition("=")
        if k.strip() and v.strip() and not k.startswith("#"):
            os.environ.setdefault(k.strip(), v.strip())


def first(v):
    return v[0] if isinstance(v, list) else v


def val(d: dict, key: str) -> str:
    v = d.get(key)
    if v is None or v == "":
        return "unknown"
    return ", ".join(map(str, v)) if isinstance(v, list) else str(v)


def heading_of(photo: str) -> int:
    return int(photo.rsplit("_", 1)[1].removesuffix(".jpg"))  # pano ids can contain "_"


# ---------------------------------------------------------------- message


def labels(s: dict) -> list[str]:
    n = len(s["photos"])
    if s["kind"] == "junction":
        return [
            f"Photo {i} of {n}: facing {COMPASS[heading_of(p)]} (file heading {heading_of(p)})"
            for i, p in enumerate(s["photos"], 1)
        ]
    h = s["heading"]
    if n == 1:
        return [f"Photo 1 of 1: FORWARD (direction of travel, heading {h}°). There is no curb-side photo."]
    return [
        f"Photo 1 of 2: FORWARD (direction of travel, heading {h}°)",
        f"Photo 2 of 2: RIGHT (curb side, heading {(h + 90) % 360}°)",
    ]


def edge_line(d: dict) -> str:
    bits = [str(first(d.get("highway")) or "road"), f"{val(d, 'lanes')} lanes", val(d, "maxspeed")]
    if d.get("city_pathtype"):
        bits.append(f"city: {d['city_pathtype']}")
    return f"{first(d.get('name')) or 'unnamed'} ({', '.join(bits)})"


def facts(s: dict, G: nx.MultiDiGraph, layer: str) -> str:
    head = 'MAP FACTS (true unless a photo clearly contradicts them; "unknown" = not mapped)'
    tail = "\nRate this spot. Fill every field in order."
    if layer == "green":
        return f"MAP FACTS\n- spot: road point on {s['name'] or 'unnamed'} ({s['highway']})\n" \
               f"- photos_taken: {s.get('pano_date') or 'unknown'}\n{tail}"  # fmt: skip
    if s["kind"] == "junction":
        n = s["node"]
        approaches = {}
        for _u, _v, d in list(G.out_edges(n, data=True)) + list(G.in_edges(n, data=True)):
            approaches.setdefault(str(first(d.get("name")) or f"unnamed {first(d.get('highway'))}"), d)
        lines = [
            f"- spot: intersection, {G.nodes[n].get('street_count', len(approaches))} legs",
            f"- signalised: {'yes' if s.get('signal') else 'no'}",
            "- approaches: " + "; ".join(edge_line(d) for d in approaches.values()),
        ]
    else:
        u, v, k = s["edge"]
        d = G.edges[u, v, k]
        bike = sorted(f"{key}={val(d, key)}" for key in d if key.startswith("cycleway"))
        lines = [
            f"- spot: road point on {s['name'] or 'unnamed'} ({s['highway']})",
            f"- speed_limit: {val(d, 'maxspeed')}",
            f"- lanes_total: {val(d, 'lanes')} · oneway: {val(d, 'oneway')}",
            f"- osm_bike_tags: {', '.join(bike) or 'none'}",
            f"- city_bikeway: {d.get('city_pathtype') or 'none'}",
            f"- turn_lanes: {val(d, 'turn:lanes')}",
        ]
    lines.append(f"- photos_taken: {s.get('pano_date') or 'unknown'}")
    return "\n".join([head, *lines, tail])


def content(s: dict, G: nx.MultiDiGraph, layer: str) -> list[dict]:
    out: list[dict] = []
    for label, photo in zip(labels(s), s["photos"], strict=True):
        data = base64.b64encode((PHOTOS / photo).read_bytes()).decode()
        image = {"type": "base64", "media_type": "image/jpeg", "data": data}
        out += [{"type": "text", "text": label}, {"type": "image", "source": image}]
    out.append({"type": "text", "text": facts(s, G, layer)})
    return out


# ---------------------------------------------------------------- call


def call(client: anthropic.Anthropic, model: str, layer: str, msg: list[dict], max_tokens: int):
    _, prompt, schema = LAYER[layer]
    return client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": msg}],
        thinking={"type": "disabled"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
    )


def score(client, model: str, layer: str, s: dict, G) -> dict:
    version = LAYER[layer][0]
    msg = content(s, G, layer)
    resp = call(client, model, layer, msg, 2000)
    if resp.stop_reason == "max_tokens":
        resp = call(client, model, layer, msg, 4000)
    (RAW / layer).mkdir(parents=True, exist_ok=True)
    (RAW / layer / f"{s['sample_id']}.json").write_text(resp.model_dump_json(indent=1))
    row = {"sample_id": s["sample_id"], "layer": layer, "prompt_version": version, "model": model,
           "pano_date": s.get("pano_date"), "usage": {
               "input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens,
               "cache_read_input_tokens": resp.usage.cache_read_input_tokens or 0,
               "cache_creation_input_tokens": resp.usage.cache_creation_input_tokens or 0}}  # fmt: skip
    if resp.stop_reason == "end_turn":
        result = json.loads(next(b.text for b in resp.content if b.type == "text"))
        if "hazards" in result:
            result["hazards"] = list(dict.fromkeys(result["hazards"]))  # the schema can't stop repeats
        row.update(status="ok", result=result)
    else:
        row.update(
            status="refused" if resp.stop_reason == "refusal" else "error", stop_reason=resp.stop_reason
        )
    return row


# ---------------------------------------------------------------- main


def eligible(s: dict, layer: str) -> bool:
    if not s.get("photos"):
        return False
    if layer == "green":
        return s["kind"] == "road"
    return s["kind"] == "road" or len(s["photos"]) >= MIN_JUNCTION_PHOTOS


def done_ids(layer: str, model: str) -> set[str]:
    if not OUT[layer].exists():
        return set()
    version = LAYER[layer][0]
    rows = (json.loads(line) for line in OUT[layer].read_text(encoding="utf-8").splitlines() if line.strip())
    return {r["sample_id"] for r in rows if r["status"] == "ok" and r["prompt_version"] == version
            and r["model"] == model}  # fmt: skip


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", choices=["safe", "green"], required=True)
    ap.add_argument("--samples", help="JSON list of sample_ids to score (default: every eligible sample)")
    ap.add_argument("--model", default="claude-haiku-5-5")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, help="score at most N samples (smoke test)")
    ap.add_argument("--budget-usd", type=float, default=3.0, help="stop once this run has spent this much")
    args = ap.parse_args()
    load_env()
    if args.model not in PRICES:
        sys.exit(f"no price for {args.model}: add it to PRICES so the budget guard can work")

    samples = [json.loads(line) for line in (DATA / "samples.jsonl").read_text(encoding="utf-8").splitlines()]
    if args.samples:
        wanted = set(json.loads(Path(args.samples).read_text()))
        samples = [s for s in samples if s["sample_id"] in wanted]
    done = done_ids(args.layer, args.model)
    todo = [s for s in samples if eligible(s, args.layer) and s["sample_id"] not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{args.layer}: {len(todo)} to score with {args.model} ({len(done)} already done)")
    if not todo:
        return

    G = ox.load_graphml(DATA / "graph_raw.graphml")
    client = anthropic.Anthropic(max_retries=6)
    tokens: collections.Counter = collections.Counter()
    status: collections.Counter = collections.Counter()
    spent = 0.0

    def run(s):
        try:
            return score(client, args.model, args.layer, s, G)
        except anthropic.BadRequestError as e:  # a request-shape problem: same for every sample, so stop
            print(f"400 on {s['sample_id']}: {e.message}", file=sys.stderr)
            raise
        except anthropic.APIError as e:
            return {"sample_id": s["sample_id"], "layer": args.layer, "prompt_version": LAYER[args.layer][0],
                    "model": args.model, "status": "error", "error": str(e)[:300]}  # fmt: skip

    def results():
        # One call first writes the prompt cache; parallel first calls would each pay to write it.
        yield run(todo[0])
        with ThreadPoolExecutor(args.workers) as pool:
            yield from pool.map(run, todo[1:])

    with OUT[args.layer].open("a", encoding="utf-8") as f:
        for i, row in enumerate(results(), 1):
            with _write_lock:
                f.write(json.dumps(row) + "\n")
                f.flush()
            status[row["status"]] += 1
            tokens.update(row.get("usage", {}))
            spent = sum(PRICES[args.model][k] * n for k, n in tokens.items()) / 1e6
            if i % 100 == 0:
                print(f"   {i}/{len(todo)} {dict(status)} ${spent:.3f}")
            if spent >= args.budget_usd:
                print(f"   budget reached (${spent:.3f} >= ${args.budget_usd}); stopping. Rerun to resume.")
                break
    print(f"done: {dict(status)}  tokens: {dict(tokens)}  cost: ${spent:.3f}")


if __name__ == "__main__":
    main()
