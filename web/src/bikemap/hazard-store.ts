export const HAZARD_CATEGORIES = [
  { id: "bike_lane_obstruction", label: "Bike lane blocked" },
  { id: "road_surface", label: "Bad road surface" },
  { id: "intersection", label: "Dangerous intersection" },
  { id: "ticketing", label: "Police ticketing spot" },
  { id: "missing_amenity", label: "Missing amenity" },
] as const;
export type Hazard = { id: string; lat: number; lng: number; category: string; note: string; ts: number };
export const HAZARD_STORAGE_KEY = "bikemap-hazards-v1";
export function parseHazards(raw: string | null): Hazard[] {
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (h): h is Hazard =>
        h != null &&
        typeof h === "object" &&
        typeof h.id === "string" &&
        Number.isFinite(h.lat) &&
        Math.abs(h.lat) <= 90 &&
        Number.isFinite(h.lng) &&
        Math.abs(h.lng) <= 180 &&
        typeof h.note === "string" &&
        HAZARD_CATEGORIES.some((c) => c.id === h.category),
    );
  } catch {
    return [];
  }
}
