// How the rest of the app talks to the map. See /Users/jusman/Dahacks-design/build/FOUNDATION.md.
//
// There are TWO MapLibre maps, one per mode, stacked (Nature on top, clipped by a "seam" that sweeps across on a
// mode switch, like v3). They share one camera. A data layer usually goes on both maps, styled per mode:
//
//   useMapLayers((map, mode) => {
//     setGeoJSON(map, "r-rec", fc([line(route.coords)]));
//     addLayerOnce(map, { id: "rec-line", type: "line", source: "r-rec", paint: {...PAL[mode]...} }, slot(map, "labels"));
//     return () => removeLayers(map, ["rec-line"], ["r-rec"]);   // optional cleanup
//   }, [route]);
import type { GeoJSONSource, LayerSpecification, Map as MlMap, PaddingOptions } from "maplibre-gl";
import { createContext, type DependencyList, useContext, useEffect, useRef, useState } from "react";
import type { LatLng } from "../api";
import type { UiMode } from "../theme";

export type MapPair = Record<UiMode, MlMap>;

export type FitOptions = {
  /** Screen padding around the bounds; defaults to defaultPadding() (keeps clear of the sheet). */
  padding?: Partial<PaddingOptions>;
  duration?: number;
  maxZoom?: number;
};

export type BikeMapHandle = {
  /** Both maps, or null before they have loaded. */
  maps(): MapPair | null;
  /** The map the user currently sees (the one under the pointer). */
  active(): MlMap | null;
  /** Run fn on each loaded map. */
  each(fn: (map: MlMap, mode: UiMode) => void): void;
  /** Frame [lat,lng] polylines (e.g. [route.fastest.coords, route.recommended.coords]). Keeps pitch/bearing. */
  fit(lists: LatLng[][], opts?: FitOptions): void;
  flyTo(at: LatLng, zoom?: number): void;
  /** Ease to a point (crossing, photo) keeping pitch/bearing, framed clear of the sheet. Default zoom: max(current, 17). */
  focusOn(at: LatLng, opts?: FitOptions & { zoom?: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  /** 0 = all Nature, 1 = all Modern, in between = split view at that fraction of the width (Split feature). */
  setSeam(f: number): void;
  animateSeam(to: number, ms?: number): Promise<void>;
  /** Current 3D extrusion 0..1 (buildings + trees3d). */
  extrude(): number;
  /** Show/hide the tree canopies of one map (e.g. Nature's "Shade" chip). */
  setTreesEnabled(mode: UiMode, on: boolean): void;
};

export type BikeMapCtx = {
  maps: MapPair;
  ui: UiMode;
  handle: BikeMapHandle;
  /** The tilted 3D view is on (the 2D/3D toggle). */
  view3d: boolean;
};

export const MapCtx = createContext<BikeMapCtx | null>(null);

/** Inside <MapLibreMap>'s children only (they render once both maps have loaded). */
export function useBikeMap(): BikeMapCtx {
  const c = useContext(MapCtx);
  if (!c) throw new Error("useBikeMap() must be used inside <MapLibreMap> children");
  return c;
}

/**
 * Add/update layers on BOTH maps. `setup` runs once per map whenever deps change (and once the maps exist);
 * its returned cleanup runs before the next run and on unmount. Prefer setGeoJSON (setData) + addLayerOnce so a
 * re-run updates data in place instead of tearing layers down (no flicker).
 */
export function useMapLayers(
  setup: (map: MlMap, mode: UiMode) => undefined | (() => void),
  deps: DependencyList,
): void {
  const { maps } = useBikeMap();
  const fn = useRef(setup);
  fn.current = setup;
  useEffect(() => {
    const cleanups = (Object.keys(maps) as UiMode[]).map((mode) => fn.current(maps[mode], mode));
    return () => {
      for (const c of cleanups) {
        try {
          c?.();
        } catch {
          // map already removed (unmount order); nothing to clean
        }
      }
    };
  }, [maps, ...deps]);
}

/** Create the GeoJSON source or replace its data. */
export function setGeoJSON(
  map: MlMap,
  id: string,
  data: GeoJSON.GeoJSON,
  opts: { lineMetrics?: boolean; tolerance?: number } = {},
): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: "geojson", data, ...opts });
}

/** map.addLayer only if the id is free (safe to call on every re-run). */
export function addLayerOnce(map: MlMap, layer: LayerSpecification, beforeId?: string): void {
  if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId);
}

/** Remove layers then sources, ignoring ones that are already gone (or a removed map). */
export function removeLayers(map: MlMap, layerIds: string[], sourceIds: string[] = []): void {
  try {
    for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
  } catch {
    // map was removed first
  }
}

/** Live camera of the visible map (zoom, centre, pitch), updated at most once per frame. */
export function useMapCamera() {
  const { maps, handle } = useBikeMap();
  const read = () => {
    const m = handle.active() ?? maps.modern;
    const c = m.getCenter();
    return { zoom: m.getZoom(), lat: c.lat, lng: c.lng, pitch: m.getPitch(), bearing: m.getBearing() };
  };
  const [cam, setCam] = useState(read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read() only depends on maps/handle
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCam(read());
      });
    };
    for (const m of Object.values(maps)) m.on("move", on);
    return () => {
      cancelAnimationFrame(raf);
      for (const m of Object.values(maps)) m.off("move", on);
    };
  }, [maps, handle]);
  return cam;
}

/** Screen padding that keeps framed routes clear of the sheet (desktop: left card; phone: bottom sheet). */
export function defaultPadding(): PaddingOptions {
  const w = typeof innerWidth === "number" ? innerWidth : 1200;
  if (w < 700) {
    const sheetH =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bm-sheet-h")) || 260;
    return { top: 90, bottom: sheetH + 40, left: 30, right: 70 };
  }
  return { top: 110, bottom: 90, left: 470, right: 170 };
}
