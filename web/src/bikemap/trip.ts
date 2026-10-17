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
