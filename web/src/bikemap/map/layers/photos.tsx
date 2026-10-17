// Street View photo pins (port of v3 addPhotoPins/syncPins), Nature map only. MapLibre clusters the points on its
// worker; the HTML markers are keyed (p<i> / c<cluster_id>) and only touched when the set changes. A pin that splits
// flies out of the cluster it came from, pins that merge fly into the new cluster. Tapping a cluster zooms into it,
// tapping a pin emits a "photo" pick. Pins hide while the route draws and pop in one by one when it is done.
import maplibregl, { type GeoJSONFeature, type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { LatLng, RoutePhoto } from "../../api";
import { useBikeMap } from "../context";
import { dist, easeIO, flip, prefersReducedMotion } from "../geo";
import { type MapPick, onDraw } from "./shared";

type Pin = { el: HTMLElement; pi: HTMLElement; ll: [number, number]; mk: maplibregl.Marker };

export function PhotoPins({
  photos,
  ends = [],
  visible = true,
  focus = null,
  onPick,
}: {
  photos?: RoutePhoto[];
  /** trip start / end: pins within ~60 m of them are skipped so they never cover the markers */
  ends?: (LatLng | undefined)[];
  visible?: boolean;
  /** index of the focused photo (its pin grows), or null */
  focus?: number | null;
  onPick?: (p: MapPick) => void;
}) {
  const { maps } = useBikeMap();
  const m = maps.nature;
  const cb = useRef(onPick);
  cb.current = onPick;
  const S = useRef({ pins: new Map<string, Pin>(), key: "", hidden: false, photos: photos ?? [] }).current;
  S.photos = photos ?? [];

  // source + layer once; the render hook keeps the HTML markers in step with the clusters
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only per map; data is pushed by the next effect
  useEffect(() => {
    const rm = prefersReducedMotion();
    if (!m.getSource("pins"))
      m.addSource("pins", {
        type: "geojson",
        cluster: true,
        clusterRadius: 58,
        clusterMaxZoom: 17,
        clusterProperties: {
          src: [
            ["coalesce", ["accumulated"], ["get", "src"]],
            ["get", "src"],
          ],
        },
        data: { type: "FeatureCollection", features: [] },
      });
    if (!m.getLayer("pins-keep"))
      // keeps the clustered tiles live (an invisible layer)
      m.addLayer({
        id: "pins-keep",
        type: "circle",
        source: "pins",
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });

    const make = (k: string, f: GeoJSONFeature): Pin => {
      const p = f.properties as {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
        i?: number;
        src: string;
      };
      const ll = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const el = document.createElement("div");
      el.className = `bm-ppin${p.cluster ? "" : " one"}`;
      el.dataset.key = k;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", p.cluster ? `${p.point_count} street photos` : "Street photo");
      const pi = document.createElement("div");
      pi.className = "pi";
      const img = document.createElement("img");
      img.alt = "";
      img.src = p.src;
      img.loading = "lazy";
      const b = document.createElement("b");
      b.textContent = p.point_count ? String(p.point_count) : "";
      pi.append(img, b);
      el.append(pi);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (p.cluster && p.cluster_id !== undefined)
          void (m.getSource("pins") as GeoJSONSource)
            .getClusterExpansionZoom(p.cluster_id)
            .then((z) => m.easeTo({ center: ll, zoom: z + 0.3, duration: rm ? 0 : 500, easing: easeIO }));
        else if (p.i !== undefined) {
          const ph = S.photos[p.i];
          if (ph) cb.current?.({ kind: "photo", at: ph.at, mode: "nature", index: p.i, photo: ph });
        }
      });
      const mk = new maplibregl.Marker({ element: el, anchor: "center", pitchAlignment: "viewport" })
        .setLngLat(ll)
        .addTo(m);
      if (S.hidden) pi.style.transform = "scale(0)";
      return { el, pi, ll, mk };
    };

    const sync = () => {
      if (!m.getSource("pins") || !m.isSourceLoaded("pins")) return;
      const seen = new Map<string, GeoJSONFeature>();
      for (const f of m.querySourceFeatures("pins")) {
        const p = f.properties as { cluster?: boolean; cluster_id?: number; i?: number };
        const k = p.cluster ? `c${p.cluster_id}` : `p${p.i}`;
        if (!seen.has(k)) seen.set(k, f);
      }
      const key = [...seen.keys()].sort().join("|");
      if (key === S.key) return;
      S.key = key;
      const gone = [...S.pins.entries()].filter(([k]) => !seen.has(k));
      const born: Pin[] = [];
      for (const [k, f] of seen) {
        if (S.pins.has(k)) continue;
        const o = make(k, f);
        S.pins.set(k, o);
        born.push(o);
      }
      const px = (ll: [number, number]) => m.project(ll);
      const near = (q: { x: number; y: number }, list: { x: number; y: number }[]) => {
        let b: { x: number; y: number } | null = null;
        let bd = 140;
        for (const r of list) {
          const d = Math.hypot(r.x - q.x, r.y - q.y);
          if (d < bd) {
            bd = d;
            b = r;
          }
        }
        return b;
      };
      const goneQ = gone.map(([, g]) => px(g.ll));
      const bornQ = born.map((b) => px(b.ll));
      born.forEach((b, i) => {
        if (S.hidden || rm) return;
        const q = bornQ[i] as { x: number; y: number };
        const from = near(q, goneQ);
        b.pi.style.transition = "none";
        b.pi.style.transform = from
          ? `translate(${from.x - q.x}px,${from.y - q.y}px) scale(.85)`
          : "scale(.4)";
        b.pi.style.opacity = from ? "1" : "0";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            b.pi.style.transition = "";
            b.pi.style.transform = "";
            b.pi.style.opacity = "";
          }),
        );
      });
      gone.forEach(([k, g], i) => {
        S.pins.delete(k);
        const r = goneQ[i] as { x: number; y: number };
        const to = near(r, bornQ);
        g.el.style.pointerEvents = "none";
        g.el.style.zIndex = "0";
        g.pi.style.transform = to ? `translate(${to.x - r.x}px,${to.y - r.y}px) scale(.7)` : "scale(.4)";
        g.pi.style.opacity = "0";
        setTimeout(() => g.mk.remove(), rm ? 0 : 280);
      });
    };

    const hide = () => {
      S.hidden = true;
      for (const [, o] of S.pins) {
        o.pi.style.transition = "none";
        o.pi.style.transform = "scale(0)";
      }
    };
    const pop = () => {
      S.hidden = false;
      let i = 0;
      for (const [, o] of S.pins) {
        const d = rm ? 0 : 70 * i++;
        setTimeout(() => {
          o.pi.style.transition = "transform .42s var(--bm-spring), opacity .2s";
          o.pi.style.transform = "";
          setTimeout(() => {
            o.pi.style.transition = "";
          }, 450);
        }, d);
      }
    };
    const off = onDraw(m, (phase) => {
      if (phase === "start") hide();
      else if (phase === "done") pop();
    });
    m.on("render", sync);
    return () => {
      off();
      m.off("render", sync);
      for (const [, o] of S.pins) o.mk.remove();
      S.pins.clear();
      S.key = "";
      try {
        if (m.getLayer("pins-keep")) m.removeLayer("pins-keep");
        if (m.getSource("pins")) m.removeSource("pins");
      } catch {
        // map already removed
      }
    };
  }, [m]);

  const endKey = ends.map((e) => e?.join() ?? "").join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: ends are keyed by endKey
  useEffect(() => {
    const src = m.getSource("pins") as GeoJSONSource | undefined;
    const clear = (p: RoutePhoto) => ends.every((e) => !e || dist(e, p.at) > 60);
    src?.setData({
      type: "FeatureCollection",
      features: (photos ?? []).flatMap((p, i) =>
        p.detail.photo && clear(p)
          ? [
              {
                type: "Feature" as const,
                properties: { i, src: p.detail.photo.url },
                geometry: { type: "Point" as const, coordinates: flip(p.at) },
              },
            ]
          : [],
      ),
    });
    m.triggerRepaint();
  }, [photos, m, endKey]);

  useEffect(() => {
    m.getContainer().classList.toggle("bm-pins-off", !visible);
  }, [visible, m]);

  useEffect(() => {
    for (const [k, o] of S.pins) o.el.classList.toggle("focus", focus !== null && k === `p${focus}`);
  }, [focus, S]);
  return null;
}
