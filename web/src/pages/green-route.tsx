import { useState } from "react";
import type { GreenPrefs } from "@/bikemap/api";
import { Legend, Panel, Stat } from "@/bikemap/controls";
import { MapPage } from "@/bikemap/map-page";
import { cn } from "@/lib/utils";

const PREFS: { key: keyof GreenPrefs; label: string }[] = [
  { key: "green", label: "🌳 Greenery" },
  { key: "quiet", label: "🤫 Quiet" },
  { key: "shade", label: "☀️ Shade" },
];

// Map 2: bring the countryside into the commute. One slider = how much detour you'll take for it.
export function GreenRoutePage() {
  const [rural, setRural] = useState(0.5);
  const [prefs, setPrefs] = useState<GreenPrefs>({ green: true, quiet: true, shade: false });

  return (
    <MapPage
      mode="green"
      title="Green route"
      blurb="Slide toward Rural and the route bends through parks, trees and quiet streets."
      rural={rural}
      prefs={prefs}
      showNetwork={false}
      stats={(r) => (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Extra time" value={`+${r.compare.extra_min} min`} />
          <Stat
            label="Greenery"
            value={`${r.compare.greenery_pct_fastest}% → ${r.compare.greenery_pct_recommended}%`}
            hint="fastest → green"
          />
          <Stat label="Noise" value={`−${r.compare.noise_reduction_db} dB`} hint="estimated" />
          <Stat label="Green route" value={`${r.recommended.duration_min} min`} />
        </div>
      )}
    >
      <Panel title="City ↔ Rural">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={rural}
          onChange={(e) => setRural(Number(e.target.value))}
          className="w-full accent-emerald-700"
          aria-label="City to Rural"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>🏙️ City (fastest)</span>
          <span>🌾 Rural (greenest)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PREFS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={prefs[key]}
              onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                prefs[key] ? "border-emerald-700 bg-emerald-700 text-white" : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Legend mode="green" labels={{ good: "Rural feel", ok: "Some green", bad: "Concrete" }} />
      </Panel>
    </MapPage>
  );
}
