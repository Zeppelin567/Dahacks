# /// script
# requires-python = ">=3.10"
# dependencies = ["httpx>=0.27"]
# ///
"""Create an item through the API with an API key — from anything that speaks HTTP.

Usage:
    uv run examples/add_item.py --key mvp_xxxxxxxx "Title of the item" [--notes "..."] [--status doing]
    API_URL=https://your-app.onrender.com uv run examples/add_item.py --key ... "Title"

Get a key from the app: sign in → API keys → New key. With the Live page open
in a browser, the new item appears there instantly (WebSocket broadcast).
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("title")
    p.add_argument("--key", default=os.environ.get("API_KEY"), help="API key (or env API_KEY)")
    p.add_argument("--notes", default=None)
    p.add_argument("--status", default="todo", choices=["todo", "doing", "done"])
    p.add_argument("--url", default=os.environ.get("API_URL", "http://localhost:3000"))
    args = p.parse_args()

    if not args.key:
        print("missing --key (or API_KEY env var)", file=sys.stderr)
        return 2

    headers = {"x-api-key": args.key}
    with httpx.Client(base_url=args.url, headers=headers, timeout=10) as client:
        me = client.get("/api/me")
        if me.status_code == 401:
            print("401: the key was rejected", file=sys.stderr)
            return 1
        me.raise_for_status()
        print(f"acting as {me.json()['email']}")

        res = client.post(
            "/api/items",
            json={"title": args.title, "notes": args.notes, "status": args.status},
        )
        if res.status_code != 201:
            print(f"{res.status_code}: {res.text}", file=sys.stderr)
            return 1
        item = res.json()
        print(f"created item {item['id']}  [{item['status']}] {item['title']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
