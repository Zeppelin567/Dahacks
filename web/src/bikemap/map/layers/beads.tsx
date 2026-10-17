// Numbered crossing beads (port of v3 addStickers/popBeads): every risky stretch of the FASTEST route gets a coral
// numbered bead ON the line (Modern map only). They pop in one after another while "ours" draws, then ping softly
// (staggered). Tapping one emits a "crossing" pick; the focused one grows and bursts.
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import type { LatLng, NetworkResponse, Route, RouteResponse } from "../../api";
import { useBikeMap } from "../context";
import { dist, flip, measure, prefersReducedMotion, rad } from "../geo";
import { useNetworks } from "./network";
import { type Crossing, type MapPick, nameOf, onDraw } from "./shared";

const SHORT = (n: string) =>
  n
    .replace(/ Boulevard$/, " Blvd")
    .replace(/ Avenue$/, " Ave")
    .replace(/ Drive$/, " Dr")
    .replace(/ Road$/, " Rd")
    .replace(/ Expressway$/, " Expy")
    .replace(/^(North|South|East|West) /, "");
const BARE = (n: string) => SHORT(n).replace(/ (Ave|Dr|Blvd|Rd|Way|Ln|Ct|St|Pl|Expy)$/, "");

/** Metres from p to the segment a-b (local flat projection; fine at street scale). */
function segDist(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k;
  const ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k;
  const by = b[0] - p[0];
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy) * 111320;
}

/** Nearest named street within maxM metres (optionally excluding one name). */
export function nearestName(net: NetworkResponse | undefined, ll: LatLng, maxM: number, not?: string | null) {
  const skip = not ? BARE(not) : null;
  let best: string | null = null;
  let bd = maxM;
  for (const g of net?.segments ?? []) {
    const nm = nameOf(g.reasons);
    if (!nm || (skip && BARE(nm) === skip) || /Hazard/.test(nm)) continue;
    for (let i = 0; i < g.coords.length; i++) {
      const d = i
        ? segDist(ll, g.coords[i - 1] as LatLng, g.coords[i] as LatLng)
        : dist(ll, g.coords[0] as LatLng);
      if (d < bd) {
        bd = d;
        best = nm;
      }
    }
  }
  return best;
}

/**
 * The numbered risky stretches of a route (level "bad"), in route order, named "Main × Cross" from the street
 * network (v3 crossName, generalised: the route's own street × the nearest other street).
 */
export function crossingsOf(route: Route | undefined, net?: NetworkResponse): Crossing[] {
  if (!route) return [];
  const ms = measure(route.coords);
  const raw = route.segments
    .filter((s) => s.level === "bad" && s.coords.length)
    .map((s) => {
      const at = s.coords[Math.floor(s.coords.length / 2)] as LatLng;
      return { s, at, along: ms.project(at).along };
    })
    .sort((a, b) => a.along - b.along)
    .map(({ s, at, along }, k) => {
      // the street the route runs along here: what is under the route 45 m before and after the bead
      // (a vote over samples along the route, so a side street touching the route doesn't win)
      const votes = new Map<string, number>();
      for (const d of [-90, -70, -50, -30, 30, 50, 70, 90]) {
        const nm = nearestName(net, ms.at(along + d), 15);
        if (nm) votes.set(BARE(nm), (votes.get(BARE(nm)) ?? 0) + 1);
      }
      const own = nameOf(s.reasons);
      const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const main = top ?? own ?? nearestName(net, at, 30);
      const cross =
        (own && (!main || BARE(own) !== BARE(main)) ? own : null) ?? nearestName(net, at, 90, main);
      return { n: k + 1, at, segment: s, along, main, cross };
    });
  // name every crossing "<street the route runs along> × <cross street>": the route's most common street goes first
  const tally = new Map<string, number>();
  for (const x of raw)
    for (const nm of [x.main, x.cross]) if (nm) tally.set(BARE(nm), (tally.get(BARE(nm)) ?? 0) + 1);
  const dom = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return raw.map(({ main: m0, cross: c0, ...x }) => {
    const swap = !!dom && !!c0 && BARE(c0) === dom && (!m0 || BARE(m0) !== dom);
    const main = swap ? c0 : m0;
    const cross = swap ? m0 : c0;
    const name =
      main && cross
        ? `${BARE(main)} × ${BARE(cross)}`
        : main
          ? SHORT(main)
          : cross
            ? SHORT(cross)
            : "Busy crossing";
    return { ...x, name };
  });
}

/** Crossings of the fastest safe route (for the sheet's list and the beads). */
export function useCrossings(route?: RouteResponse): Crossing[] {
  const { safe } = useNetworks();
  return useMemo(() => crossingsOf(route?.fastest, safe), [route, safe]);
}

export function CrossingBeads({
  route,
  focus = null,
  visible = true,
  onPick,
}: {
  /** the Modern (safe engine) route; beads sit on its FASTEST line */
  route?: RouteResponse;
  /** n of the focused crossing (grows + bursts), or null */
  focus?: number | null;
  visible?: boolean;
  onPick?: (p: MapPick) => void;
}) {
  const { maps, ui } = useBikeMap();
  const map = maps.modern;
  const xs = useCrossings(route);
  const els = useRef<HTMLElement[]>([]);
  const cb = useRef(onPick);
  cb.current = onPick;
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    const rm = prefersReducedMotion();
    const timers: number[] = [];
    const pop = () => {
      for (const t of timers.splice(0)) clearTimeout(t);
      els.current.forEach((el, i) => {
        el.classList.remove("in");
        timers.push(window.setTimeout(() => el.classList.add("in"), rm ? 0 : 110 * i));
      });
    };
    const markers = xs.map((x, k) => {
      const el = document.createElement("div");
      el.className = "bm-xing";
      el.dataset.n = String(x.n);
      el.style.setProperty("--d", `${k * 0.4}s`);
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Risky crossing ${x.n}: ${x.name}`);
      el.innerHTML = `<div class="ring"></div><div class="disc">${x.n}</div>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cb.current?.({ kind: "crossing", at: x.at, mode: "modern", crossing: x });
      });
      return new maplibregl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat(flip(x.at))
        .addTo(map);
    });
    els.current = markers.map((m) => m.getElement());
    const off = onDraw(map, (phase) => {
      if (phase === "start") for (const el of els.current) el.classList.remove("in");
      else if (phase === "ours") pop();
    });
    // no draw coming (route already drawn, or reduced motion): show them anyway
    timers.push(
      window.setTimeout(
        () => {
          if (!els.current.some((el) => el.classList.contains("in"))) pop();
        },
        rm ? 0 : 2600,
      ),
    );
    return () => {
      off();
      for (const t of timers) clearTimeout(t);
      for (const m of markers) m.remove();
      els.current = [];
    };
  }, [xs, map]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: xs re-creates the bead elements, re-apply the focus
  useEffect(() => {
    els.current.forEach((el, i) => {
      const on = focus === i + 1;
      el.classList.toggle("focus", on);
      if (on) {
        el.classList.remove("burst");
        void el.offsetWidth;
        el.classList.add("burst");
      }
    });
  }, [focus, xs]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: xs re-creates the bead elements, re-apply visibility
  useEffect(() => {
    for (const el of els.current) el.style.visibility = visible ? "" : "hidden";
  }, [visible, xs]);
  return null;
}
