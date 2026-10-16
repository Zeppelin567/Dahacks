// A trip point is either a preset place, a pin, a search result or a clicked spot on the map.
import type { Destination, LatLng, Place } from "./api";

export type TripPoint = { key: string; name: string; lat: number; lng: number };

export type Pin = Destination;

// Modern-mode pins are the presets. The backend only knows id/name/coords; the look lives here.
const PRESET_LOOK: Record<string, { icon: string; label: string; description: string }> = {
  deanza: { icon: "🎓", label: "Campus", description: "De Anza College, where DAHacks happens" },
  "main-street": { icon: "🛍️", label: "Downtown", description: "Shops and restaurants on Main Street" },
  "apple-park": { icon: "🏢", label: "Workplace", description: "Apple Park Visitor Center" },
  library: { icon: "📚", label: "Civic", description: "Library, City Hall and Civic Center" },
  "memorial-park": { icon: "🌳", label: "Park", description: "The city's central park" },
  "monta-vista": { icon: "🏫", label: "School", description: "Monta Vista High School" },
  rancho: { icon: "🥾", label: "Trailhead", description: "Rancho San Antonio trailhead" },
};

export function presetPin(p: Place): Pin {
  const look = PRESET_LOOK[p.id] ?? { icon: "📍", label: "Place", description: "" };
  return {
    id: `preset/${p.id}`,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    icon: look.icon,
    category_label: look.label,
    description: look.description,
    score: null,
    amenities: [],
  };
}

export function placePoint(p: Place): TripPoint {
  return { key: `preset/${p.id}`, name: p.name, lat: p.lat, lng: p.lng };
}

export function pinPoint(p: Pin): TripPoint {
  return { key: p.id, name: p.name, lat: p.lat, lng: p.lng };
}

export function ll(p: TripPoint): LatLng {
  return [p.lat, p.lng];
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatKm(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
