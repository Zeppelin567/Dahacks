// Nature, 3D: little trees pop out along the scenic route. Leafy stretches ("good") get more, larger trees, "some
// green" ("ok") fewer and smaller ones, busy stretches none. They sit a few metres off both sides of the line and
// spring up (overshoot ~1.16, settled in ~0.8 s) in a wave from start to end when 3D turns on, or along with the
// line as a new route draws itself in; leaving 3D or switching to Modern shrinks them away (250 ms).
// One fill-extrusion layer (trunk + canopy + crown per tree); the growth is a per-tree feature-state "s" (0..1+),
// so a frame is a few setFeatureState calls, no re-tiling.
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import type { LatLng, Level, RouteResponse } from "../../api";
import { addLayerOnce, removeLayers, setGeoJSON, useBikeMap, useMapLayers } from "../context";
import { fc, prefersReducedMotion, rad } from "../geo";
import { slot } from "../style";
import { ROUTE_LAYERS } from "./routes";
import { onDraw } from "./shared";

const SRC = "route-trees";
export const ROUTE_TREES = "route-trees-3d";
const MAX_TREES = 260;
/** canopy greens (Nature palette family) and their lighter crowns */
const LEAF = ["#5B9A3F", "#6FA84E", "#4F8C37", "#7DB25A"];
const CROWN = ["#86BD62", "#93C46E", "#79B356", "#A0CB7C"];
const TRUNK = "#8A6A48";

// damped spring: 0 -> 1, overshoots ~1.16 at 0.33 s, settled by ~0.8 s
const SA = 5.6;
const SW = 9.6;
const SPRING_END = 1.1;
const spring = (t: number) => 1 - Math.exp(-SA * t) * (Math.cos(SW * t) + (SA / SW) * Math.sin(SW * t));

type Tree = { x: number; y: number; r: number; big: boolean };
type Planted = { data: GeoJSON.FeatureCollection<GeoJSON.Polygon>; n: number; w: number[] };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Squared distance from p to segment ab (local metres). */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/** Deterministic tree spots along the recommended route (seeded by its coordinates). */
function plant(r: RouteResponse | undefined): Planted {
  const route = r?.recommended;
  const empty: Planted = { data: fc([]), n: 0, w: [] };
  const c0 = route?.coords[0];
  if (!route || !c0 || route.coords.length < 2) return empty;
  const mLa = 111320;
  const mLn = 111320 * Math.cos(rad(c0[0]));
  const toXY = (c: LatLng): [number, number] => [(c[1] - c0[1]) * mLn, (c[0] - c0[0]) * mLa];
  const toLL = (x: number, y: number): [number, number] => [c0[1] + x / mLn, c0[0] + y / mLa];
  const P = route.coords.map(toXY);
  let seed = 2166136261;
  for (let i = 0; i < route.coords.length; i += Math.max(1, route.coords.length >> 5)) {
    const c = route.coords[i] as LatLng;
    seed = Math.imul(seed ^ Math.round(c[0] * 1e5), 16777619);
    seed = Math.imul(seed ^ Math.round(c[1] * 1e5), 16777619);
  }
  const rand = rng(seed);
  const segLen = (cs: LatLng[]) => {
    let s = 0;
    for (let i = 1; i < cs.length; i++) {
      const [ax, ay] = toXY(cs[i - 1] as LatLng);
      const [bx, by] = toXY(cs[i] as LatLng);
      s += Math.hypot(bx - ax, by - ay);
    }
    return s;
  };
  const gap: Record<Level, number> = { good: 42, ok: 72, bad: 0 };
  // keep it light: stretch the spacing when a long leafy route would need too many trees
  let est = 0;
  for (const s of route.segments) if (gap[s.level]) est += (segLen(s.coords) / gap[s.level]) * 1.3;
  const stretch = Math.max(1, est / MAX_TREES);
  const [sx, sy] = P[0] as [number, number];
  const [ex, ey] = P[P.length - 1] as [number, number];
  const nearRoute = (x: number, y: number, min: number) => {
    const m2 = min * min;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1] as [number, number];
      const b = P[i] as [number, number];
      if (segD2(x, y, a[0], a[1], b[0], b[1]) < m2) return true;
    }
    return false;
  };
  const trees: (Tree & { along: number })[] = [];
  let base = 0;
  let k = 0;
  for (const s of route.segments) {
    const L = segLen(s.coords);
    const step = gap[s.level] * stretch;
    if (step && L > 4) {
      const Q = s.coords.map(toXY);
      let d = rand() * step * 0.6 + 4;
      let i = 1;
      let acc = 0;
      while (d < L && trees.length < MAX_TREES) {
        // walk to the piece of the segment that holds d
        while (i < Q.length - 1) {
          const a = Q[i - 1] as [number, number];
          const b = Q[i] as [number, number];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (acc + l >= d) break;
          acc += l;
          i++;
        }
        const a = Q[i - 1] as [number, number];
        const b = Q[i] as [number, number];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = Math.min(1, (d - acc) / l);
        const px = a[0] + t * (b[0] - a[0]);
        const py = a[1] + t * (b[1] - a[1]);
        const nx = -(b[1] - a[1]) / l;
        const ny = (b[0] - a[0]) / l;
        const big = s.level === "good";
        const sides = big && rand() < 0.35 ? [1, -1] : [k % 2 ? 1 : -1];
        if (rand() < 0.25) sides[0] = -(sides[0] as number);
        k++;
        for (const side of sides) {
          const r = big ? 6.2 + rand() * 1.6 : 4.6 + rand() * 0.8;
          const off = (big ? 21.5 : 19) + rand() * 4;
          const x = px + nx * side * off;
          const y = py + ny * side * off;
          if (Math.hypot(x - sx, y - sy) < 28 || Math.hypot(x - ex, y - ey) < 28) continue;
          if (nearRoute(x, y, r + 9.5)) continue;
          if (trees.slice(-6).some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 1)) continue;
          trees.push({ x, y, r, big, along: base + d });
        }
        d += step * (0.8 + rand() * 0.4);
      }
    }
    base += L;
  }
  if (!trees.length) return empty;
  trees.sort((p, q) => p.along - q.along);
  const total = base || 1;
  const n = trees.length;
  const feats: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const ring = (x: number, y: number, r: number, sides: number, rot: number) => {
    const out: [number, number][] = [];
    for (let j = 0; j <= sides; j++) {
      const a = rot + (j / sides) * Math.PI * 2;
      out.push(toLL(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    return out;
  };
  const poly = (id: number, coords: [number, number][], h: number, b: number, c: string) =>
    feats.push({
      type: "Feature",
      id,
      properties: { h, b, c },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  const w: number[] = new Array(2 * n).fill(0);
  trees.forEach((tr, i) => {
    const r = tr.r;
    const trunk = tr.big ? 4.4 + rand() * 1 : 3.6 + rand() * 0.6;
    const top = trunk + (tr.big ? 9.5 + rand() * 3 : 6.6 + rand() * 2);
    const crown = top + (tr.big ? 3.6 + rand() * 1.2 : 2.6 + rand() * 0.8);
    const ci = Math.floor(rand() * LEAF.length);
    const rot = rand() * Math.PI;
    poly(i, ring(tr.x, tr.y, 1.05, 4, rot), trunk + 1, 0, TRUNK);
    poly(i, ring(tr.x, tr.y, r, 8, rot), top, trunk, LEAF[ci] as string);
    // the crown lags the canopy a touch (secondary bounce)
    poly(n + i, ring(tr.x, tr.y, r * 0.6, 8, rot + 0.2), crown, top - 1.4, CROWN[ci] as string);
    const wv = (tr.along / total) * 0.94 + rand() * 0.06;
    w[i] = wv;
    w[n + i] = wv;
  });
  return { data: fc(feats), n, w };
}

const grow = (p: string): ExpressionSpecification => [
  "*",
  ["get", p],
  ["coalesce", ["feature-state", "s"], 0],
];

/**
 * Mount inside <MapLibreMap> (MapLayers does). Reads the 3D state from the map context.
 */
export function RouteTrees({ route }: { route?: RouteResponse }) {
  const { maps, ui, view3d } = useBikeMap();
  const planted = useMemo(() => plant(route), [route]);
  const map = maps.nature;
  const A = useRef({
    p: planted,
    s: [] as number[],
    raf: 0,
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    shown: false,
    want: false,
    data: null as Planted | null,
  }).current;
  A.p = planted;
  const want = view3d && ui === "nature" && planted.n > 0;
  A.want = want;

  const stop = () => {
    cancelAnimationFrame(A.raf);
    if (A.timer) clearTimeout(A.timer);
    A.timer = 0;
  };
  const setVis = (on: boolean) => {
    A.shown = on;
    if (map.getLayer(ROUTE_TREES)) map.setLayoutProperty(ROUTE_TREES, "visibility", on ? "visible" : "none");
  };
  const setS = (id: number, v: number, force = false) => {
    if (!force && Math.abs((A.s[id] ?? -1) - v) < 0.002) return;
    A.s[id] = v;
    if (map.getSource(SRC)) map.setFeatureState({ source: SRC, id }, { s: v });
  };
  const all = (v: number) => {
    for (let id = 0; id < 2 * A.p.n; id++) setS(id, v, true);
  };
  const hide = () => {
    stop();
    all(0);
    setVis(false);
  };
  /** the wave: tree at route fraction w starts at w * span ms (after `delay`) */
  const growWave = (span: number, delay = 0) => {
    stop();
    if (!A.p.n) return;
    if (prefersReducedMotion()) {
      all(1);
      setVis(true);
      return;
    }
    all(0);
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const T = now - t0;
      if (T >= 0 && !A.shown) setVis(true);
      let busy = false;
      const { n, w } = A.p;
      for (let id = 0; id < 2 * n; id++) {
        const t = (T - (w[id] ?? 0) * span - (id >= n ? 45 : 0)) / 1000;
        if (t < SPRING_END) busy = true;
        setS(id, t <= 0 ? 0 : t >= SPRING_END ? 1 : spring(t));
      }
      if (busy) A.raf = requestAnimationFrame(step);
    };
    A.raf = requestAnimationFrame(step);
  };
  const shrink = (ms = 250) => {
    stop();
    if (!A.shown) return;
    if (prefersReducedMotion()) return hide();
    const from = A.s.slice();
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const k = 1 - t * t;
      for (let id = 0; id < 2 * A.p.n; id++) setS(id, (from[id] ?? 0) * k);
      if (t < 1) A.raf = requestAnimationFrame(step);
      else setVis(false);
    };
    A.raf = requestAnimationFrame(step);
  };
  const waveMs = () => Math.max(700, Math.min(1800, A.p.n * 14));

  // data + layer (Nature map only), just under the route lines so the trees never paint over the route
  useMapLayers(
    (m, mode) => {
      if (mode !== "nature") return undefined;
      stop();
      A.s = [];
      if (m.getSource(SRC)) m.removeFeatureState({ source: SRC });
      setGeoJSON(m, SRC, planted.data);
      const ids = new Set<string>(ROUTE_LAYERS);
      const before = m.getStyle().layers.find((l) => ids.has(l.id))?.id ?? slot(m, "labels");
      addLayerOnce(
        m,
        {
          id: ROUTE_TREES,
          type: "fill-extrusion",
          source: SRC,
          minzoom: 12,
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": ["get", "c"],
            "fill-extrusion-height": grow("h"),
            "fill-extrusion-base": grow("b"),
            "fill-extrusion-opacity": 1,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        before,
      );
      A.shown = false;
      return undefined;
    },
    [planted],
  );

  // 3D on/off, Nature/Modern, a new route
  // biome-ignore lint/correctness/useExhaustiveDependencies: the helpers read the mutable A
  useEffect(() => {
    if (!want) {
      if (A.shown) shrink();
      else stop();
      A.data = planted;
      return;
    }
    if (A.data !== planted) {
      // a new route: wait for its line to draw in ("ours" below); grow anyway if no draw-in comes
      A.data = planted;
      hide();
      A.timer = setTimeout(() => growWave(waveMs()), 2200);
      return;
    }
    growWave(waveMs(), 300);
  }, [want, planted]);

  // the route drawing itself in: collapse, then grow along with the line (ours draws in 1050 ms)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the helpers read the mutable A
  useEffect(
    () =>
      onDraw(map, (phase) => {
        if (!A.want) return;
        if (phase === "start") hide();
        else if (phase === "ours") growWave(1050, 120);
      }),
    [map],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount only
  useEffect(
    () => () => {
      stop();
      removeLayers(map as MlMap, [ROUTE_TREES], [SRC]);
    },
    [map],
  );
  return null;
}
