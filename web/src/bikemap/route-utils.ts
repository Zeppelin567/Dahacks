import type { GreenPrefs, LatLng, Route } from "./api";

/** Clamp a preference value to the paper's [-5, +5] range. */
export function clampPref(v: number): number {
  return Math.max(-5, Math.min(5, v));
}

/**
 * Paper §4.3 UI mapping: the rural slider r ∈ [0,1] becomes a preference
 * vector in [-5, +5] (negative = desire). A toggled-off feature is 0 = don't care.
 * Mirrors py/app/bikemap/engine.py::build_preferences (green mode).
 */
export function toPrefVector(rural: number, prefs: GreenPrefs): Record<string, number> {
  const r = Math.max(0, Math.min(1, rural));
  return {
    vegetation: prefs.green ? -5 * r : 0,
    quiet: prefs.quiet ? -5 * r : 0,
    shade: prefs.shade ? -5 * r : 0,
  };
}

/**
 * Paper §4.3 segment voting, applied to the accumulated per-feature delta vector.
 * like → add the segment's feature vector ([-1,1], negative = good);
 * dislike → subtract it. Result stays in [-5, +5].
 */
export function applyVoteDeltas(
  adjust: Record<string, number>,
  features: Record<string, number>,
  like: boolean,
): Record<string, number> {
  const s = like ? 1 : -1;
  const out: Record<string, number> = { ...adjust };
  for (const [f, f01] of Object.entries(features)) {
    const v11 = 1 - 2 * f01; // 0..1 → [-1, 1], negative = bikeable
    out[f] = clampPref((out[f] ?? 0) + s * v11);
  }
  return out;
}

/** Haversine distance in meters. LatLng = [lat, lng]. */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Total length of a polyline in meters. */
export function polylineLengthM(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1]!, coords[i]!);
  return total;
}

/**
 * Turn-by-turn sentences from route segments, for the Web Speech API.
 * Each segment becomes one spoken step with its length and top reason.
 */
export function buildInstructions(route: Route): string[] {
  return route.segments.map((s, i) => {
    const m = Math.max(1, Math.round(polylineLengthM(s.coords)));
    const why = s.reasons[0] ?? "road";
    const head = i === 0 ? "Start" : "Then";
    return `${head}: ${why} — ${m} meters.`;
  });
}
