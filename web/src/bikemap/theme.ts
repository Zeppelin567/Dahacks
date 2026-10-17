// The Modern ↔ Nature switch flips everything visual: basemap, cards, accent, line colours (prototype v3 palettes).
// Modern = Safe route on the "Harbor" paper map; Nature = Green route on cream.
// CSS tokens live in theme.css (--bm-*); MapLibre paint colours live in map/style.ts (PAL). Keep them in sync.
import type { Level, Mode } from "./api";

export type UiMode = "modern" | "nature";
export const UI_MODES: readonly UiMode[] = ["modern", "nature"];

export const ENGINE_MODE: Record<UiMode, Mode> = { modern: "safe", nature: "green" };

// Street score colours: calm → busy → risky in the city; leafy → some green → bare in Nature.
export const LEVEL_COLORS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "#9DB2C6", ok: "#EDB49B", bad: "#D9653B" },
  nature: { good: "#86B85E", ok: "#CBC291", bad: "#A39E98" },
};

export const LEVEL_LABELS: Record<UiMode, Record<Level, string>> = {
  modern: { good: "Calm", ok: "Busy", bad: "Risky" },
  nature: { good: "Leafy", ok: "Some green", bad: "Bare" },
};

/** Pip, the mascot, per mode (files in web/public/pip/). */
export const PIP: Record<UiMode, string> = { modern: "/pip/pip_modern.png", nature: "/pip/pip_nature.png" };
