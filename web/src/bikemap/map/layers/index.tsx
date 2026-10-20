// Every map-side layer of v3 in one component. Render it as a child of <MapLibreMap>:
//
//   <MapLayers
//     routes={{ modern: safeRoute.data, nature: greenRoute.data }}
//     sel={sel}                        // "rec" | "fast" (the sheet's Ours / Fast buttons)
//     photos={photos.data}             // Nature's Street View stops (/route-photos)
//     prefs={{ green, quiet, shade }}  // Nature chips (map side: green edges + hatch, noise haze, trees)
//     pick={pick}                      // the open card (or null); a crossing/photo pick also focuses its bead/pin
//     onPick={setPick}                 // street / crossing / photo taps
//     onDraw={(e) => ...}              // route draw-in phases on the visible map: "start" | "ours" | "done"
//   />
//   <PickPopup pick={pick} className={CARD_POPUP_CLASS}><StreetCard pick={pick} onClose=.../></PickPopup>
import { useMemo } from "react";
import type { GreenPrefs, NetworkResponse, RoutePhoto, RouteResponse } from "../../api";
import type { UiMode } from "../../theme";
import { useMapLayers } from "../context";
import { measure } from "../geo";
import { hideStreetNames } from "../style";
import { CrossingBeads, nearestName } from "./beads";
import { GreenLayers } from "./green";
import { NetworkLayer, useNetworks } from "./network";
import { PhotoPins } from "./photos";
import { StreetPicks } from "./picks";
import { RouteTrees } from "./route-trees";
import { RouteLayers, type RouteSel } from "./routes";
import type { DrawEvent, MapPick } from "./shared";

export type MapLayersProps = {
  /** per map: Modern = safe engine, Nature = green engine */
  routes: Partial<Record<UiMode, RouteResponse>>;
  sel?: RouteSel;
  photos?: RoutePhoto[];
  prefs?: Partial<GreenPrefs>;
  /** show the numbered crossing beads (Modern) */
  showCrossings?: boolean;
  /** show the photo pins (Nature) */
  showPhotos?: boolean;
  /** false while a Race / Listen runs: taps on streets do nothing */
  interactive?: boolean;
  /** the currently open card; null = none (focuses its bead / pin; render the card with <PickPopup>) */
  pick?: MapPick | null;
  onPick?: (p: MapPick | null) => void;
  onDraw?: (e: DrawEvent) => void;
};

/** Streets the routes run along (sampled every 25 m, a name needs 2+ hits so a side street touching the route doesn't count). */
function routeStreetNames(r: RouteResponse | undefined, net: NetworkResponse | undefined): string[] {
  if (!r || !net) return [];
  const votes = new Map<string, number>();
  for (const route of [r.fastest, r.recommended]) {
    const ms = measure(route.coords);
    for (let d = 10; d < ms.total; d += 25) {
      const n = nearestName(net, ms.at(d), 12);
      if (n) votes.set(n, (votes.get(n) ?? 0) + 1);
    }
  }
  return [...votes.entries()]
    .filter(([n, v]) => v >= 2 && n.length > 3)
    .map(([n]) => n.replace(/^(North|South|East|West) /, ""));
}

/** Hides basemap street-name labels along the routes (v3), so no label sits on the lines or the beads. */
function RouteNameMask({ routes }: { routes: Partial<Record<UiMode, RouteResponse>> }) {
  const { safe } = useNetworks();
  const names = useMemo(
    () => ({ modern: routeStreetNames(routes.modern, safe), nature: routeStreetNames(routes.nature, safe) }),
    [routes.modern, routes.nature, safe],
  );
  useMapLayers(
    (map, mode) => {
      hideStreetNames(map, names[mode]);
      return undefined;
    },
    [names],
  );
  return null;
}

export function MapLayers({
  routes,
  sel = "rec",
  photos,
  prefs = {},
  showCrossings = true,
  showPhotos = true,
  interactive = true,
  pick = null,
  onPick,
  onDraw,
}: MapLayersProps) {
  const greenery = prefs.green ?? true;
  return (
    <>
      <GreenLayers greenery={greenery} shade={prefs.shade ?? true} />
      <NetworkLayer greenery={greenery} quiet={prefs.quiet ?? true} />
      <RouteLayers routes={routes} sel={sel} onDraw={onDraw} />
      <RouteTrees route={routes.nature} />
      <RouteNameMask routes={routes} />
      <CrossingBeads
        route={routes.modern}
        visible={showCrossings}
        focus={pick?.kind === "crossing" ? pick.crossing.n : null}
        onPick={interactive ? onPick : undefined}
      />
      <PhotoPins
        photos={photos}
        ends={
          routes.nature ? [routes.nature.recommended.coords[0], routes.nature.recommended.coords.at(-1)] : []
        }
        visible={showPhotos}
        focus={pick?.kind === "photo" ? pick.index : null}
        onPick={interactive ? onPick : undefined}
      />
      <StreetPicks photos={photos} enabled={interactive} onPick={onPick} />
    </>
  );
}

export { CrossingBeads, crossingsOf, useCrossings } from "./beads";
export { GreenLayers } from "./green";
export { NET_LAYER, NetworkLayer, useNetworks } from "./network";
export { PhotoPins } from "./photos";
export { StreetPicks } from "./picks";
export { PickPopup } from "./popup";
export { RaceLayer, type RaceProgress, type RaceResult } from "./race";
export { ROUTE_LAYERS, RouteLayers, type RouteSel } from "./routes";
export {
  type Crossing,
  type DrawEvent,
  type DrawPhase,
  type MapPick,
  onDraw,
  pickFromStreet,
} from "./shared";
