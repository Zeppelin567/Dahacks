// A trip point is either a preset place, a pin, a search result or a clicked spot on the map.
import type { Destination, LatLng, Place } from "./api";

export type TripPoint = { key: string; name: string; lat: number; lng: number };

export type Pin = Destination;

// Modern-mode pins are the presets. The backend only knows id/name/coords; the labels live here.
const PRESET_LOOK: Record<string, { label: string; description: string }> = {
  deanza: { label: "Campus", description: "De Anza College, where DAHacks happens" },
  "main-street": { label: "Downtown", description: "Shops and restaurants on Main Street" },
  "apple-park": { label: "Workplace", description: "Apple Park Visitor Center" },
  library: { label: "Civic", description: "Library, City Hall and Civic Center" },
  "memorial-park": { label: "Park", description: "The city's central park" },
  "monta-vista": { label: "School", description: "Monta Vista High School" },
  rancho: { label: "Trailhead", description: "Rancho San Antonio trailhead" },
  "infinite-loop": { label: "Workplace", description: "Apple's Infinite Loop campus" },
  vallco: { label: "Shopping", description: "The Rise, on Wolfe Road" },
  "cupertino-village": { label: "Shopping", description: "Cupertino Village (99 Ranch)" },
  quinlan: { label: "Civic", description: "Quinlan Community Center" },
  "cupertino-hs": { label: "School", description: "Cupertino High School" },
  "homestead-hs": { label: "School", description: "Homestead High School" },
  "kennedy-ms": { label: "School", description: "Kennedy Middle School" },
  "lawson-ms": { label: "School", description: "Lawson Middle School" },
  "hyde-ms": { label: "School", description: "Hyde Middle School" },
  "wilson-park": { label: "Park", description: "Wilson Park" },
  "regnart-creek-trail": { label: "Trail", description: "Regnart Creek Trail at Blaney Ave" },
  "creekside-park": { label: "Park", description: "Creekside Park" },
  "portal-park": { label: "Park", description: "Portal Park" },
  "jollyman-park": { label: "Park", description: "Jollyman Park" },
  "linda-vista-park": { label: "Park", description: "Linda Vista Park" },
  "blackberry-farm": { label: "Park", description: "Blackberry Farm Park" },
  "mcclellan-ranch": { label: "Nature", description: "McClellan Ranch Preserve" },
  "mary-bridge-s": { label: "Bike bridge", description: "Mary Ave Bike Bridge, Cupertino end" },
  "mary-bridge-n": { label: "Bike bridge", description: "Mary Ave Bike Bridge, Sunnyvale end" },
};

export function presetPin(p: Place): Pin {
  const look = PRESET_LOOK[p.id] ?? { label: "Place", description: "" };
  return {
    id: `preset/${p.id}`,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    icon: "", // only nature spots carry an icon; city places are plain dots
    category_label: look.label,
    description: look.description,
    score: null,
    amenities: [],
  };
}

export function placePoint(p: Place): TripPoint {
  return { key: `preset/${p.id}`, name: p.name, lat: p.lat, lng: p.lng };
}

export function ll(p: TripPoint): LatLng {
  return [p.lat, p.lng];
}

// ?from= / ?to= in the URL: a preset id ("memorial-park"), or "lat,lng[,name]" for a searched place or a map tap.
const DROPPED = "Dropped pin";

export function urlPoint(v: string | null, places: Place[]): TripPoint | undefined {
  if (!v) return undefined;
  const p = places.find((x) => x.id === v);
  if (p) return placePoint(p);
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*(?:,(.*))?$/.exec(v);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { key: `url/${lat},${lng}`, name: m[3]?.trim() || DROPPED, lat, lng };
}

export function urlValue(p: TripPoint): string {
  if (p.key.startsWith("preset/")) return p.key.slice("preset/".length);
  const r = (n: number) => String(Math.round(n * 1e5) / 1e5);
  // "My location" means nothing on someone else's phone, so a shared link calls it a pin
  const name = p.key === "me" || p.name === DROPPED ? "" : `,${p.name}`;
  return `${r(p.lat)},${r(p.lng)}${name}`;
}
