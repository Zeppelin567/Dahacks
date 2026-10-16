"""Optional Python side-car.

Runs next to the TypeScript api and is only ever reached *through* it:
the browser calls ``/api/py/<path>`` on the api, which checks the session or
API key, adds ``x-user-id`` / ``x-user-email`` headers, and forwards here.
So this service does no auth of its own and should listen on localhost only.

Start it with ``npm run dev:py`` (which runs ``uv run uvicorn app.main:app``).

Add your own routes below. The two examples show the shapes you will need
most at a hackathon: "bytes in, numbers out" (image stats) and "text in,
JSON out" (text stats). Swap in numpy / OpenCV / torch / whatever you like.
"""

from __future__ import annotations

import io
import re

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageStat, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.bikemap import router as bikemap_router

# root_path makes the generated OpenAPI document (and its "servers" entry)
# correct when viewed through the api's proxy at /api/py.
app = FastAPI(
    title="MVP Python service",
    version="0.1.0",
    description="Side-car for compute the TypeScript api should not do itself.",
    root_path="/api/py",
)
app.include_router(bikemap_router)


class Health(BaseModel):
    ok: bool = True
    service: str = "py"
    version: str = "0.1.0"


@app.get("/health", response_model=Health, tags=["system"])
def health() -> Health:
    return Health()


class Caller(BaseModel):
    """Who the api says is calling (from the forwarded headers)."""

    user_id: str | None = None
    email: str | None = None


@app.get("/whoami", response_model=Caller, tags=["system"])
def whoami(
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
) -> Caller:
    return Caller(user_id=x_user_id, email=x_user_email)


class ImageStats(BaseModel):
    filename: str | None
    format: str | None = Field(description="PNG, JPEG, …")
    mode: str = Field(description="Pillow mode, e.g. RGB, RGBA, L")
    width: int
    height: int
    bytes: int
    mean_brightness: float = Field(description="0 (black) – 255 (white), on a grayscale conversion")


@app.post("/image/stats", response_model=ImageStats, tags=["examples"])
async def image_stats(file: UploadFile = File(...)) -> ImageStats:  # noqa: B008 - FastAPI idiom
    """Bytes in, numbers out: decode an uploaded image and describe it."""
    data = await file.read()
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="The upload is not a decodable image") from exc

    brightness = ImageStat.Stat(img.convert("L")).mean[0]
    return ImageStats(
        filename=file.filename,
        format=img.format,
        mode=img.mode,
        width=img.width,
        height=img.height,
        bytes=len(data),
        mean_brightness=round(brightness, 2),
    )


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)


class TextStats(BaseModel):
    characters: int
    words: int
    lines: int
    top_words: list[tuple[str, int]] = Field(description="Five most frequent words (lowercased)")


@app.post("/text/stats", response_model=TextStats, tags=["examples"])
def text_stats(body: TextIn) -> TextStats:
    """Text in, JSON out. Replace with tokenisation, NER, sentiment — anything."""
    words = re.findall(r"[\w'-]+", body.text.lower())
    counts: dict[str, int] = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    return TextStats(
        characters=len(body.text),
        words=len(words),
        lines=body.text.count("\n") + 1,
        top_words=top,
    )
