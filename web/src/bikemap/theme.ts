// The Modern ↔ Nature switch flips everything visual: basemap, cards, accent, line colours (prototype v3 palettes).
// Modern = Safe route on the "Harbor" paper map; Nature = Green route on cream.
// CSS tokens live in theme.css (--bm-*); MapLibre paint colours live in map/style.ts (PAL). Keep them in sync.
import type { Level, Mode } from "./api";

export type UiMode = "modern" | "nature";
export const UI_MODES: readonly UiMode[] = ["modern", "nature"];

export const ENGINE_MODE: Record<UiMode, Mode> = { modern: "safe", nature: "green" };

// Street score colours, shared by the route lines (segment by segment), the street network and the legend:
// calm → busy → risky in the city (sage green, amber, Harbor coral); leafy → some green → bare in Nature
// (dark green, light green, sand).
export const LEVEL_COLORS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "#3B9677", ok: "#E8A23A", bad: "#D9653B" },
  nature: { good: "#3F7D2A", ok: "#8EBF4C", bad: "#CDAA72" },
};

export const LEVEL_LABELS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "Calm", ok: "Busy", bad: "Risky" },
  nature: { good: "Leafy", ok: "Some green", bad: "Bare" },
};

/** Pip, the mascot, per mode (files in web/public/pip/). */
export const PIP: Record<UiMode, string> = { modern: "/pip/pip_modern.png", nature: "/pip/pip_nature.png" };
