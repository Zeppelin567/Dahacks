// Numbers and words the sheet and cards derive from the API response (ported from prototype v3, section 6 + cards).
import type { LatLng, Route, RouteResponse } from "./api";
import type { IconName } from "./icons";
import { dist } from "./map/geo";
import type { UiMode } from "./theme";

export type Hero = { them: number; us: number; unit: "" | "%"; label: string; icon: IconName };

/** The headline: Modern = risky crossings; Nature = length-weighted vegetation score (%). */
export function heroVals(ui: UiMode, r?: RouteResponse): Hero | null {
  if (!r) return null;
  const c = r.compare;
  if (ui === "modern") {
    const bad = (x: Route) => x.segments.filter((s) => s.level === "bad").length;
    return {
      them: c.risky_segments_fastest ?? bad(r.fastest),
      us: c.risky_segments_recommended ?? bad(r.recommended),
      unit: "",
      label: "Risky crossings",
      icon: "scare",
    };
  }
  const pct = (x: Route) => {
    let w = 0;
    let s = 0;
    for (const g of x.segments) {
      const len = Math.max(1, lenOfFast(g.coords));
      w += len;
      s += (g.features?.vegetation ?? g.score) * len;
    }
    return w ? (100 * s) / w : 0;
  };
  return {
    them: c.greenery_pct_fastest ?? pct(r.fastest),
    us: c.greenery_pct_recommended ?? pct(r.recommended),
    unit: "%",
    label: "Greenery",
    icon: "leaf",
  };
}

function lenOfFast(cs: LatLng[]) {
  let s = 0;
  for (let i = 1; i < cs.length; i++) s += dist(cs[i - 1] as LatLng, cs[i] as LatLng);
  return s;
}

export type Rider = "kid" | "trailer" | "student" | "commuter";
export const RIDERS: { k: Rider; label: string }[] = [
  { k: "kid", label: "Kid" },
  { k: "trailer", label: "Family" },
  { k: "student", label: "Student" },
  { k: "commuter", label: "Commuter" },
];

/** Who could comfortably ride this route (worst spot + hazards along it). */
export function whoCanRide(r: Route): Record<Rider, boolean> {
  const worst = Math.min(...r.segments.map((s) => s.score), 1);
  const rs = r.segments.flatMap((s) => s.reasons).join("|");
  const fast = /Long crossing|40 mph/.test(rs);
  const share = /No bike lane/.test(rs);
  return {
    kid: worst >= 0.75 && !fast && !share,
    trailer: worst >= 0.6 && !fast,
    student: worst >= 0.45,
    commuter: true,
  };
}

export const worstOf = (r: Route) => Math.round(Math.min(...r.segments.map((s) => s.score), 1) * 10);

/** Small icons next to a crossing in the More list. */
const TAGS: [RegExp, IconName][] = [
  [/Long crossing/, "lanes"],
  [/40 mph/, "speed"],
  [/No island/, "island"],
  [/driveways/i, "drive"],
];
export const crossingTags = (reasons: string[]): IconName[] =>
  TAGS.filter(([re]) => reasons.some((t) => re.test(t)))
    .slice(0, 3)
    .map(([, ic]) => ic);

// ---------- card chips + "Why" ----------
export type Chip = { icon: IconName; label: string; tone: "neg" | "warn" | "pos" | "plain" };
type ChipRule = [RegExp, IconName, string | ((m: RegExpMatchArray) => string), "neg" | "pos"];
const CHIPS: ChipRule[] = [
  [/40 mph|Expressway/, "speed", "40 mph", "neg"],
  [/Long crossing|4 or more lanes|four-lane|six-lane|five lanes/, "lanes", "4+ lanes", "neg"],
  [/No island/, "island", "No island", "neg"],
  [/No bike lane|no mapped bike lane|Only bike symbols/, "nolane", "No bike lane", "neg"],
  [/squeezed|Bike lane drops/, "nolane", "Lane drops", "neg"],
  [/Parked cars/, "door", "Car doors", "neg"],
  [/driveways/i, "drive", "Driveways", "neg"],
  [/Rough pavement/, "rough", "Rough", "neg"],
  [/(?:Painted|Buffered|buffered) bike lane|protected|bikeway: Bike lane/i, "bikelane", "Bike lane", "pos"],
  [/^Quiet/, "quiet", "Quiet", "pos"],
  [/(\d+) street trees within 25 m/, "tree", (m) => `${m[1]} trees`, "pos"],
  [/park|green space/i, "park", "Park", "pos"],
  [/shade|canopy/i, "shade", "Shade", "pos"],
];

/** Up to three icon chips. Red only on a low score; a good street gets at most one amber "caution" chip. */
export function chipsFor(
  reasons: string[],
  ui: UiMode,
  score: number,
  max = 3,
): { chips: Chip[]; used: RegExp[] } {
  const chips: Chip[] = [];
  const used: RegExp[] = [];
  const seen = new Set<IconName>();
  const order = ui === "nature" ? [...CHIPS.slice(10), ...CHIPS.slice(0, 10)] : CHIPS;
  let warned = 0;
  for (const [re, icon, lab, tone0] of order) {
    if (chips.length >= max || seen.has(icon)) continue;
    const r = reasons.find((x) => re.test(x));
    if (!r) continue;
    let tone: Chip["tone"] = tone0;
    if (tone0 === "neg" && score >= 0.6) {
      if (score >= 0.7 && warned) continue;
      tone = "warn";
      warned++;
    }
    seen.add(icon);
    used.push(re);
    const m = r.match(re);
    chips.push({ icon, label: typeof lab === "function" && m ? lab(m) : String(lab), tone });
  }
  return { chips, used };
}

/** First clause of a sentence, at most 14 words. */
export function clip(t: string): string {
  let c = (t.split(/[;:—]|,\s(?:but|though|while|and the|with)\s|\s(?:but|though|while)\s/)[0] ?? t).trim();
  const w = c.split(/\s+/);
  if (w.length > 14) c = `${w.slice(0, 14).join(" ")}…`;
  return c.replace(/[.,]$/, "");
}

/** "Why": Claude's note first, then up to two short facts the chips and badge don't already say. */
export function whyLines(reasons: string[], note: string | null | undefined, used: RegExp[]) {
  const skip = /^Colour:|^No street imagery|^No street photo|·|^residential street$|scored \d+\/10/i;
  const out: { t: string; ai: boolean }[] = [];
  const seen = new Set<string>();
  const ai = note || reasons.find((r) => r.length > 50);
  if (ai) {
    out.push({ t: note ? note : clip(ai), ai: true });
    seen.add(ai);
  }
  for (const r of reasons) {
    if (out.length >= 3) break;
    const t = r.trim();
    if (!t || t.length > 50 || seen.has(t) || skip.test(t) || used.some((re) => re.test(t))) continue;
    seen.add(t);
    out.push({ t: (t[0] ?? "").toUpperCase() + t.slice(1), ai: false });
  }
  return out;
}

// ---------- trees along a route (Nature "More") ----------
type TreeIndex = { near: (p: LatLng) => LatLng[] };
const CELL = 0.0008;
const indexCache = new WeakMap<LatLng[], TreeIndex>();
function treeIndex(trees: LatLng[]): TreeIndex {
  const hit = indexCache.get(trees);
  if (hit) return hit;
  const g = new Map<string, LatLng[]>();
  const key = (la: number, ln: number) => `${Math.floor(la / CELL)},${Math.floor(ln / CELL)}`;
  for (const t of trees) {
    const k = key(t[0], t[1]);
    const a = g.get(k);
    if (a) a.push(t);
    else g.set(k, [t]);
  }
  const idx: TreeIndex = {
    near([la, ln]) {
      const out: LatLng[] = [];
      const i = Math.floor(la / CELL);
      const j = Math.floor(ln / CELL);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) out.push(...(g.get(`${i + a},${j + b}`) ?? []));
      return out;
    },
  };
  indexCache.set(trees, idx);
  return idx;
}

/** Street trees within `m` metres of the route line (sampled every ~8 m), with their distance along it, in order. */
export function treesAlongList(
  route: Route,
  trees: LatLng[] | undefined,
  m = 15,
): { t: LatLng; along: number }[] {
  if (!trees?.length) return [];
  const idx = treeIndex(trees);
  const hit = new Map<LatLng, number>();
  const cs = route.coords;
  let base = 0;
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1] as LatLng;
    const b = cs[i] as LatLng;
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / 8));
    for (let k = 0; k <= n; k++) {
      const p: LatLng = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      for (const t of idx.near(p)) if (!hit.has(t) && dist(t, p) <= m) hit.set(t, base + (len * k) / n);
    }
    base += len;
  }
  return [...hit.entries()].map(([t, along]) => ({ t, along })).sort((x, y) => x.along - y.along);
}

/** How many street trees are within `m` metres of the route line. */
export const treesAlong = (route: Route, trees: LatLng[] | undefined, m = 15): number =>
  treesAlongList(route, trees, m).length;

/** "De Anza Boulevard" -> "De Anza Blvd" */
export const shortName = (n: string) =>
  n
    .replace(/ Boulevard$/, " Blvd")
    .replace(/ Avenue$/, " Ave")
    .replace(/ Drive$/, " Dr")
    .replace(/^(North|South) /, "");

/** A Street View link for any point (cards without a scored photo). */
export const streetViewAt = (at: LatLng) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at[0]},${at[1]}`;

/** Trip line label: "Apple Infinite Loop" -> "Infinite Loop", "Cupertino Library / Civic Center" -> "Cupertino Library". */
export const tripName = (n: string) =>
  n
    .replace(/\s*[/(].*$/, "")
    .replace(/^Apple (?=Infinite)/, "")
    .replace(/ Cupertino$/, "")
    .trim() || n;
