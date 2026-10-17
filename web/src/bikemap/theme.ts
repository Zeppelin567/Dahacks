// The Modern ↔ Nature switch flips everything visual: basemap, cards, accent, line colours.
// Modern = Safe route on a dark city map; Nature = Green route on a light map.
import type { Level, Mode } from "./api";

export type UiMode = "modern" | "nature";

export const ENGINE_MODE: Record<UiMode, Mode> = { modern: "safe", nature: "green" };

// Stadia Maps: no API key needed on localhost (our demo is local). CARTO now watermarks keyless tiles.
const STADIA =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILES: Record<UiMode, { url: string; attribution: string }> = {
  modern: {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attribution: STADIA,
  },
  nature: {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution: STADIA,
  },
};

// Neon traffic light on the dark map; leaf → concrete on the light one.
export const LEVEL_COLORS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "#4ade80", ok: "#fbbf24", bad: "#fb3b64" },
  nature: { good: "#15803d", ok: "#84b83a", bad: "#a39e98" },
};

export const LEVEL_LABELS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "Safe", ok: "Caution", bad: "Risky" },
  nature: { good: "Leafy", ok: "Some green", bad: "Concrete" },
};
