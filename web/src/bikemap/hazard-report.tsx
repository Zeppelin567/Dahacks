import { useEffect, useState } from "react";
import type { LeafletMouseEvent } from "leaflet";
import { MapPin, Trash2, X } from "lucide-react";
import { CircleMarker, Popup, useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LatLng } from "./api";

/** Pointz's five fixed hazard categories. */
export const HAZARD_CATEGORIES = [
  { id: "bike_lane_obstruction", label: "Bike lane blocked" },
  { id: "road_surface", label: "Bad road surface" },
  { id: "intersection", label: "Dangerous intersection" },
  { id: "ticketing", label: "Police ticketing spot" },
  { id: "missing_amenity", label: "Missing amenity" },
] as const;

export type Hazard = {
  id: string;
  lat: number;
  lng: number;
  category: string;
  note: string;
  ts: number;
};

const STORAGE_KEY = "bikemap-hazards-v1";

function loadHazards(): Hazard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (h): h is Hazard =>
        typeof h === "object" && h !== null && typeof h.lat === "number" && typeof h.lng === "number",
    );
  } catch {
    return [];
  }
}

/** The "Report hazard" toggle button (rendered as a map overlay). */
export function HazardButton({ armed, onToggle }: { armed: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant={armed ? "default" : "outline"}
      size="sm"
      onClick={onToggle}
      aria-pressed={armed}
    >
      <MapPin className="size-4" />
      {armed ? "Click the map…" : "Report hazard"}
    </Button>
  );
}

/**
 * Must be rendered INSIDE <MapContainer>. Handles map clicks while armed,
 * renders saved hazard pins, and persists them to localStorage.
 */
export function HazardLayer({ armed, onDisarm }: { armed: boolean; onDisarm: () => void }) {
  const map = useMap();
  const [hazards, setHazards] = useState<Hazard[]>(loadHazards);
  const [pending, setPending] = useState<LatLng | null>(null);
  const [category, setCategory] = useState<string>(HAZARD_CATEGORIES[0].id);
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hazards));
    } catch {
      // storage unavailable — hazards just won't persist
    }
  }, [hazards]);

  useEffect(() => {
    if (!armed) return;
    const el = map.getContainer();
    el.style.cursor = "crosshair";
    const onClick = (e: LeafletMouseEvent) => {
      // Don't arm-report when the click landed on an existing overlay
      // (route segment / hazard pin) or an open popup — those have their own UI.
      const t = e.originalEvent.target as Element | null;
      if (t && typeof t.closest === "function" && t.closest(".leaflet-overlay-pane, .leaflet-popup-pane")) {
        return;
      }
      setPending([e.latlng.lat, e.latlng.lng]);
      onDisarm();
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      el.style.cursor = "";
    };
  }, [armed, map, onDisarm]);

  const save = () => {
    if (!pending) return;
    setHazards((h) => [
      ...h,
      {
        id: `${Date.now()}`,
        lat: pending[0],
        lng: pending[1],
        category,
        note: note.trim(),
        ts: Date.now(),
      },
    ]);
    setPending(null);
    setNote("");
    setCategory(HAZARD_CATEGORIES[0].id);
  };

  const remove = (id: string) => setHazards((h) => h.filter((x) => x.id !== id));
  const labelOf = (id: string) => HAZARD_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <>
      {hazards.map((h) => (
        <CircleMarker
          key={h.id}
          center={[h.lat, h.lng]}
          radius={7}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#f97316", fillOpacity: 1 }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">⚠️ {labelOf(h.category)}</div>
              {h.note && <div className="mt-0.5">{h.note}</div>}
              <button
                type="button"
                onClick={() => remove(h.id)}
                className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" /> Remove
              </button>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a hazard</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border bg-background px-2"
              >
                {HAZARD_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. glass near the curb"
                className="h-9 rounded-md border bg-background px-2"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>
              <X className="size-4" /> Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save hazard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
