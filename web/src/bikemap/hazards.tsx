import maplibregl from "maplibre-gl";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LatLng } from "./api";
import { HAZARD_CATEGORIES, type Hazard, HAZARD_STORAGE_KEY as KEY, parseHazards } from "./hazard-store";
import { MapPopup, useMapLayers } from "./map";
export function useHazards() {
  const [hazards, setHazards] = useState<Hazard[]>(() => {
    try {
      return parseHazards(localStorage.getItem(KEY));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(hazards));
    } catch {
      /* Storage unavailable. */
    }
  }, [hazards]);
  return { hazards, setHazards };
}
const label = (h: Hazard) => HAZARD_CATEGORIES.find((c) => c.id === h.category)?.label ?? "Hazard";

/** Markers are native MapLibre overlays on both maps, so the mode seam stays intact. */
export function HazardMarkers({ hazards, onRemove }: { hazards: Hazard[]; onRemove: (id: string) => void }) {
  const [selectedId, setSelected] = useState<string | null>(null);
  const selected = hazards.find((h) => h.id === selectedId);
  useMapLayers(
    (map) => {
      const markers = hazards.map((h) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "bm-hazard-marker";
        el.textContent = "!";
        el.title = label(h);
        el.setAttribute("aria-label", `Hazard: ${label(h)}`);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelected(h.id);
        });
        return new maplibregl.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(map);
      });
      return () => {
        for (const marker of markers) marker.remove();
      };
    },
    [hazards],
  );
  return selected ? (
    <MapPopup at={[selected.lat, selected.lng]} onClose={() => setSelected(null)}>
      <div className="bm-hazard-card">
        <strong>{label(selected)}</strong>
        {selected.note && <p>{selected.note}</p>}
        <p>Saved on this browser.</p>
        <div className="bm-feature-actions">
          <button
            type="button"
            onClick={() => {
              onRemove(selected.id);
              setSelected(null);
            }}
          >
            Remove
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      </div>
    </MapPopup>
  ) : null;
}

export function HazardDialog({
  at,
  onClose,
  onSave,
}: {
  at: LatLng | null;
  onClose: () => void;
  onSave: (hazard: Hazard) => void;
}) {
  const [category, setCategory] = useState<string>(HAZARD_CATEGORIES[0].id);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (at) {
      setCategory(HAZARD_CATEGORIES[0].id);
      setNote("");
    }
  }, [at]);
  return (
    <Dialog
      open={!!at}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bm-feature-dialog">
        <DialogHeader>
          <DialogTitle>Report a hazard</DialogTitle>
          <DialogDescription>
            Mark a spot for your future rides. Reports are stored on this browser.
          </DialogDescription>
        </DialogHeader>
        <form
          className="bm-hazard-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!at) return;
            onSave({
              id: crypto.randomUUID(),
              lat: at[0],
              lng: at[1],
              category,
              note: note.trim(),
              ts: Date.now(),
            });
            onClose();
          }}
        >
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {HAZARD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note (optional)
            <input
              value={note}
              maxLength={240}
              placeholder="e.g. Glass near the curb"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p>Saved on this browser only. Reports do not change route calculations.</p>
          <div className="bm-feature-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Save hazard</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
