import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


def png_bytes(width: int, height: int, color: tuple[int, int, int]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_openapi_is_served_under_the_proxy_prefix() -> None:
    spec = client.get("/openapi.json").json()
    assert spec["servers"] == [{"url": "/api/py"}]
    assert "/image/stats" in spec["paths"]


def test_whoami_reads_forwarded_headers() -> None:
    res = client.get("/whoami", headers={"x-user-id": "u1", "x-user-email": "a@x.io"})
    assert res.json() == {"user_id": "u1", "email": "a@x.io"}


def test_image_stats() -> None:
    res = client.post(
        "/image/stats",
        files={"file": ("white.png", png_bytes(8, 4, (255, 255, 255)), "image/png")},
    )
    assert res.status_code == 200
    body = res.json()
    assert (body["width"], body["height"], body["format"], body["mode"]) == (8, 4, "PNG", "RGB")
    assert body["mean_brightness"] == 255.0
    assert body["filename"] == "white.png"


def test_image_stats_rejects_non_images() -> None:
    res = client.post("/image/stats", files={"file": ("x.txt", b"hello", "text/plain")})
    assert res.status_code == 400


def test_text_stats() -> None:
    res = client.post("/text/stats", json={"text": "a b a\nc a"})
    assert res.status_code == 200
    body = res.json()
    assert body["words"] == 5
    assert body["lines"] == 2
    assert body["top_words"][0] == ["a", 3]

    assert client.post("/text/stats", json={"text": ""}).status_code == 422
