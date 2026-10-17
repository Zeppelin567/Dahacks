// Geometry + motion helpers shared by every map layer (ported from prototype v3).
// The API speaks [lat, lng] (see ../api.ts LatLng); MapLibre/GeoJSON speak [lng, lat]. Convert at the edge with flip().
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { LatLng } from "../api";

export type LngLat = [number, number];
export type FeatureProps = Record<string, unknown>;

export const flip = (c: LatLng | LngLat): [number, number] => [c[1], c[0]];

export const line = (cs: LatLng[], properties: FeatureProps = {}): Feature<LineString> => ({
  type: "Feature",
  properties,
  geometry: { type: "LineString", coordinates: cs.map(flip) },
});
export const point = (ll: LatLng, properties: FeatureProps = {}): Feature<Point> => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: flip(ll) },
});
export const poly = (ring: LatLng[], properties: FeatureProps = {}): Feature<Polygon> => ({
  type: "Feature",
  properties,
  geometry: { type: "Polygon", coordinates: [ring.map(flip)] },
});
export const fc = <G extends LineString | Point | Polygon>(features: Feature<G>[]): FeatureCollection<G> => ({
  type: "FeatureCollection",
  features,
});

const RE = 6371000;
export const rad = (d: number) => (d * Math.PI) / 180;
/** Metres between two [lat,lng] points (equirectangular; fine at city scale). */
export function dist(a: LatLng, b: LatLng): number {
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2));
  const y = rad(b[0] - a[0]);
  return Math.hypot(x, y) * RE;
}
export const lenOf = (cs: LatLng[]) => cs.reduce((s, c, i) => (i ? s + dist(cs[i - 1] as LatLng, c) : 0), 0);
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Drop vertices < 1.5 m apart and tiny back-tracks (they show as lumps at segment joins). */
export function dedupe(cs: LatLng[]): LatLng[] {
  if (!cs.length) return cs;
  const o: LatLng[] = [cs[0] as LatLng];
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i] as LatLng;
    if (dist(o[o.length - 1] as LatLng, c) < 1.5) continue;
    if (o.length > 1 && dist(o[o.length - 2] as LatLng, c) < 3) {
      o[o.length - 1] = c;
      continue;
    }
    o.push(c);
  }
  return o;
}

/** Bounds [[west,south],[east,north]] of several [lat,lng] lists, ready for map.fitBounds. */
export function bboxOf(lists: LatLng[][]): [LngLat, LngLat] {
  const a = [180, 90, -180, -90] as [number, number, number, number];
  for (const cs of lists)
    for (const [la, ln] of cs) {
      a[0] = Math.min(a[0], ln);
      a[1] = Math.min(a[1], la);
      a[2] = Math.max(a[2], ln);
      a[3] = Math.max(a[3], la);
    }
  return [
    [a[0], a[1]],
    [a[2], a[3]],
  ];
}

/** Arc-length parametrisation of a polyline: position at d metres, and projection of a point onto it. */
export function measure(coords: LatLng[]) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++)
    cum.push((cum[i - 1] as number) + dist(coords[i - 1] as LatLng, coords[i] as LatLng));
  const total = cum[cum.length - 1] ?? 0;
  return {
    coords,
    cum,
    total,
    at(d: number): LatLng {
      const dd = clamp(d, 0, total);
      let i = 1;
      while (i < cum.length - 1 && (cum[i] as number) < dd) i++;
      const a = coords[i - 1] ?? coords[0];
      const b = coords[i] ?? a;
      if (!a || !b) return [0, 0];
      const t = (dd - (cum[i - 1] ?? 0)) / ((cum[i] ?? 0) - (cum[i - 1] ?? 0) || 1);
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    },
    project(p: LatLng) {
      let best = { d: Number.POSITIVE_INFINITY, along: 0 };
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1] as LatLng;
        const b = coords[i] as LatLng;
        const L = (cum[i] as number) - (cum[i - 1] as number);
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const q: LatLng = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
          const d = dist(p, q);
          if (d < best.d) best = { d, along: (cum[i - 1] as number) + t * L };
        }
      }
      return best;
    },
  };
}

// ---------- motion ----------
export const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const backOut = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One-shot rAF tween (t: 0..1). Reduced motion jumps straight to the end. Returns a cancel function via .cancel. */
export function tween(ms: number, fn: (t: number) => void, ease: (t: number) => number = easeOut) {
  let raf = 0;
  let cancelled = false;
  const done = new Promise<void>((res) => {
    if (prefersReducedMotion() || ms <= 0) {
      fn(1);
      res();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      if (cancelled) return res();
      const t = Math.min(1, (now - t0) / ms);
      fn(ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else res();
    };
    raf = requestAnimationFrame(step);
  });
  return Object.assign(done, {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  });
}
