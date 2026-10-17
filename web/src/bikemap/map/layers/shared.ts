// Shared bits for the map's data layers: what a tap on the map selects (MapPick), the draw-in event bus that lets
// beads and photo pins pop in time with the route drawing itself, and the street-name helpers from v3.
import type { Map as MlMap } from "maplibre-gl";
import type { LatLng, Level, RoutePhoto, Segment, StreetDetail } from "../../api";
import type { UiMode } from "../../theme";

/** What the user tapped on the map. Every kind carries what the rounded card needs (title, score 0..1, reasons). */
export type MapPick =
  | {
      kind: "street";
      /** where on the map it was tapped (the card points here) */
      at: LatLng;
      mode: UiMode;
      /** the layer that was hit: the street network or one of the two route lines */
      source: "net" | "rec" | "fast" | "api";
      title: string;
      score: number;
      level: Level;
      reasons: string[];
      /** Nature: the nearest Street View stop on the same street, if any */
      photo?: RoutePhoto;
    }
  | { kind: "crossing"; at: LatLng; mode: "modern"; crossing: Crossing }
  | { kind: "photo"; at: LatLng; mode: "nature"; index: number; photo: RoutePhoto };

/** A numbered risky stretch on the fastest route (a coral bead on the line in Modern). */
export type Crossing = {
  /** 1-based, in route order */
  n: number;
  at: LatLng;
  /** "De Anza × Lazaneo" style name: the street it crosses, from the street network */
  name: string;
  segment: Segment;
  /** metres from the start of the fastest route */
  along: number;
};

/** The phases of the route draw-in, per map. Sheets can count the headline during "ours". */
export type DrawPhase = "start" | "ours" | "done";
export type DrawEvent = { mode: UiMode; phase: DrawPhase };

// one tiny bus per map instance (layers on the same map listen to its route drawing)
const buses = new WeakMap<MlMap, EventTarget>();
export function drawBus(map: MlMap): EventTarget {
  let b = buses.get(map);
  if (!b) {
    b = new EventTarget();
    buses.set(map, b);
  }
  return b;
}
export function emitDraw(map: MlMap, phase: DrawPhase): void {
  drawBus(map).dispatchEvent(new CustomEvent<DrawPhase>("draw", { detail: phase }));
}
export function onDraw(map: MlMap, fn: (phase: DrawPhase) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<DrawPhase>).detail);
  drawBus(map).addEventListener("draw", h);
  return () => drawBus(map).removeEventListener("draw", h);
}

/** "Stevens Creek Boulevard · 1.2 km · ..." -> "Stevens Creek Boulevard" */
export const nameOf = (reasons?: string[]): string | null => {
  const r = reasons?.[0];
  return r?.includes(" · ") ? (r.split(" · ")[0] ?? null) : null;
};

/** The card's data for a /street response (right-click / long-press). */
export function pickFromStreet(d: StreetDetail, at: LatLng, mode: UiMode): MapPick {
  return {
    kind: "street",
    at,
    mode,
    source: "api",
    title: d.name,
    score: d.score10 / 10,
    level: d.level,
    reasons: [...(d.note ? [d.note] : []), ...d.chips.map((c) => c.replace(/^runs/i, "Runs"))],
    photo: d.photo ? { at, detail: d } : undefined,
  };
}

export const isMobile = () => typeof innerWidth === "number" && innerWidth < 700;

/** Maps where a Race is running (RouteLayers leaves the fast glow to the Race while set). */
export const racing = new WeakSet<MlMap>();
