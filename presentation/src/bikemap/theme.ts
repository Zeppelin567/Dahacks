// The Modern ↔ Nature switch flips everything visual: basemap, cards, accent, line colours.
// Modern = Safe route on the light Harbor map; Nature = Green route on cream (same palettes as the website).
import type { Level, Mode } from "./api";

export type UiMode = "modern" | "nature";

export const ENGINE_MODE: Record<UiMode, Mode> = { modern: "safe", nature: "green" };

// Stadia Maps: no API key needed on localhost (our demo is local). CARTO now watermarks keyless tiles.
const STADIA =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILES: Record<UiMode, { url: string; attribution: string }> = {
  modern: {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution: STADIA,
  },
  nature: {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution: STADIA,
  },
};

// Calm / busy / risky (Harbor) and leafy / some green / bare (Nature), as on the website.
export const LEVEL_COLORS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "#3B9677", ok: "#E8A23A", bad: "#D9653B" },
  nature: { good: "#3F7D2A", ok: "#8EBF4C", bad: "#CDAA72" },
};

export const LEVEL_LABELS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "Safe", ok: "Caution", bad: "Risky" },
  nature: { good: "Leafy", ok: "Some green", bad: "Concrete" },
};
