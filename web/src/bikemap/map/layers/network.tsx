// The street network (port of v3 addData): every scored street as a coloured EDGE under the white road core, so the
// street names stay readable. Modern shows traffic stress (calm / busy / risky), Nature shows greenery (leafy / some
// green). Nature also gets a soft noise haze over loud arterials (the "Quiet" chip toggles it).
import { useQuery } from "@tanstack/react-query";
import type { ExpressionSpecification } from "maplibre-gl";
import { bikemap, type NetworkResponse, type Segment } from "../../api";
import { addLayerOnce, setGeoJSON, useMapLayers } from "../context";
import { fc, line } from "../geo";
import { PAL, slot, zw } from "../style";

export const NET_LAYER = "net";
const LOUD = (rs: string[]) =>
  rs.some((r) => /40 mph|Expressway|four-lane|six-lane|five lanes|4 or more lanes|arterial/i.test(r));

/** Both networks, cached forever (same query keys the app may prefetch). */
export function useNetworks() {
  const safe = useQuery({
    queryKey: ["bikemap", "network", "safe"],
    queryFn: () => bikemap.network("safe"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const green = useQuery({
    queryKey: ["bikemap", "network", "green"],
    queryFn: () => bikemap.network("green"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { safe: safe.data, green: green.data };
}

const netFC = (n?: NetworkResponse) =>
  fc(
    (n?.segments ?? []).map((s: Segment, i) =>
      line(s.coords, { i, level: s.level, score: s.score, reasons: JSON.stringify(s.reasons) }),
    ),
  );

/** `greenery` / `quiet` are Nature's chips: they show/hide the green street edges and the noise haze on the Nature map. */
export function NetworkLayer({ greenery = true, quiet = true }: { greenery?: boolean; quiet?: boolean }) {
  const { safe, green } = useNetworks();
  useMapLayers(
    (map, mode) => {
      const P = PAL[mode];
      const net = mode === "modern" ? safe : green;
      if (!net) return undefined;
      setGeoJSON(map, "net", netFC(net), { tolerance: 0.4 });
      const W = (lv: [number, number, number]): ExpressionSpecification => [
        "match",
        ["get", "level"],
        "bad",
        lv[0],
        "ok",
        lv[1],
        lv[2],
      ];
      addLayerOnce(
        map,
        {
          id: NET_LAYER,
          type: "line",
          source: "net",
          layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["-", 1, ["get", "score"]] },
          paint:
            mode === "modern"
              ? {
                  "line-color": ["match", ["get", "level"], "good", P.good, "ok", P.ok, P.bad],
                  "line-opacity": ["match", ["get", "level"], "good", 0.35, "ok", 0.85, 1],
                  "line-width": [
                    "interpolate",
                    ["exponential", 1.6],
                    ["zoom"],
                    12,
                    W([4, 3, 1.5]),
                    15,
                    W([20, 15, 8.5]),
                    18,
                    W([48, 34, 22]),
                  ],
                }
              : {
                  "line-color": [
                    "match",
                    ["get", "level"],
                    "good",
                    "#86B85E",
                    "ok",
                    "#CBC291",
                    "rgba(0,0,0,0)",
                  ],
                  "line-opacity": ["match", ["get", "level"], "good", 0.9, 0.7],
                  "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 12, 2.5, 15, 13, 18, 30],
                },
        },
        slot(map, "roadCore"),
      );
      // noise haze over loud roads (from the traffic network), Nature only
      if (mode === "nature" && safe) {
        setGeoJSON(map, "noise", fc(safe.segments.filter((s) => LOUD(s.reasons)).map((s) => line(s.coords))));
        addLayerOnce(
          map,
          {
            id: "noise",
            type: "line",
            source: "noise",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#C9B38E",
              "line-opacity": 0.42,
              "line-width": zw(8, 46, 150),
              "line-blur": zw(6, 30, 90),
            },
          },
          slot(map, "roads"),
        );
      }
      return undefined;
    },
    [safe, green],
  );
  // visibility toggles (cheap; no data reload)
  useMapLayers(
    (map, mode) => {
      if (mode !== "nature") return undefined;
      const v = (on: boolean) => (on ? "visible" : "none");
      if (map.getLayer(NET_LAYER)) map.setLayoutProperty(NET_LAYER, "visibility", v(greenery));
      if (map.getLayer("noise")) map.setLayoutProperty("noise", "visibility", v(quiet));
      return undefined;
    },
    [greenery, quiet, safe, green],
  );
  return null;
}
