// "Race" (port of v3 startRace/raceStep/raceEnd, map side): ghost Pip rides the fastest route, Pip rides ours, both
// scaled to their real durations over ~8 s, with a smoothed chase camera. Modern: the ghost hits each numbered
// crossing (the bead bursts and turns into an ✕, the ghost shakes, the fast route's risky glow throbs). Nature: Pip
// picks up a leaf for every street tree it passes (leaves fly to `leafTarget` if given). At the finish both riders
// park side by side with "1st" / "2nd" and the camera eases back to the whole trip.
// The ride bar is the app's: it gets live numbers through onProgress (~20 Hz) and the result through onEnd.
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { bikemap, type LatLng, type RouteResponse } from "../../api";
import { treesAlongList } from "../../derive";
import { PIP, type UiMode } from "../../theme";
import { defaultPadding, useBikeMap } from "../context";
import { clamp, easeIO, flip, measure, prefersReducedMotion } from "../geo";
import { zw } from "../style";
import { useCrossings } from "./beads";
import { isMobile, racing } from "./shared";

export type RaceProgress = {
  /** 0..1 along each route */
  fast: number;
  ours: number;
  /** Modern: risky crossings the ghost has hit so far (and which) */
  scares: number;
  hit: number[];
  /** Nature: trees passed so far by Pip (ours) and by the ghost (fast) */
  leaves: number;
  leavesFast: number;
  /** Modern: risky stretches Pip has ridden through on ours so far */
  oursHit: number;
};
export type RaceResult = RaceProgress & {
  mode: UiMode;
  /** ours minus fast, minutes (positive = ours is slower) */
  extraMin: number;
  /** risky stretches on ours (Modern) */
  oursRisky: number;
  /** total trees along each route (Nature) */
  treesOurs: number;
  treesFast: number;
  winner: "ghost" | "pip";
};

const LEAF =
  '<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15z"/><path d="M5 19l8-8" fill="none"/></svg>';
const T = 8000;

type Rider = { el: HTMLElement; img: HTMLImageElement; mk: maplibregl.Marker };
function rider(map: maplibregl.Map, ghost: boolean, ll: LatLng, ui: UiMode): Rider {
  const el = document.createElement("div");
  el.className = `bm-rider${ghost ? " ghost" : ""}`;
  const img = document.createElement("img");
  img.src = PIP[ui];
  img.alt = "";
  el.append(img);
  const mk = new maplibregl.Marker({
    element: el,
    anchor: "bottom",
    pitchAlignment: "viewport",
    rotationAlignment: "viewport",
  })
    .setLngLat(flip(ll))
    .addTo(map);
  return { el, img, mk };
}
function orient(map: maplibregl.Map, r: Rider, p: LatLng, ahead: LatLng) {
  const a = map.project(flip(p));
  const b = map.project(flip(ahead));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 0.5) return;
  const face = dx < 0 ? -1 : 1;
  const ang = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
  r.img.style.transform = `scaleX(${face}) rotate(${clamp(ang * 0.15, -6, 6)}deg)`;
}
const restart = (el: Element, cls: string) => {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};

/**
 * Runs while `running` is true (bump `runId` to restart); `route` is the visible mode's route.
 * Set running=false to stop and clean up (riders removed, beads restored, camera back to the trip).
 */
export function RaceLayer({
  running,
  runId = 0,
  route,
  leafTarget,
  onProgress,
  onEnd,
}: {
  running: boolean;
  runId?: number;
  route?: RouteResponse;
  /** element the leaves fly to (e.g. the ride bar's Pip counter) */
  leafTarget?: () => Element | null;
  onProgress?: (p: RaceProgress) => void;
  onEnd?: (r: RaceResult) => void;
}) {
  const { maps, ui, handle } = useBikeMap();
  const xs = useCrossings(ui === "modern" ? route : undefined);
  const green = useQuery({
    queryKey: ["bikemap", "green-layers"],
    queryFn: bikemap.greenLayers,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const cb = useRef({ onProgress, onEnd, leafTarget, xs, trees: green.data?.trees, route });
  cb.current = { onProgress, onEnd, leafTarget, xs, trees: green.data?.trees, route };

  const hasRoute = !!route;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a run is keyed by running/runId; the rest (route too) is read at start
  useEffect(() => {
    const route = cb.current.route;
    if (!running || !route) return;
    const mode = ui;
    const map = maps[mode];
    const rm = prefersReducedMotion();
    const { xs: crossings, trees: allTrees } = cb.current;
    const G = measure(route.fastest.coords);
    const Pm = measure(route.recommended.coords);
    const durG = route.fastest.duration_min;
    const durU = route.recommended.duration_min;
    const slower = Math.max(durU, durG) || 1;
    const tG = (T * durG) / slower;
    const tP = (T * durU) / slower;
    const trees = mode === "nature" ? treesAlongList(route.recommended, allTrees, 15) : [];
    const treesF = mode === "nature" ? treesAlongList(route.fastest, allTrees, 15) : [];
    const treesG = treesF.length;
    let tf = 0;
    // Modern: where ours runs through its own risky stretches (usually none), so Pip's counter is real too
    const oursBad =
      mode === "modern"
        ? route.recommended.segments
            .filter((s) => s.level === "bad" && s.coords.length)
            .map((s) => Pm.project(s.coords[Math.floor(s.coords.length / 2)] as LatLng).along)
            .sort((x, y) => x - y)
        : [];
    const st: RaceProgress = { fast: 0, ours: 0, scares: 0, hit: [], leaves: 0, leavesFast: 0, oursHit: 0 };
    const ghost = rider(map, true, route.fastest.coords[0] as LatLng, mode);
    const pip = rider(map, false, route.recommended.coords[0] as LatLng, mode);
    const beads = () => [...map.getContainer().querySelectorAll<HTMLElement>(".bm-xing")];
    for (const b of beads()) b.classList.remove("hit", "focus");
    racing.add(map);
    let ti = 0;
    let cam: LatLng | null = null;
    let done = false;
    let raf = 0;
    let lastEmit = 0;
    const timers: number[] = [];
    const flying = new Set<HTMLElement>();

    const a0 = route.fastest.coords[0] as LatLng;
    const b0 = route.recommended.coords[0] as LatLng;
    const mid0: LatLng = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
    const mob = isMobile();
    const sheetH =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bm-sheet-h")) || 260;
    const pad = mob
      ? { top: 0, bottom: sheetH, left: 0, right: 0 }
      : { top: 0, bottom: 0, left: 380, right: 0 };
    map.easeTo({
      center: flip(mid0),
      zoom: mob ? 15.6 : 16.1,
      padding: pad,
      duration: rm ? 0 : 450,
      easing: easeIO,
    });
    const t0 = performance.now() + (rm ? 0 : 450);

    const leafFly = (t: LatLng) => {
      st.leaves++;
      const target = cb.current.leafTarget?.();
      if (!target || rm || (st.leaves % 2 && trees.length > 60)) return; // keep particle count sane
      const rect = map.getContainer().getBoundingClientRect();
      const pt = map.project(flip(t));
      const to = target.getBoundingClientRect();
      const el = document.createElement("div");
      el.className = "bm-leaf";
      el.innerHTML = LEAF;
      el.style.left = `${rect.left + pt.x - 9}px`;
      el.style.top = `${rect.top + pt.y - 30}px`;
      document.body.appendChild(el);
      flying.add(el);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.transform = `translate(${to.left + 16 - (rect.left + pt.x)}px, ${to.top + 10 - (rect.top + pt.y - 30)}px) rotate(220deg) scale(.7)`;
          el.style.opacity = ".3";
        }),
      );
      timers.push(
        window.setTimeout(() => {
          el.remove();
          flying.delete(el);
        }, 820),
      );
    };

    const finish = () => {
      const extra = durU - durG;
      const first: "ghost" | "pip" = durG <= durU ? "ghost" : "pip";
      for (const [k, rd, dx] of [
        ["ghost", ghost, -20],
        ["pip", pip, 20],
      ] as const) {
        rd.mk.setOffset([dx, 0]);
        const c = document.createElement("span");
        c.className = "place";
        c.textContent = k === first ? "1st" : "2nd";
        rd.el.appendChild(c);
        rd.img.style.transform = `scaleX(${dx < 0 ? -1 : 1})`;
      }
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      // keep both finishing riders clear of the result bar
      const bar = document.querySelector(".bm-ride");
      const barTop = bar ? bar.getBoundingClientRect().top : innerHeight;
      const bottom = Math.max(defaultPadding().bottom ?? 90, innerHeight - barTop + 40);
      handle.fit([route.fastest.coords, route.recommended.coords], {
        duration: rm ? 0 : 1400,
        padding: { bottom },
      });
      cb.current.onEnd?.({
        ...st,
        hit: [...st.hit],
        mode,
        extraMin: Math.round(extra * 10) / 10,
        oursRisky: oursBad.length,
        treesOurs: trees.length,
        treesFast: treesG,
        winner: first,
      });
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (done) return;
      const t = now - t0;
      if (t < 0) return;
      const fg = rm ? 1 : clamp(t / tG);
      const fp = rm ? 1 : clamp(t / tP);
      const g = G.at(fg * G.total);
      const p = Pm.at(fp * Pm.total);
      ghost.mk.setLngLat(flip(g));
      pip.mk.setLngLat(flip(p));
      orient(map, ghost, g, G.at(fg * G.total + 15));
      orient(map, pip, p, Pm.at(fp * Pm.total + 15));
      // chase cam: midpoint of both riders, smoothed
      const mid: LatLng = [(g[0] + p[0]) / 2, (g[1] + p[1]) / 2];
      cam = cam ? [cam[0] + (mid[0] - cam[0]) * 0.08, cam[1] + (mid[1] - cam[1]) * 0.08] : mid;
      if (!map.isEasing() && !rm) map.jumpTo({ center: flip(cam) });
      if (mode === "modern") {
        for (const x of crossings)
          if (!st.hit.includes(x.n) && fg * G.total >= x.along - 6) {
            st.hit.push(x.n);
            st.scares++;
            restart(ghost.el, "shake");
            const b = beads().find((e) => e.dataset.n === String(x.n));
            if (b) {
              restart(b, "burst");
              b.classList.add("hit");
              const disc = b.querySelector(".disc");
              if (disc) disc.textContent = "✕";
            }
          }
        // the fast route's risky stretches throb while the ghost rides
        if (map.getLayer("fast-glow") && !rm) {
          const hot = (0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 3)) ** 2;
          map.setPaintProperty("fast-glow", "line-width", zw(7 + 4 * hot, 14 + 10 * hot, 28 + 18 * hot));
          map.setPaintProperty("fast-glow", "line-opacity", 0.3 + 0.45 * hot);
        }
      } else {
        while (ti < trees.length && (trees[ti]?.along ?? 0) <= fp * Pm.total) {
          leafFly((trees[ti] as { t: LatLng }).t);
          ti++;
        }
        while (tf < treesF.length && (treesF[tf]?.along ?? 0) <= fg * G.total) tf++;
        st.leavesFast = tf;
      }
      while (st.oursHit < oursBad.length && (oursBad[st.oursHit] ?? 0) <= fp * Pm.total + 6) st.oursHit++;
      st.fast = fg;
      st.ours = fp;
      if (now - lastEmit > 50 || (fg >= 1 && fp >= 1)) {
        lastEmit = now;
        cb.current.onProgress?.({ ...st, hit: [...st.hit] });
      }
      if (fg >= 1 && fp >= 1) {
        done = true;
        timers.push(window.setTimeout(finish, rm ? 0 : 350));
      }
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      for (const el of flying) el.remove();
      ghost.mk.remove();
      pip.mk.remove();
      racing.delete(map);
      try {
        if (map.getLayer("fast-glow")) map.setPaintProperty("fast-glow", "line-width", zw(7, 14, 28));
        map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
        if (!done) handle.fit([route.fastest.coords, route.recommended.coords], { duration: rm ? 0 : 1000 });
      } catch {
        // map removed
      }
      beads().forEach((b, i) => {
        b.classList.remove("hit", "burst");
        const disc = b.querySelector(".disc");
        if (disc) disc.textContent = b.dataset.n ?? String(i + 1);
      });
    };
  }, [running, runId, hasRoute, ui, maps, handle]);

  return null;
}
