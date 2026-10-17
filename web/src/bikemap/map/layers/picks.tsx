// Tap a street (port of v3 wireClicks): a tap within 8 px of a route segment or a scored street emits a "street"
// pick with that stretch's score and reasons (route segments keep their OWN reasons; the network only lends a
// name). The tap is consumed (e.preventDefault), so MapLibreMap's onClick (the "Start here / Go here" popup) only
// fires on empty map. In Nature the pick carries the nearest Street View photo on the same street.
import type { MapMouseEvent } from "maplibre-gl";
import { useRef } from "react";
import type { LatLng, Level, NetworkResponse, RoutePhoto } from "../../api";
import { useMapLayers } from "../context";
import { dist } from "../geo";
import { useNetworks } from "./network";
import { type MapPick, nameOf } from "./shared";

const IDS = ["rec-hit", "fast-hit", "net"] as const;

function nearestNet(net: NetworkResponse | undefined, ll: LatLng, maxM: number) {
  let best: NetworkResponse["segments"][number] | null = null;
  let bd = maxM;
  for (const g of net?.segments ?? [])
    for (const c of g.coords) {
      const d = dist(c, ll);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
  return best;
}

function nearestPhoto(photos: RoutePhoto[], ll: LatLng, m: number) {
  let best: RoutePhoto | undefined;
  let bd = m;
  for (const p of photos)
    for (const c of [p.at, ...p.detail.coords]) {
      const d = dist(c, ll);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  return best;
}

export function StreetPicks({
  photos,
  enabled = true,
  onPick,
}: {
  /** Nature's route photos (a street pick on the same street shows its photo) */
  photos?: RoutePhoto[];
  /** false while Race/Listen run */
  enabled?: boolean;
  onPick?: (p: MapPick) => void;
}) {
  const { safe } = useNetworks();
  const st = useRef({ photos, enabled, onPick, safe });
  st.current = { photos, enabled, onPick, safe };

  useMapLayers((map, mode) => {
    const click = (e: MapMouseEvent) => {
      const s = st.current;
      if (!s.enabled) return;
      const ids = IDS.filter((id) => map.getLayer(id));
      if (!ids.length) return;
      const { x, y } = e.point;
      const hits = map.queryRenderedFeatures(
        [
          [x - 8, y - 8],
          [x + 8, y + 8],
        ],
        { layers: ids },
      );
      if (!hits.length) return;
      e.preventDefault();
      hits.sort(
        (a, b) =>
          IDS.indexOf(a.layer.id as (typeof IDS)[number]) - IDS.indexOf(b.layer.id as (typeof IDS)[number]),
      );
      const f = hits[0] as (typeof hits)[number];
      const p = f.properties as { reasons?: string; score?: number; level?: Level };
      const at: LatLng = [e.lngLat.lat, e.lngLat.lng];
      const own: string[] = JSON.parse(p.reasons || "[]");
      let title: string;
      let reasons: string[];
      if (f.layer.id === "net") {
        title = nameOf(own) ?? "This stretch";
        reasons = own;
      } else {
        const netHit = hits.find((h) => h.layer.id === "net");
        const nrs: string[] = netHit
          ? JSON.parse((netHit.properties as { reasons?: string }).reasons || "[]")
          : (nearestNet(s.safe, at, 30)?.reasons ?? []);
        title = nameOf(own) ?? nameOf(nrs) ?? "This stretch";
        reasons = own.filter((r) => !r.includes(" · "));
      }
      let photo: RoutePhoto | undefined;
      if (mode === "nature" && s.photos) {
        const k = nearestPhoto(s.photos, at, 90);
        if (k?.detail.photo && k.detail.name === title) photo = k;
      }
      s.onPick?.({
        kind: "street",
        at,
        mode,
        source: f.layer.id === "net" ? "net" : f.layer.id === "rec-hit" ? "rec" : "fast",
        title,
        score: Number(p.score ?? 0),
        level: p.level ?? "ok",
        reasons,
        photo,
      });
    };
    // pointer cursor over anything tappable (one query per frame at most)
    let raf = 0;
    let lastPt = { x: 0, y: 0 };
    const move = (e: MapMouseEvent) => {
      lastPt = e.point;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ids = IDS.filter((id) => map.getLayer(id));
        const on =
          ids.length > 0 &&
          map.queryRenderedFeatures(
            [
              [lastPt.x - 6, lastPt.y - 6],
              [lastPt.x + 6, lastPt.y + 6],
            ],
            { layers: ids },
          ).length > 0;
        map.getCanvas().style.cursor = on ? "pointer" : "";
      });
    };
    map.on("click", click);
    map.on("mousemove", move);
    return () => {
      cancelAnimationFrame(raf);
      map.off("click", click);
      map.off("mousemove", move);
    };
  }, []);
  return null;
}
