// Route lines (port of v3 addRoutes / drawRoutes / applySel): the fast route as a soft solid ghost line whose busy/risky
// stretches take the warm ramp (Modern), and ours as an ink-cased coloured line with a soft breathing glow, plus
// start/end dots. Each new route (and each mode switch) draws itself in: the fast ghost first, then ours; the
// numbered beads and photo pins listen to the draw bus (./shared.ts) and pop in time.
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { LatLng, RouteResponse } from "../../api";
import type { UiMode } from "../../theme";
import { addLayerOnce, setGeoJSON, useBikeMap, useMapLayers } from "../context";
import { backOut, clamp, dedupe, easeIO, fc, line, point, prefersReducedMotion, tween } from "../geo";
import { PAL, slot, zw } from "../style";
import { type DrawEvent, emitDraw, racing } from "./shared";

export const ROUTE_LAYERS = [
  "rec-glow",
  "fast-glow",
  "fast-case",
  "fast-line",
  "fast-bad",
  "fast-hit",
  "rec-case",
  "rec-line",
  "rec-hit",
  "ends",
] as const;

export const RW = { core: zw(3.2, 7.5, 18), cas: zw(5.6, 12, 25), glow: zw(10, 22, 46) };
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

function sources(r: RouteResponse | undefined) {
  if (!r) return { fast: EMPTY, rec: EMPTY, fastSegs: EMPTY, recSegs: EMPTY, ends: EMPTY };
  const segs = (which: "fast" | "rec") =>
    fc(
      (which === "fast" ? r.fastest : r.recommended).segments.map((s, i) =>
        line(s.coords, { i, level: s.level, score: s.score, reasons: JSON.stringify(s.reasons), which }),
      ),
    );
  const rc = r.recommended.coords;
  return {
    fast: fc([line(dedupe(r.fastest.coords))]),
    rec: fc([line(dedupe(rc))]),
    fastSegs: segs("fast"),
    recSegs: segs("rec"),
    ends: rc.length
      ? fc([point(rc[0] as LatLng, { k: "s" }), point(rc[rc.length - 1] as LatLng, { k: "e" })])
      : EMPTY,
  };
}

function ensureLayers(map: MlMap, mode: UiMode) {
  if (map.getLayer("rec-line")) return;
  const P = PAL[mode];
  const before = slot(map, "labels");
  const round = { "line-cap": "round", "line-join": "round" } as const;
  const fw = zw(2.8, 6, 12);
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
      paint: {
        "line-color": P.ghost,
        "line-opacity": 0.22,
        "line-width": zw(6, 11, 20),
        "line-blur": zw(1, 2, 4),
      },
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
      paint: { "line-width": fw, "line-color": P.ghost },
    },
    before,
  );
  if (mode === "modern")
    addLayerOnce(
      map,
      {
        id: "fast-bad",
        type: "line",
        source: "r-fastSegs",
        layout: round,
        filter: ["in", ["get", "level"], ["literal", ["bad", "ok"]]],
        paint: { "line-width": fw, "line-color": ["match", ["get", "level"], "bad", P.bad, P.busy] },
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
      paint: { "line-color": P.routeInk, "line-width": RW.cas },
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
      paint: { "line-color": P.ours, "line-width": RW.core },
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
  map.setPaintProperty("fast-line", "line-opacity", us ? 0.9 : 1);
  map.setPaintProperty("fast-case", "line-opacity", us ? 0.22 : 0.3);
  if (map.getLayer("fast-bad")) map.setPaintProperty("fast-bad", "line-opacity", us ? 0.85 : 1);
  const before = us ? "rec-case" : slot(map, "labels");
  for (const id of ["fast-case", "fast-line", "fast-bad", "fast-hit"])
    if (map.getLayer(id)) map.moveLayer(id, before);
}

const grad = (map: MlMap, id: string, c: string, p: number) => {
  if (map.getLayer(id))
    map.setPaintProperty(id, "line-gradient", [
      "step",
      ["line-progress"],
      c,
      clamp(p, 0.0001, 0.9999),
      "rgba(0,0,0,0)",
    ]);
};

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

  async function draw(mode: UiMode) {
    const map = maps[mode];
    if (!map.getLayer("rec-line")) return;
    const tok = ++st.tok[mode];
    const live = () => st.tok[mode] === tok;
    await whenReady(map);
    if (!live()) return;
    const P = PAL[mode];
    const fastIds: [string, string][] = [
      ["fast-case", P.ghost],
      ["fast-line", P.ghost],
    ];
    const recIds: [string, string][] = [
      ["rec-glow", P.ours],
      ["rec-case", P.routeInk],
      ["rec-line", P.ours],
    ];
    const later = ["fast-bad", "fast-glow"].filter((id) => map.getLayer(id));
    if (prefersReducedMotion()) {
      fire(mode, "start");
      fire(mode, "ours");
      fire(mode, "done");
      return;
    }
    for (const [id, c] of [...fastIds, ...recIds]) grad(map, id, c, 0);
    for (const id of later) map.setLayoutProperty(id, "visibility", "none");
    map.setFilter("ends", ["==", ["get", "k"], "s"]);
    fire(mode, "start");
    await tween(
      650,
      (t) => {
        if (live()) for (const [id, c] of fastIds) grad(map, id, c, t);
      },
      easeIO,
    );
    if (!live()) return;
    for (const id of later) map.setLayoutProperty(id, "visibility", "visible");
    fire(mode, "ours");
    await tween(
      1050,
      (t) => {
        if (live()) for (const [id, c] of recIds) grad(map, id, c, t);
      },
      easeIO,
    );
    if (!live()) return;
    for (const [id] of [...fastIds, ...recIds]) map.setPaintProperty(id, "line-gradient", undefined);
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

  // cancel any running draw on unmount
  useEffect(
    () => () => {
      st.tok.modern++;
      st.tok.nature++;
    },
    [st],
  );
  return null;
}
