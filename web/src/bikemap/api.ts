// Types mirror py/app/bikemap/models.py. Change both together.
import { unwrap } from "@/lib/api";

export type Mode = "safe" | "green";
export type Level = "good" | "ok" | "bad";
export type LatLng = [number, number];

export type Place = { id: string; name: string; lat: number; lng: number };

export type GreenPrefs = { green: boolean; quiet: boolean; shade: boolean };

export type Segment = { coords: LatLng[]; score: number; level: Level; reasons: string[] };

export type Route = { coords: LatLng[]; distance_m: number; duration_min: number; segments: Segment[] };

export type Comparison = {
  extra_min: number;
  risky_segments_fastest: number | null;
  risky_segments_recommended: number | null;
  greenery_pct_fastest: number | null;
  greenery_pct_recommended: number | null;
  noise_reduction_db: number | null;
};

export type RouteResponse = {
  mode: Mode;
  mock: boolean;
  fastest: Route;
  recommended: Route;
  compare: Comparison;
};

export type NetworkResponse = { layer: Mode; mock: boolean; segments: Segment[] };

export type RouteRequest = { start: LatLng; end: LatLng; mode: Mode; rural?: number; prefs?: GreenPrefs };

export type Photo = { url: string; pano_id: string; heading: number; date: string | null };

export type StreetDetail = {
  mode: Mode;
  name: string;
  road: string;
  score10: number;
  level: Level;
  source: "photo" | "map";
  note: string | null;
  chips: string[];
  photo: Photo | null;
  streetview_url: string;
  coords: LatLng[];
};

export type Destination = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icon: string;
  category_label: string;
  description: string;
  score: number | null;
  amenities: string[];
};

export type DestinationsResponse = { source: "live_osm_overpass" | "fallback"; destinations: Destination[] };

export type SearchResult = { name: string; detail: string; lat: number; lng: number };

const BASE = "/api/py/bikemap";

export const bikemap = {
  places: () => fetch(`${BASE}/places`).then((r) => unwrap<Place[]>(r)),
  network: (layer: Mode) => fetch(`${BASE}/network?layer=${layer}`).then((r) => unwrap<NetworkResponse>(r)),
  route: (req: RouteRequest) =>
    fetch(`${BASE}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => unwrap<RouteResponse>(r)),
  street: (at: LatLng, mode: Mode) =>
    fetch(`${BASE}/street?lat=${at[0]}&lng=${at[1]}&mode=${mode}`).then((r) => unwrap<StreetDetail>(r)),
  destinations: () => fetch(`${BASE}/destinations`).then((r) => unwrap<DestinationsResponse>(r)),
  search: (q: string) =>
    fetch(`${BASE}/search?q=${encodeURIComponent(q)}`).then((r) => unwrap<SearchResult[]>(r)),
};
