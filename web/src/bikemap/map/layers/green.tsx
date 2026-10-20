// Parks, water and street trees (port of v3 addData, "Paper Atlas"): parks get a fine diagonal hatch, water a thin
// shoreline. Trees are pale flat dots in Modern and leafy flat canopies in Nature; in 3D both grow into little hex
// canopies (layer TREES_3D, grown by the 3D toggle in MapLibreMap). Nature's "Greenery" chip hides the park hatch,
// "Shade" hides the trees.
import { useQuery } from "@tanstack/react-query";
import type { Map as MlMap } from "maplibre-gl";
import { bikemap, type LatLng } from "../../api";
import { addLayerOnce, setGeoJSON, useBikeMap, useMapLayers } from "../context";
import { fc, point, poly, rad } from "../geo";
import { PAL, slot, TREES_3D, TREES_FLAT } from "../style";

function hatchImage(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const x = c.getContext("2d");
  if (!x) return null;
  x.strokeStyle = color;
  x.lineWidth = 1.6;
  x.beginPath();
  for (let k = -12; k <= 12; k += 6) {
    x.moveTo(k, 12);
    x.lineTo(k + 12, 0);
  }
  x.stroke();
  return { width: 12, height: 12, data: new Uint8Array(x.getImageData(0, 0, 12, 12).data.buffer) };
}

/** A small hexagonal canopy around a tree; h = height (m), s = growth stagger 0..1 (see MapLibreMap setExtrude). */
function treeHex([la, ln]: LatLng, i: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const r = 4.2 + (i % 3) * 0.8;
  const dLa = r / 111320;
  const dLn = r / (111320 * Math.cos(rad(la)));
  const ring: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ring.push([ln + Math.cos(a) * dLn, la + Math.sin(a) * dLa]);
  }
  return {
    type: "Feature",
    properties: { h: 8 + ((i * 7919) % 5), s: (i * 0.6180339) % 1 },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

const vis = (on: boolean) => (on ? "visible" : "none");
function setVis(map: MlMap, ids: string[], on: boolean) {
  for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
}

export function GreenLayers({ greenery = true, shade = true }: { greenery?: boolean; shade?: boolean }) {
  const { handle } = useBikeMap();
  const q = useQuery({
    queryKey: ["bikemap", "green-layers"],
    queryFn: bikemap.greenLayers,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const G = q.data;

  useMapLayers(
    (map, mode) => {
      if (!G) return undefined;
      const P = PAL[mode];
      const roads = slot(map, "roads");
      const labels = slot(map, "labels");
      if (!map.hasImage("hatch")) {
        const img = hatchImage(P.hatch);
        if (img) map.addImage("hatch", img);
      }
      setGeoJSON(map, "g-parks", fc(G.parks.map((r) => poly(r))));
      setGeoJSON(map, "g-water", fc(G.water.map((r) => poly(r))));
      addLayerOnce(
        map,
        {
          id: "g-parks",
          type: "fill",
          source: "g-parks",
          paint: { "fill-color": P.park, "fill-opacity": P.gPark },
        },
        roads,
      );
      if (map.getSource("openmaptiles"))
        addLayerOnce(
          map,
          {
            id: "park-hatch",
            type: "fill",
            source: "openmaptiles",
            "source-layer": "park",
            paint: { "fill-pattern": "hatch", "fill-opacity": P.hatchOp },
          },
          roads,
        );
      addLayerOnce(
        map,
        {
          id: "g-parks-hatch",
          type: "fill",
          source: "g-parks",
          paint: { "fill-pattern": "hatch", "fill-opacity": P.hatchOp },
        },
        roads,
      );
      addLayerOnce(
        map,
        { id: "g-water", type: "fill", source: "g-water", paint: { "fill-color": P.water } },
        roads,
      );
      if (map.getSource("openmaptiles"))
        addLayerOnce(
          map,
          {
            id: "shore",
            type: "line",
            source: "openmaptiles",
            "source-layer": "water",
            paint: { "line-color": P.shore, "line-width": 1 },
          },
          roads,
        );
      addLayerOnce(
        map,
        { id: "g-shore", type: "line", source: "g-water", paint: { "line-color": P.shore, "line-width": 1 } },
        roads,
      );

      // trees
      setGeoJSON(map, "trees-hex", fc(G.trees.map(treeHex)));
      if (mode === "nature") {
        addLayerOnce(
          map,
          {
            id: TREES_FLAT,
            type: "fill",
            source: "trees-hex",
            minzoom: 13.5,
            paint: { "fill-color": P.tree, "fill-opacity": 0.95 },
          },
          labels,
        );
      } else {
        setGeoJSON(map, "trees-pt", fc(G.trees.map((t) => point(t))));
        addLayerOnce(
          map,
          {
            id: "trees",
            type: "circle",
            source: "trees-pt",
            minzoom: 15,
            paint: {
              "circle-color": P.tree,
              "circle-opacity": 0.6,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 1.2, 16, 3.2, 18, 9],
              "circle-pitch-alignment": "map",
            },
          },
          slot(map, "roadCore"),
        );
      }
      // in 3D the trees grow (cool sage in the city, leafy green in Nature)
      addLayerOnce(
        map,
        {
          id: TREES_3D,
          type: "fill-extrusion",
          source: "trees-hex",
          minzoom: 13.5,
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": P.tree3d,
            "fill-extrusion-height": 0,
            "fill-extrusion-base": 2.5,
            "fill-extrusion-opacity": 0,
            "fill-extrusion-vertical-gradient": false,
          },
        },
        labels,
      );
      return undefined;
    },
    [G],
  );

  // Nature chips; also re-applies the current 3D state to the freshly added tree layers
  useMapLayers(
    (map, mode) => {
      if (mode !== "nature") {
        handle.setTreesEnabled(mode, true);
        return undefined;
      }
      setVis(map, ["park-hatch", "g-parks-hatch"], greenery);
      // trees are always part of Nature's map (v3); Shade only changes how the route is chosen
      handle.setTreesEnabled("nature", true);
      return undefined;
    },
    [G, greenery, shade],
  );
  return null;
}
