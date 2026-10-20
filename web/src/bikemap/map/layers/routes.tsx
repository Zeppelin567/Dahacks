// Route lines (port of v3 addRoutes / drawRoutes / applySel). Both routes are coloured stretch by stretch from the
// API's segment levels (LEVEL_COLORS: calm / busy / risky in Modern, leafy / some green / bare in Nature), as one
// line-gradient per route, so each route stays a single clean line with no seams at the joins. Ours is the primary
// line (thick, cased in dark ink: navy in Modern, forest in Nature, with a soft breathing glow); the fast route wears
// the same level colours thinner and softer on a light edge, so it still reads as the "other" route. A risky crossing
// is shorter than its bead, so short risky runs are widened to a minimum screen length around the bead (re-cut when
// the zoom settles). Each new route (and each mode switch) draws itself in: the fast route first, then ours; the
// numbered beads and photo pins listen to the draw bus (./shared.ts) and pop in time.
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { LatLng, Level, Route, RouteResponse } from "../../api";
import { LEVEL_COLORS, type UiMode } from "../../theme";
import { addLayerOnce, setGeoJSON, useBikeMap, useMapLayers } from "../context";
import {
  backOut,
  clamp,
  dedupe,
  easeIO,
  fc,
  line,
  measure,
  point,
  prefersReducedMotion,
  rad,
  tween,
} from "../geo";
import { PAL, slot, zw } from "../style";
import { type DrawEvent, emitDraw, racing } from "./shared";

export const ROUTE_LAYERS = [
  "rec-glow",
  "fast-glow",
  "fast-case",
  "fast-line",
  "fast-hit",
  "rec-case",
  "rec-line",
  "rec-hit",
  "ends",
] as const;

export const RW = { core: zw(3.2, 7.5, 18), cas: zw(5.8, 12.5, 26), glow: zw(10, 22, 46) };
/** The fast route: same level colours, thinner, on a narrow edge (PAL.fastCase). */
const FW = { core: zw(2.6, 5.2, 11), cas: zw(4.6, 8.6, 17) };
export const endR = (s: number): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  6 * s,
  16,
  10 * s,
];

const EMPTY = fc([]);
const CLEAR = "rgba(0,0,0,0)";

/** A level run starts at line-progress t (0..1) of the drawn line. */
type Stop = [t: number, level: Level];
type Stops = Record<RouteSel, Stop[]>;
const NO_STOPS: Stops = { fast: [], rec: [] };

/**
 * Distance along the drawn line of the point nearest to p, searching forward from `from` metres (segments come in
 * route order, so a route that passes the same corner twice still lands on the right pass).
 */
function alongFrom(ms: ReturnType<typeof measure>, p: LatLng, from: number): number {
  const { coords, cum } = ms;
  const k = Math.cos(rad(p[0]));
  let best = Number.POSITIVE_INFINITY;
  let at = from;
  for (let i = 1; i < coords.length; i++) {
    const c0 = cum[i - 1] as number;
    const c1 = cum[i] as number;
    if (c1 < from) continue;
    const a = coords[i - 1] as LatLng;
    const b = coords[i] as LatLng;
    const ax = (a[1] - p[1]) * k;
    const ay = a[0] - p[0];
    const dx = (b[1] - p[1]) * k - ax;
    const dy = b[0] - p[0] - ay;
    const L = dx * dx + dy * dy;
    const t = L ? clamp(-(ax * dx + ay * dy) / L) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy) * 111320;
    if (d < best) {
      best = d;
      at = Math.max(from, c0 + t * (c1 - c0));
      if (d < 1.5) break; // on the line: the first pass wins
    }
  }
  return at;
}

/** A route's level runs on its drawn line, before widening, and that line's length in metres. */
type Raw = { stops: Stop[]; total: number };
type Raws = Record<RouteSel, Raw>;
const NO_RAW: Raws = { fast: { stops: [], total: 0 }, rec: { stops: [], total: 0 } };

/**
 * Screen length (px) a run of a level is drawn at, at least. A risky crossing is ~25 m of street, smaller than its
 * numbered bead, so its red is widened around the bead (a minimum symbol size, like any map) to stay visible.
 */
const MIN_PX: Record<UiMode, Partial<Record<Level, number>>> = { modern: { bad: 76 }, nature: {} };
/** ...but never wider than this many metres each, so a zoomed-out route doesn't turn red end to end. */
const MAX_WIDE_M = 240;

/** Metres per screen pixel at the map's zoom and latitude (512 px tiles). */
const mpp = (map: MlMap) => (40075016.686 * Math.cos(rad(map.getCenter().lat))) / (512 * 2 ** map.getZoom());

/** Where each level run of a route starts on its drawn (deduped) line, as line-progress. Same-level runs merge. */
export function levelStops(route: Route, drawn: LatLng[]): Raw {
  const segs = route.segments.filter((s) => s.coords.length > 1);
  const first = segs[0];
  if (!first || drawn.length < 2) return { stops: [], total: 0 };
  const ms = measure(drawn);
  if (!ms.total) return { stops: [], total: 0 };
  const out: Stop[] = [[0, first.level]];
  let from = 0;
  for (const s of segs.slice(1)) {
    from = alongFrom(ms, s.coords[0] as LatLng, from);
    const last = out[out.length - 1] as Stop;
    if (s.level === last[1]) continue;
    const t = from / ms.total;
    if (t >= 0.9999) break;
    if (t <= last[0] + 1e-5) last[1] = s.level;
    else out.push([t, s.level]);
  }
  return { stops: out, total: ms.total };
}

/** Each run of level `lv` shorter than minM metres grows to minM around its middle (where its bead sits). */
export function widen({ stops, total }: Raw, lv: Level, minM: number): Stop[] {
  if (!total || minM <= 0) return stops;
  const runs = stops.map(([a, l], i) => ({ a, b: stops[i + 1]?.[0] ?? 1, l }));
  const wide: [number, number][] = [];
  for (const r of runs) {
    if (r.l !== lv || (r.b - r.a) * total >= minM) continue;
    const mid = (r.a + r.b) / 2;
    const h = minM / total / 2;
    wide.push([Math.max(0, mid - h), Math.min(1, mid + h)]);
  }
  if (!wide.length) return stops;
  const levelAt = (t: number): Level => {
    if (wide.some(([a, b]) => t >= a && t < b)) return lv;
    let l = runs[0]?.l ?? lv;
    for (const r of runs) if (r.a <= t) l = r.l;
    return l;
  };
  const cuts = [...new Set([...runs.map((r) => r.a), ...wide.flat()])]
    .filter((t) => t < 1)
    .sort((x, y) => x - y);
  const out: Stop[] = [];
  cuts.forEach((t, i) => {
    const l = levelAt((t + (cuts[i + 1] ?? 1)) / 2);
    if (out.at(-1)?.[1] !== l) out.push([out.length ? t : 0, l]);
  });
  return out;
}

/** The stops each route is painted with at this map's zoom (short risky runs widened to stay visible). */
function stopsAt(map: MlMap, mode: UiMode, raw: Raws): Stops {
  const px = MIN_PX[mode];
  const k = mpp(map);
  const draw = (r: Raw) => {
    let s = r.stops;
    for (const [lv, n] of Object.entries(px) as [Level, number][])
      s = widen({ stops: s, total: r.total }, lv, Math.min(MAX_WIDE_M, Math.round((n * k) / 5) * 5));
    return s;
  };
  return { fast: draw(raw.fast), rec: draw(raw.rec) };
}

/**
 * line-gradient of a route's core: each level run in its colour (a step ramp keeps the joins crisp), cut off at p
 * while the route draws itself in.
 */
function ramp(stops: Stop[], C: Record<Level, string>, p = 1): ExpressionSpecification {
  const e: unknown[] = ["step", ["line-progress"], C[stops[0]?.[1] ?? "good"]];
  let last = 0;
  for (const [t, lv] of stops.slice(1)) {
    if (t >= p) break;
    e.push(t, C[lv]);
    last = t;
  }
  if (p < 1) e.push(Math.max(clamp(p, 0.0001, 0.9999), last + 1e-6), CLEAR);
  if (e.length < 5) e.push(1, e[2]); // a step needs at least one stop
  return e as ExpressionSpecification;
}

function sources(r: RouteResponse | undefined) {
  if (!r) return { fast: EMPTY, rec: EMPTY, fastSegs: EMPTY, recSegs: EMPTY, ends: EMPTY, raw: NO_RAW };
  const segs = (which: "fast" | "rec") =>
    fc(
      (which === "fast" ? r.fastest : r.recommended).segments.map((s, i) =>
        line(s.coords, {
          i,
          level: s.level,
          score: s.score,
          reasons: JSON.stringify(s.reasons),
          features: JSON.stringify(s.features ?? null),
          which,
        }),
      ),
    );
  const rc = r.recommended.coords;
  const fastLine = dedupe(r.fastest.coords);
  const recLine = dedupe(rc);
  return {
    fast: fc([line(fastLine)]),
    rec: fc([line(recLine)]),
    fastSegs: segs("fast"),
    recSegs: segs("rec"),
    ends: rc.length
      ? fc([point(rc[0] as LatLng, { k: "s" }), point(rc[rc.length - 1] as LatLng, { k: "e" })])
      : EMPTY,
    raw: { fast: levelStops(r.fastest, fastLine), rec: levelStops(r.recommended, recLine) } as Raws,
  };
}

/** Paint of each route's layers: a flat colour, or "ramp" = that route's level colours. */
function inks(mode: UiMode) {
  const P = PAL[mode];
  return {
    fast: [
      ["fast-case", P.fastCase],
      ["fast-line", "ramp"],
    ] as [string, string][],
    rec: [
      ["rec-glow", P.ours],
      ["rec-case", P.recCase],
      ["rec-line", "ramp"],
    ] as [string, string][],
  };
}

function ensureLayers(map: MlMap, mode: UiMode) {
  if (map.getLayer("rec-line")) return;
  const P = PAL[mode];
  const C = LEVEL_COLORS[mode];
  const before = slot(map, "labels");
  const round = { "line-cap": "round", "line-join": "round" } as const;
  addLayerOnce(
    map,
    {
      id: "rec-glow",
      type: "line",
      source: "r-rec",
      layout: round,
      paint: {
        "line-color": P.ours,
        "line-width": RW.glow,
        "line-blur": zw(6, 12, 24),
        "line-opacity": 0.25,
      },
    },
    before,
  );
  if (mode === "modern")
    addLayerOnce(
      map,
      {
        id: "fast-glow",
        type: "line",
        source: "r-fastSegs",
        layout: round,
        filter: ["==", ["get", "level"], "bad"],
        paint: {
          "line-color": P.bad,
          "line-width": zw(7, 14, 28),
          "line-blur": zw(4, 8, 14),
          "line-opacity": 0.28,
        },
      },
      before,
    );
  addLayerOnce(
    map,
    {
      id: "fast-case",
      type: "line",
      source: "r-fast",
      layout: round,
      paint: { "line-color": P.fastCase, "line-width": FW.cas, "line-blur": 0.5 },
    },
    before,
  );
  addLayerOnce(
    map,
    {
      id: "fast-line",
      type: "line",
      source: "r-fast",
      layout: round,
      paint: { "line-width": FW.core, "line-color": C.good },
    },
    before,
  );
  addLayerOnce(
    map,
    {
      id: "fast-hit",
      type: "line",
      source: "r-fastSegs",
      layout: round,
      paint: { "line-width": 16, "line-color": "#000", "line-opacity": 0 },
    },
    before,
  );
  addLayerOnce(
    map,
    {
      id: "rec-case",
      type: "line",
      source: "r-rec",
      layout: round,
      paint: { "line-color": P.recCase, "line-width": RW.cas },
    },
    before,
  );
  addLayerOnce(
    map,
    {
      id: "rec-line",
      type: "line",
      source: "r-rec",
      layout: round,
      paint: { "line-color": C.good, "line-width": RW.core },
    },
    before,
  );
  addLayerOnce(
    map,
    {
      id: "rec-hit",
      type: "line",
      source: "r-recSegs",
      layout: round,
      paint: { "line-width": 18, "line-color": "#000", "line-opacity": 0 },
    },
    before,
  );
  addLayerOnce(map, {
    id: "ends",
    type: "circle",
    source: "r-ends",
    paint: {
      "circle-radius": endR(1),
      "circle-color": ["match", ["get", "k"], "s", "#fff", P.routeInk],
      "circle-stroke-color": P.routeInk,
      "circle-stroke-width": 3.5,
      "circle-pitch-alignment": "viewport",
    },
  });
}

export type RouteSel = "rec" | "fast";

/** Which route the sheet has picked: the other one steps back (v3 applySel). */
function applySel(map: MlMap, sel: RouteSel) {
  if (!map.getLayer("rec-line")) return;
  const us = sel === "rec";
  map.setPaintProperty("rec-line", "line-opacity", us ? 1 : 0.45);
  map.setPaintProperty("rec-case", "line-opacity", us ? 1 : 0.35);
  map.setPaintProperty("fast-line", "line-opacity", us ? 0.8 : 1);
  map.setPaintProperty("fast-case", "line-opacity", us ? 0.85 : 1);
  const before = us ? "rec-case" : slot(map, "labels");
  for (const id of ["fast-case", "fast-line", "fast-hit"]) if (map.getLayer(id)) map.moveLayer(id, before);
}

/** Paint one route layer drawn up to p (0..1): a flat colour, or the route's level ramp. */
function paintTo(map: MlMap, mode: UiMode, id: string, ink: string, stops: Stop[], p: number) {
  if (!map.getLayer(id)) return;
  map.setPaintProperty(
    id,
    "line-gradient",
    ink === "ramp"
      ? ramp(stops, LEVEL_COLORS[mode], p)
      : ["step", ["line-progress"], ink, clamp(p, 0.0001, 0.9999), CLEAR],
  );
}

/** The finished look: level ramps on the cores, flat colours (no gradient) elsewhere. */
function paintDone(map: MlMap, mode: UiMode, stops: Stops) {
  const L = inks(mode);
  for (const which of ["fast", "rec"] as const)
    for (const [id, ink] of L[which])
      if (ink === "ramp") paintTo(map, mode, id, ink, stops[which], 1);
      else if (map.getLayer(id)) map.setPaintProperty(id, "line-gradient", undefined);
}

const routeKey = (r?: RouteResponse) =>
  r
    ? `${r.recommended.distance_m}|${r.recommended.coords.length}|${r.fastest.distance_m}|${r.fastest.coords.length}|${r.recommended.coords[0]}|${r.recommended.coords.at(-1)}`
    : "";

/** Resolves once the app has revealed its UI (data-ready on .bm-app), so the draw-in is seen, not hidden by the boot. */
function whenReady(map: MlMap): Promise<void> {
  const app = map.getContainer().closest<HTMLElement>(".bm-app");
  if (!app || app.hasAttribute("data-ready")) return Promise.resolve();
  return new Promise((res) => {
    const mo = new MutationObserver(() => {
      if (app.hasAttribute("data-ready")) {
        mo.disconnect();
        res();
      }
    });
    mo.observe(app, { attributes: true, attributeFilter: ["data-ready"] });
  });
}

/**
 * Each map shows the route of its own mode (Modern = safe engine, Nature = green engine).
 * - `sel`: which route is picked in the sheet ("rec" = ours). The other steps back.
 * - `onDraw`: phases of the draw-in on the VISIBLE map ("start", "ours" = ours starts drawing (count the headline
 *   now, ~1050 ms), "done" = everything is in (hop Pip)).
 */
export function RouteLayers({
  routes,
  sel = "rec",
  onDraw,
}: {
  routes: Partial<Record<UiMode, RouteResponse>>;
  sel?: RouteSel;
  onDraw?: (e: DrawEvent) => void;
}) {
  const { maps, ui } = useBikeMap();
  const st = useRef({
    tok: { modern: 0, nature: 0 } as Record<UiMode, number>,
    keys: { modern: "", nature: "" } as Record<UiMode, string>,
    raw: { modern: NO_RAW, nature: NO_RAW } as Record<UiMode, Raws>,
    stops: { modern: NO_STOPS, nature: NO_STOPS } as Record<UiMode, Stops>,
    sig: { modern: "", nature: "" } as Record<UiMode, string>,
    /** token of the draw-in running on each map (0 = none) */
    busy: { modern: 0, nature: 0 } as Record<UiMode, number>,
    ui,
    sel,
    onDraw,
  }).current;
  st.ui = ui;
  st.sel = sel;
  st.onDraw = onDraw;

  const fire = (mode: UiMode, phase: DrawEvent["phase"]) => {
    emitDraw(maps[mode], phase);
    if (mode === st.ui) st.onDraw?.({ mode, phase });
  };

  /** Level colours for this map's zoom: repaint when they change (a running draw-in reads them live itself). */
  const restop = (map: MlMap, mode: UiMode, force = false) => {
    const stops = stopsAt(map, mode, st.raw[mode]);
    const sig = JSON.stringify(stops);
    if (!force && sig === st.sig[mode]) return;
    st.sig[mode] = sig;
    st.stops[mode] = stops;
    if (!st.busy[mode] && map.getLayer("rec-line")) paintDone(map, mode, stops);
  };

  async function draw(mode: UiMode) {
    const map = maps[mode];
    if (!map.getLayer("rec-line")) return;
    const tok = ++st.tok[mode];
    const live = () => st.tok[mode] === tok;
    await whenReady(map);
    if (!live()) return;
    const L = inks(mode);
    // stops are read live, so a level update that lands mid-draw is picked up
    const paint = (which: RouteSel, p: number) => {
      for (const [id, ink] of L[which]) paintTo(map, mode, id, ink, st.stops[mode][which], p);
    };
    const later = ["fast-glow"].filter((id) => map.getLayer(id));
    if (prefersReducedMotion()) {
      paintDone(map, mode, st.stops[mode]);
      fire(mode, "start");
      fire(mode, "ours");
      fire(mode, "done");
      return;
    }
    st.busy[mode] = tok;
    paint("fast", 0);
    paint("rec", 0);
    for (const id of later) map.setLayoutProperty(id, "visibility", "none");
    map.setFilter("ends", ["==", ["get", "k"], "s"]);
    fire(mode, "start");
    await tween(
      650,
      (t) => {
        if (live()) paint("fast", t);
      },
      easeIO,
    );
    if (!live()) return;
    for (const id of later) map.setLayoutProperty(id, "visibility", "visible");
    fire(mode, "ours");
    await tween(
      1050,
      (t) => {
        if (live()) paint("rec", t);
      },
      easeIO,
    );
    if (!live()) return;
    st.busy[mode] = 0;
    paintDone(map, mode, st.stops[mode]);
    map.setFilter("ends", null);
    void tween(
      480,
      (t) => live() && map.setPaintProperty("ends", "circle-radius", endR(Math.max(0.01, backOut(t)))),
      (t) => t,
    );
    fire(mode, "done");
  }

  // data: update in place; a new route on the visible map draws itself in
  useMapLayers(
    (map, mode) => {
      const r = routes[mode];
      const src = sources(r);
      const lm = { lineMetrics: true };
      setGeoJSON(map, "r-fast", src.fast, lm);
      setGeoJSON(map, "r-rec", src.rec, lm);
      setGeoJSON(map, "r-fastSegs", src.fastSegs);
      setGeoJSON(map, "r-recSegs", src.recSegs);
      setGeoJSON(map, "r-ends", src.ends);
      const fresh = !map.getLayer("rec-line");
      ensureLayers(map, mode);
      if (fresh) applySel(map, st.sel);
      st.raw[mode] = src.raw;
      restop(map, mode, fresh);
      const k = routeKey(r);
      if (k && k !== st.keys[mode]) {
        st.keys[mode] = k;
        if (mode === st.ui) void draw(mode);
      }
      return undefined;
    },
    [routes.modern, routes.nature],
  );

  // a mode switch draws the incoming map's route (v3 setMode)
  const lastUi = useRef(ui);
  // biome-ignore lint/correctness/useExhaustiveDependencies: draw reads mutable state
  useEffect(() => {
    if (lastUi.current === ui) return;
    lastUi.current = ui;
    if (routes[ui]) void draw(ui);
  }, [ui]);

  useMapLayers(
    (map) => {
      applySel(map, sel);
      return undefined;
    },
    [sel],
  );

  // short risky runs are widened to a screen size, so re-cut the level stops once a zoom settles
  useMapLayers((map, mode) => {
    const h = () => restop(map, mode);
    map.on("zoomend", h);
    return () => map.off("zoomend", h);
  }, []);

  // breathing glow on the visible map: Modern ours at 0.8 Hz, its risky stretches slower; Nature one breath / 4 s
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;
      const mode = st.ui;
      const m = maps[mode];
      if (!m.getLayer("rec-glow") || document.hidden) return;
      if (mode === "modern") {
        const calm = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 0.8);
        m.setPaintProperty("rec-glow", "line-opacity", 0.12 + 0.22 * calm);
        if (m.getLayer("fast-glow") && !racing.has(m))
          m.setPaintProperty(
            "fast-glow",
            "line-opacity",
            0.16 + 0.24 * (0.5 - 0.5 * Math.cos((now / 2600) * Math.PI * 2)),
          );
      } else {
        const b = 0.5 - 0.5 * Math.cos((now / 4000) * Math.PI * 2);
        m.setPaintProperty("rec-glow", "line-opacity", 0.1 + 0.3 * b);
        m.setPaintProperty("rec-glow", "line-width", zw(8 + 5 * b, 18 + 12 * b, 40 + 20 * b));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [maps, st]);

  // cancel any running draw on unmount, and forget the drawn routes so a remount (React StrictMode's dev double
  // mount included, which used to cancel the first draw-in for good) draws them in again
  useEffect(
    () => () => {
      for (const m of ["modern", "nature"] as const) {
        st.tok[m]++;
        st.busy[m] = 0;
        st.keys[m] = "";
      }
    },
    [st],
  );
  return null;
}
