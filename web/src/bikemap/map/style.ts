// The basemap: OpenFreeMap "Liberty" restyled as a paper-model atlas, one palette per mode (ported from prototype v3).
// Each mode gets its OWN map instance with its own style, so data layers added to a map are never wiped by a restyle.
import type {
  ExpressionSpecification,
  LayerSpecification,
  LightSpecification,
  Map as MlMap,
  SkySpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { UiMode } from "../theme";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Map palette per mode. UI colours live in theme.css (same values); these are for MapLibre paint. */
export const PAL = {
  modern: {
    bg: "#EEF1F4",
    resid: "#E9EDF1",
    landuse: "#E5EAEE",
    park: "#D5E0DE",
    wood: "#CCDAD6",
    grass: "#DBE4E2",
    water: "#B5CEDD",
    shore: "#8DAABF",
    ext: "#F7F9FB",
    hk: 1,
    road: "#FFFFFF",
    casing: "#BAC4CE",
    mway: "#E3E8ED",
    mwayCase: "#A3AFBB",
    path: "#8C98A5",
    rail: "#C2CAD2",
    ink: "#1D2B3A",
    minorInk: "#34465A",
    halo: "#EEF1F4",
    hatch: "rgba(44,95,142,.10)",
    hatchOp: 0.5,
    gPark: 0.7,
    sky: {
      "sky-color": "#D9E4EE",
      "horizon-color": "#EEF1F4",
      "fog-color": "#EEF1F4",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.75,
      "atmosphere-blend": 0,
    },
    ours: "#2C5F8E",
    ghost: "#6B7A8C",
    good: "#9DB2C6",
    ok: "#EDB49B",
    bad: "#D9653B",
    okText: "#B4532C",
    busy: "#E39A7B",
    routeInk: "#173A5A",
    halo2: "#FFFFFF",
    tree: "#B9CCC4",
    tree3d: "#A9BFB9",
  },
  nature: {
    bg: "#F5EFE1",
    resid: "#F1EADA",
    landuse: "#EEE6D3",
    park: "#BFD6A8",
    wood: "#AFCB93",
    grass: "#CCDDB4",
    water: "#9CC3CF",
    shore: "#6E9DAD",
    ext: "#FBF6EA",
    hk: 0.7,
    road: "#FFFDF7",
    casing: "#ADA083",
    mway: "#EFE7D4",
    mwayCase: "#BDB091",
    path: "#857A5E",
    rail: "#D2C8B1",
    ink: "#1F1D16",
    minorInk: "#36322A",
    halo: "#F5EFE1",
    hatch: "rgba(47,85,30,.22)",
    hatchOp: 1,
    gPark: 1,
    sky: {
      "sky-color": "#DDE8D6",
      "horizon-color": "#F5EFE1",
      "fog-color": "#F5EFE1",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.75,
      "atmosphere-blend": 0,
    },
    ours: "#3F7D2A",
    ghost: "#9A8C6E",
    good: "#3F7D2A",
    ok: "#B5A86A",
    bad: "#6F6658",
    okText: "#8E8450",
    busy: "#CBC291",
    routeInk: "#1F1D16",
    halo2: "#FFFDF7",
    tree: "#8DB86A",
    tree3d: "#8DB86A",
  },
} satisfies Record<UiMode, Record<string, unknown>>;
export type Palette = (typeof PAL)[UiMode];

export const LIGHT: LightSpecification = {
  anchor: "viewport",
  color: "#ffffff",
  intensity: 0.35,
  position: [1.3, 210, 40],
};

export const NAME: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name"], ""];
const BOLD = ["Noto Sans Bold"];
const REG = ["Noto Sans Regular"];

const DROP =
  /^(natural_earth|poi_|highway-shield|road_shield|road_one_way|airport|aeroway|park_outline|road_area_pattern|label_|boundary|.*_hatching|highway-name-path|landcover_ice|landcover_sand|waterway_line_label)/;

/** Zoom-scaled width: a at z12, b at z15, c at z18 (exponential, like real roads). */
export const zw = (a: number, b: number, c: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  12,
  a,
  15,
  b,
  18,
  c,
];

const ROADW: Record<string, [number, number, number]> = {
  motorway: [2, 9, 30],
  primary: [2.6, 13, 36],
  secondary: [1.8, 9, 26],
  minor: [0.9, 5, 17],
  service: [0.4, 2.4, 8],
};

/** Buildings (and tree canopies) are flat in 2D and rise in 3D: k = 0..1. */
export function extrudeHB(mode: UiMode, k: number) {
  const h = PAL[mode].hk * k;
  return {
    "fill-extrusion-height": ["*", ["coalesce", ["get", "render_height"], 6], h] as ExpressionSpecification,
    "fill-extrusion-base": ["*", ["coalesce", ["get", "render_min_height"], 0], h] as ExpressionSpecification,
  };
}

// Loose view of a style layer so we can rewrite paint/layout freely (the base style is trusted JSON).
type Loose = {
  id: string;
  type: string;
  "source-layer"?: string;
  minzoom?: number;
  filter?: unknown;
  paint: Record<string, unknown>;
  layout: Record<string, unknown>;
};

let baseStyle: Promise<StyleSpecification> | undefined;
/** Liberty, fetched once per page load and shared by both maps. */
export function loadBaseStyle(): Promise<StyleSpecification> {
  baseStyle ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`basemap style ${r.status}`);
    return r.json() as Promise<StyleSpecification>;
  });
  return baseStyle;
}

export function buildStyle(base: StyleSpecification, mode: UiMode, opts: { pitch3d?: boolean } = {}) {
  const P = PAL[mode];
  const st = structuredClone(base);
  delete (st.sources as Record<string, unknown>).ne2_shaded;
  st.layers = st.layers.filter((l) => !DROP.test(l.id));
  st.sky = P.sky as SkySpecification;
  for (const raw of st.layers) {
    const l = raw as unknown as Loose;
    l.paint ??= {};
    l.layout ??= {};
    const sl = l["source-layer"];
    const id = l.id;
    if (l.type === "background") l.paint = { "background-color": P.bg };
    else if (sl === "park" && l.type === "fill") l.paint = { "fill-color": P.park };
    else if (id === "landuse_residential") l.paint = { "fill-color": P.resid };
    else if (id === "landcover_wood") l.paint = { "fill-color": P.wood };
    else if (/grass|pitch|cemetery|wetland/.test(id)) l.paint = { "fill-color": P.grass };
    else if ((sl === "landuse" || sl === "landcover") && l.type === "fill")
      l.paint = { "fill-color": P.landuse };
    else if (sl === "water" && l.type === "fill") l.paint = { "fill-color": P.water };
    else if (sl === "waterway" && l.type === "line") l.paint["line-color"] = P.water;
    else if (id === "building") l.paint = { "fill-color": P.ext, "fill-outline-color": P.casing };
    else if (id === BUILDINGS_3D) {
      l.minzoom = 13;
      l.paint = {
        "fill-extrusion-color": P.ext,
        "fill-extrusion-opacity": opts.pitch3d ? 0.92 : 0,
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-translate-anchor": "viewport",
        ...extrudeHB(mode, 1),
      };
      l.layout.visibility = opts.pitch3d ? "visible" : "none";
    } else if (sl === "transportation" && l.type === "line") {
      const cas = /casing/.test(id);
      const cls = /rail/.test(id)
        ? "rail"
        : /path|pedestrian/.test(id)
          ? "path"
          : /motorway(?!_link)/.test(id)
            ? "motorway"
            : /trunk_primary/.test(id)
              ? "primary"
              : /secondary_tertiary/.test(id)
                ? "secondary"
                : /service_track/.test(id)
                  ? "service"
                  : "minor";
      if (cls === "path") {
        if (cas) {
          l.layout.visibility = "none";
          continue;
        }
        // solid and faint: no grey dots
        l.minzoom = 15;
        l.paint = {
          "line-color": P.path,
          "line-opacity": 0.3,
          "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 18, 2],
        };
      } else if (cls === "rail") {
        l.paint = {
          "line-color": P.rail,
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 2.5],
        };
      } else {
        const w = ROADW[cls] as [number, number, number];
        l.layout["line-cap"] = "round";
        l.layout["line-join"] = "round";
        const mw = cls === "motorway";
        l.paint = cas
          ? { "line-color": mw ? P.mwayCase : P.casing, "line-width": zw(w[0] + 1, w[1] + 2.6, w[2] + 4) }
          : { "line-color": mw ? P.mway : P.road, "line-width": zw(...w) };
        if (/^tunnel/.test(id)) l.paint["line-opacity"] = 0.45;
      }
    } else if (l.type === "symbol") {
      if (sl === "transportation_name") {
        const major = id === "highway-name-major";
        l.minzoom = major ? 12 : 14.2;
        Object.assign(l.layout, {
          "text-font": BOLD,
          "text-field": major ? ["upcase", NAME] : NAME,
          "text-letter-spacing": major ? 0.08 : 0.01,
          "text-size": major
            ? ["interpolate", ["linear"], ["zoom"], 12, 12, 14.5, 15, 17, 16.5]
            : ["interpolate", ["linear"], ["zoom"], 14, 13, 15, 14, 18, 16],
          "symbol-placement": "line",
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "map",
          "text-max-angle": 30,
          "text-padding": 4,
          "symbol-spacing": major ? 420 : 300,
        });
        l.paint = {
          "text-color": major ? P.ink : P.minorInk,
          "text-halo-color": P.halo,
          "text-halo-width": 2,
          "text-halo-blur": 0,
        };
      } else if (sl === "water_name") {
        Object.assign(l.layout, { "text-font": REG, "text-field": NAME, "text-size": 13 });
        l.paint = { "text-color": P.shore, "text-halo-color": P.halo, "text-halo-width": 1.6 };
      }
    }
  }
  return st;
}

// ---------- layer slots ----------
// Where your data layers go (pass as the `beforeId` of map.addLayer):
//   "roads"     → under every road: area fills (parks, water, noise haze)
//   "roadCore"  → between road casings and the white road core: street-score edges (the "net" layer)
//   "labels"    → above roads, under street names: routes, trees, ends
//   undefined   → on top of everything (rare; HTML markers are better for beads/pins)
export type Slot = "roads" | "roadCore" | "labels";
export const BUILDINGS_3D = "building-3d";
/** Give a fill-extrusion layer this id and the 3D toggle grows it with the buildings (see MapLibreMap). */
export const TREES_3D = "trees3d";
/** Optional flat-tree layer id that the 3D toggle hides once the canopies are up. */
export const TREES_FLAT = "trees-flat";

export function slot(map: MlMap, s: Slot): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  if (s === "labels") return layers.find((l) => l.type === "symbol")?.id;
  if (s === "roadCore")
    return map.getLayer("road_path_pedestrian") ? "road_path_pedestrian" : slot(map, "labels");
  return layers.find(
    (l) => (l as LayerSpecification & { "source-layer"?: string })["source-layer"] === "transportation",
  )?.id;
}

// ---------- street names under the route (v3 hides them so labels never sit on the lines and beads) ----------
const NAME_LAYERS = ["highway-name-major", "highway-name-minor", "highway-name-path"];
const baseFilters = new WeakMap<MlMap, Map<string, unknown>>();

/** Hide the basemap's name labels of these streets (e.g. ["De Anza Boulevard", "Vista Drive"]). */
export function hideStreetNames(map: MlMap, names: string[]): void {
  let orig = baseFilters.get(map);
  if (!orig) {
    orig = new Map();
    baseFilters.set(map, orig);
  }
  for (const id of NAME_LAYERS) {
    if (!map.getLayer(id)) continue;
    if (!orig.has(id)) orig.set(id, map.getFilter(id) ?? true);
    const base = orig.get(id) as ExpressionSpecification | boolean;
    const nots = names.map((n) => ["!", ["in", n, NAME]] as ExpressionSpecification);
    map.setFilter(id, nots.length ? (["all", base, ...nots] as ExpressionSpecification) : (base as never));
  }
}
