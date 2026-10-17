// The map: two MapLibre maps (Modern + Nature basemaps, prototype v3) sharing one camera.
// A mode switch sweeps a seam across the screen to reveal the other map; 3D raises buildings and grows trees.
// Data layers are added by children via useMapLayers() (see ./context.ts and build/FOUNDATION.md).
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { LatLng } from "../api";
import { PIP, UI_MODES, type UiMode } from "../theme";
import { type BikeMapHandle, defaultPadding, type FitOptions, MapCtx, type MapPair } from "./context";
import { backOut, bboxOf, clamp, easeIO, easeOut, flip, prefersReducedMotion } from "./geo";
import { BUILDINGS_3D, buildStyle, LIGHT, loadBaseStyle, PAL, TREES_3D, TREES_FLAT } from "./style";

export type MapClick = {
  at: LatLng;
  point: { x: number; y: number };
  map: MlMap;
  mode: UiMode;
  originalEvent: MouseEvent;
};

type Props = {
  ui: UiMode;
  /** Tilted view: buildings rise, trees grow. */
  view3d?: boolean;
  /** Starting camera (the app normally calls handle.fit(route) once a route arrives). */
  initialView?: { center: LatLng; zoom: number };
  /** Click on the visible map. Layer clicks: use map.on("click", layerId, ...) in useMapLayers instead. */
  onClick?: (e: MapClick) => void;
  /** Right click (long-press on a phone). The old app opened the nearest street's card here. */
  onContextMenu?: (e: MapClick) => void;
  /** Fires once, when both maps have loaded. */
  onReady?: (handle: BikeMapHandle) => void;
  ref?: Ref<BikeMapHandle>;
  /** Layer components + map-aware overlays (controls, scale bar). Rendered once the maps have loaded. */
  children?: ReactNode;
};

export const PITCH_3D = 55;
const BEARING_3D: Record<UiMode, number> = { modern: -20, nature: 10 };
const CUPERTINO: { center: LatLng; zoom: number } = { center: [37.3245, -122.026], zoom: 14.6 };

export function MapLibreMap({
  ui,
  view3d = false,
  initialView = CUPERTINO,
  onClick,
  onContextMenu,
  onReady,
  ref,
  children,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const boxes = { modern: useRef<HTMLDivElement>(null), nature: useRef<HTMLDivElement>(null) };
  const seamLineRef = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<MapPair | null>(null);
  const [booted, setBooted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [credits, setCredits] = useState(false);

  // Mutable state the imperative API works on (no re-renders per frame).
  const S = useRef({
    maps: null as MapPair | null,
    seam: ui === "nature" ? 0 : 1, // left edge of the Nature map, as a fraction of the width
    seamRaf: 0,
    exK: view3d ? 1 : 0,
    exRaf: 0,
    syncing: false,
    trees: { modern: true, nature: true } as Record<UiMode, boolean>,
    lastFit: null as { lists: LatLng[][]; opts: FitOptions } | null,
  }).current;
  const cb = useRef({ onClick, onContextMenu, onReady });
  cb.current = { onClick, onContextMenu, onReady };
  const first = useRef({ ui, view3d, initialView });

  const visible = (m: UiMode, f = S.seam) => (m === "modern" ? f > 0.001 : f < 0.999);
  const active = (): MlMap | null => (S.maps ? S.maps[S.seam < 0.5 ? "nature" : "modern"] : null);

  function setSeam(f: number) {
    const was = S.seam;
    S.seam = clamp(f);
    const st = stageRef.current;
    if (!st) return;
    st.style.setProperty("--seam", `${S.seam * 100}%`);
    for (const m of UI_MODES) {
      const box = boxes[m].current;
      if (box) box.style.visibility = visible(m) ? "visible" : "hidden";
    }
    // a map coming back into view takes the current camera of the other
    if (S.maps)
      for (const m of UI_MODES)
        if (!visible(m, was) && visible(m)) {
          const o = S.maps[m === "modern" ? "nature" : "modern"];
          S.syncing = true;
          S.maps[m].jumpTo({
            center: o.getCenter(),
            zoom: o.getZoom(),
            bearing: o.getBearing(),
            pitch: o.getPitch(),
          });
          S.syncing = false;
          S.maps[m].resize();
        }
  }

  function animateSeam(to: number, ms = 900): Promise<void> {
    cancelAnimationFrame(S.seamRaf);
    const from = S.seam;
    const line = seamLineRef.current;
    if (prefersReducedMotion() || ms <= 0 || from === to) {
      setSeam(to);
      return Promise.resolve();
    }
    line?.classList.add("on");
    const t0 = performance.now();
    return new Promise((res) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        setSeam(from + (to - from) * easeIO(t));
        if (t < 1) S.seamRaf = requestAnimationFrame(step);
        else {
          if (to <= 0 || to >= 1) line?.classList.remove("on");
          res();
        }
      };
      S.seamRaf = requestAnimationFrame(step);
    });
  }

  // 3D: buildings fade in and rise out of the ground with an overshoot; trees grow on a per-tree stagger.
  function setExtrude(k: number) {
    S.exK = k;
    if (!S.maps) return;
    const lt = ["max", 0, ["min", 1, ["/", ["-", k, ["*", ["get", "s"], 0.5]], 0.5]]];
    const grow = ["interpolate", ["linear"], lt, 0, 0, 0.7, 1.12, 1, 1];
    const vis = k > 0.001 ? "visible" : "none";
    for (const mode of UI_MODES) {
      const m = S.maps[mode];
      if (m.getLayer(BUILDINGS_3D)) {
        const kb = clamp(k / 0.8);
        const rise = 1 - backOut(kb);
        m.setPaintProperty(BUILDINGS_3D, "fill-extrusion-translate", [0, Math.round(22 * rise * 10) / 10]);
        m.setPaintProperty(BUILDINGS_3D, "fill-extrusion-opacity", Math.min(1, kb * 2.2) * 0.92);
        m.setLayoutProperty(BUILDINGS_3D, "visibility", vis);
      }
      if (m.getLayer(TREES_3D)) {
        m.setPaintProperty(TREES_3D, "fill-extrusion-height", ["+", 2.5, ["*", ["get", "h"], grow]], {
          validate: false,
        });
        m.setPaintProperty(TREES_3D, "fill-extrusion-opacity", Math.min(1, k * 4) * 0.95, {
          validate: false,
        });
        m.setLayoutProperty(TREES_3D, "visibility", S.trees[mode] ? vis : "none");
      }
      if (m.getLayer(TREES_FLAT))
        m.setLayoutProperty(TREES_FLAT, "visibility", k < 0.99 && S.trees[mode] ? "visible" : "none");
    }
  }
  // per-frame data-driven updates can leave a tile behind: re-apply a plain final expression once settled
  function settleExtrude(n = 0) {
    if (S.exK < 0.999 || !S.maps) return;
    for (const mode of UI_MODES) {
      const m = S.maps[mode];
      if (m.getLayer(TREES_3D))
        m.setPaintProperty(TREES_3D, "fill-extrusion-height", [
          "+",
          2.5,
          ["*", ["get", "h"], n % 2 ? 1.0001 : 1],
        ]);
    }
    if (n < 2) setTimeout(() => settleExtrude(n + 1), 350);
  }
  function animateExtrude(to: number) {
    cancelAnimationFrame(S.exRaf);
    const from = S.exK;
    if (prefersReducedMotion()) {
      setExtrude(to);
      settleExtrude();
      return;
    }
    const ms = to > from ? 1400 : 500;
    const ease = to > from ? (t: number) => t : easeOut;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      setExtrude(from + (to - from) * ease(t));
      if (t < 1) S.exRaf = requestAnimationFrame(step);
      else settleExtrude();
    };
    S.exRaf = requestAnimationFrame(step);
  }

  // v3's computeCams: frame the route in the free area (clear of the sheet), tilted or flat. Tilted views zoom in
  // +0.7, then step back until every projected route point fits, then recentre on the projected bounds.
  function camFor(m: MlMap, lists: LatLng[][], pitch: number, bearing: number, opts: FitOptions = {}) {
    const mobile = innerWidth < 700;
    const sheetH =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bm-sheet-h")) || 260;
    const pad = {
      ...(mobile
        ? { top: 120, bottom: sheetH + 70, left: 30, right: 70 }
        : { top: 120, bottom: 90, left: 470, right: 170 }),
      ...opts.padding,
    };
    const ls = (mobile && lists.length > 1 ? [lists[lists.length - 1] as LatLng[]] : lists).filter(
      (l) => l.length,
    );
    if (!ls.length) return null;
    const bb = bboxOf(ls);
    const c =
      m.cameraForBounds(bb, { padding: pad, bearing }) ?? m.cameraForBounds(bb, { padding: 10, bearing });
    if (!c?.center || c.zoom === undefined) return null;
    const pts = ls.flat();
    const W = m.getContainer().clientWidth;
    const H = m.getContainer().clientHeight;
    const saved = {
      center: m.getCenter(),
      zoom: m.getZoom(),
      bearing: m.getBearing(),
      pitch: m.getPitch(),
      padding: m.getPadding(),
    };
    const was = S.syncing;
    S.syncing = true; // probing jumps must not drive the other map
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const maxZ = opts.maxZoom ?? 17.5;
    let cam = {
      center: c.center,
      zoom: Math.min(maxZ, c.zoom + (pitch ? 0.7 : 0)),
      bearing,
      pitch,
    };
    for (let k = 0; k < 14; k++) {
      m.jumpTo(cam);
      const ok = pts.every((q) => {
        const p = m.project(flip(q));
        return (
          p.x > pad.left - 40 && p.x < W - pad.right + 60 && p.y > pad.top - 30 && p.y < H - pad.bottom + 30
        );
      });
      if (ok) break;
      cam = { ...cam, zoom: cam.zoom - 0.1 };
    }
    m.jumpTo(cam);
    const xs = pts.map((q) => m.project(flip(q)));
    const cx = (Math.min(...xs.map((p) => p.x)) + Math.max(...xs.map((p) => p.x))) / 2;
    const cy = (Math.min(...xs.map((p) => p.y)) + Math.max(...xs.map((p) => p.y))) / 2;
    const tx = (pad.left + W - pad.right) / 2;
    const ty = (pad.top + H - pad.bottom) / 2;
    const cp = m.project(cam.center);
    const ctr = m.unproject([cp.x + (cx - tx), cp.y + (cy - ty)]);
    m.jumpTo(saved);
    S.syncing = was;
    return { ...cam, center: ctr };
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: built once; methods read the mutable S
  const handle = useMemo<BikeMapHandle>(
    () => ({
      maps: () => S.maps,
      active,
      each(fn) {
        if (S.maps) for (const m of UI_MODES) fn(S.maps[m], m);
      },
      fit(lists, opts = {}) {
        const m = active();
        const pts = lists.filter((l) => l.length);
        if (!m || !pts.length) return;
        S.lastFit = { lists: pts, opts };
        if (S.exK > 0.5 || m.getPitch() > 5) {
          const cam = camFor(m, pts, m.getPitch(), m.getBearing(), opts);
          if (cam) {
            m.easeTo({
              ...cam,
              padding: { top: 0, bottom: 0, left: 0, right: 0 },
              duration: prefersReducedMotion() ? 0 : (opts.duration ?? 1200),
              easing: easeIO,
            });
            return;
          }
        }
        m.fitBounds(bboxOf(pts), {
          padding: { ...defaultPadding(), ...opts.padding },
          pitch: m.getPitch(),
          bearing: m.getBearing(),
          maxZoom: opts.maxZoom ?? 17,
          duration: prefersReducedMotion() ? 0 : (opts.duration ?? 1200),
          easing: easeIO,
        });
      },
      flyTo(at, zoom) {
        active()?.flyTo({
          center: flip(at),
          zoom: zoom ?? Math.max(active()?.getZoom() ?? 15, 15.5),
          duration: prefersReducedMotion() ? 0 : 1200,
          essential: true,
        });
      },
      focusOn(at, opts = {}) {
        const m = active();
        if (!m) return;
        m.easeTo({
          center: flip(at),
          zoom: opts.zoom ?? Math.max(m.getZoom(), 17),
          pitch: m.getPitch(),
          bearing: m.getBearing(),
          padding: { ...defaultPadding(), ...opts.padding },
          duration: prefersReducedMotion() ? 0 : (opts.duration ?? 900),
          easing: easeIO,
        });
      },
      zoomIn: () => active()?.zoomIn(),
      zoomOut: () => active()?.zoomOut(),
      setSeam,
      animateSeam,
      extrude: () => S.exK,
      setTreesEnabled(mode, on) {
        S.trees[mode] = on;
        setExtrude(S.exK);
      },
    }),
    [],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  // Create both maps once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; later props are applied by the effects below
  useEffect(() => {
    let dead = false;
    const made: MlMap[] = [];
    const { ui: ui0, view3d: v3d, initialView: iv } = first.current;
    setSeam(ui0 === "nature" ? 0 : 1);
    loadBaseStyle()
      .then(async (base) => {
        if (dead) return;
        const pair = {} as MapPair;
        for (const mode of UI_MODES) {
          const container = boxes[mode].current;
          if (!container) return;
          const m = new maplibregl.Map({
            container,
            style: buildStyle(base, mode, { pitch3d: v3d }),
            center: flip(iv.center),
            zoom: iv.zoom,
            pitch: v3d ? PITCH_3D : 0,
            bearing: v3d ? BEARING_3D[ui0] : 0,
            maxPitch: 70,
            attributionControl: false,
            fadeDuration: 150,
            canvasContextAttributes: { antialias: true },
          });
          made.push(m);
          pair[mode] = m;
        }
        await Promise.all(made.map((m) => new Promise((r) => m.once("load", r))));
        if (dead) return;
        for (const mode of UI_MODES) {
          const m = pair[mode];
          m.setLight(LIGHT);
          // one camera, two maps: whichever moves drives the other (only while the other is on screen)
          const other = mode === "modern" ? "nature" : "modern";
          m.on("move", () => {
            if (S.syncing || !visible(other)) return;
            S.syncing = true;
            pair[other].jumpTo({
              center: m.getCenter(),
              zoom: m.getZoom(),
              bearing: m.getBearing(),
              pitch: m.getPitch(),
            });
            S.syncing = false;
          });
          for (const type of ["click", "contextmenu"] as const)
            m.on(type, (e) => {
              if (m !== active()) return;
              // layer handlers (street / route picks) run in the same dispatch and call e.preventDefault()
              // when they consume the click; wait for them so a hit never also opens the "Start here" popup
              queueMicrotask(() => {
                if (e.defaultPrevented) return;
                const fn = type === "click" ? cb.current.onClick : cb.current.onContextMenu;
                fn?.({
                  at: [e.lngLat.lat, e.lngLat.lng],
                  point: e.point,
                  map: m,
                  mode,
                  originalEvent: e.originalEvent,
                });
              });
            });
        }
        S.maps = pair;
        setExtrude(S.exK);
        if (S.exK) settleExtrude();
        setMaps(pair);
        cb.current.onReady?.(handle);
        // reveal once the visible map has drawn (no blank paper behind a full UI)
        const a = active();
        const go = () => {
          if (dead) return;
          setBooted(true);
          // overlays marked .bm-ui fade in now (see map.css)
          stageRef.current?.closest<HTMLElement>(".bm-app")?.setAttribute("data-ready", "");
        };
        a?.once("idle", go);
        setTimeout(go, 6000);
      })
      .catch((err: unknown) => {
        console.warn("[bikemap] basemap failed to load", err);
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      cancelAnimationFrame(S.seamRaf);
      cancelAnimationFrame(S.exRaf);
      S.maps = null;
      for (const m of made) m.remove();
    };
  }, []);

  // Mode switch: sweep the seam.
  const lastUi = useRef(ui);
  // biome-ignore lint/correctness/useExhaustiveDependencies: animateSeam reads mutable state
  useEffect(() => {
    if (lastUi.current === ui) return;
    lastUi.current = ui;
    void animateSeam(ui === "nature" ? 0 : 1, 900);
  }, [ui]);

  // 2D / 3D.
  const last3d = useRef(view3d);
  // biome-ignore lint/correctness/useExhaustiveDependencies: animateExtrude reads mutable state
  useEffect(() => {
    if (last3d.current === view3d || !maps) return;
    last3d.current = view3d;
    animateExtrude(view3d ? 1 : 0);
    const m = active();
    if (!m) return;
    const pitch = view3d ? PITCH_3D : 0;
    const bearing = view3d ? BEARING_3D[ui] : 0;
    // reframe the last fitted route for the new tilt (v3 computeCams), else just tilt in place
    const lf = S.lastFit;
    const cam = lf ? camFor(m, lf.lists, pitch, bearing, lf.opts) : null;
    m.easeTo({
      ...(cam ?? { pitch, bearing }),
      ...(cam ? { padding: { top: 0, bottom: 0, left: 0, right: 0 } } : {}),
      duration: prefersReducedMotion() ? 0 : 1400,
      easing: easeIO,
    });
  }, [view3d, maps]);

  const ctx = useMemo(() => (maps ? { maps, ui, handle, view3d } : null), [maps, ui, handle, view3d]);

  return (
    <>
      <div className="bm-stage" ref={stageRef}>
        <div className="bm-map" data-mode="modern" ref={boxes.modern} />
        <div className="bm-map bm-map-nature" data-mode="nature" ref={boxes.nature} />
        <div className="bm-seam" ref={seamLineRef} aria-hidden="true" />
      </div>
      <div className={`bm-boot${booted || failed ? " done" : ""}`} aria-hidden="true">
        <div>
          <svg viewBox="0 0 96 96" role="presentation">
            <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="4" />
            <path
              d="M48 4a44 44 0 0 1 44 44"
              fill="none"
              stroke={PAL[ui].ours}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <img src={PIP[ui]} alt="" />
        </div>
      </div>
      {failed && <div className="bm-map-error">Map tiles unavailable. Check the connection and reload.</div>}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the ⓘ button inside is the keyboard path */}
      <div
        className={`bm-attrib${credits ? " open" : ""}`}
        onClick={(e) => {
          if (!(e.target as Element).closest("a")) setCredits((o) => !o);
        }}
      >
        <button type="button" className="ic" aria-label="Credits" aria-expanded={credits}>
          ⓘ
        </button>
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{" "}
        ·{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>{" "}
        · Photos © Google Street View (private demo) · Scores: Claude reading street photos
      </div>
      {ctx && <MapCtx.Provider value={ctx}>{children}</MapCtx.Provider>}
    </>
  );
}
