import { useState } from "react";
import { Legend, Panel, Stat } from "@/bikemap/controls";
import { MapPage } from "@/bikemap/map-page";

// Map 1: the safest way to commute. Base layer = city-wide risk colours.
export function SafeRoutePage() {
  const [showRisk, setShowRisk] = useState(true);

  return (
    <MapPage
      mode="safe"
      title="Safe route"
      blurb="Avoid fast, busy roads with no bike lane. Click any coloured segment to see why it's rated that way."
      showNetwork={showRisk}
      stats={(r) => (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Extra time" value={`+${r.compare.extra_min} min`} />
          <Stat
            label="Risky segments"
            value={`${r.compare.risky_segments_fastest} → ${r.compare.risky_segments_recommended}`}
            hint="fastest → safe"
          />
          <Stat label="Fastest" value={`${r.fastest.duration_min} min`} />
          <Stat label="Safe route" value={`${r.recommended.duration_min} min`} />
        </div>
      )}
    >
      <Panel title="Risk layer">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showRisk} onChange={(e) => setShowRisk(e.target.checked)} />
          Show risk for every street
        </label>
        <Legend mode="safe" labels={{ good: "Safe", ok: "Caution", bad: "Risky" }} />
      </Panel>
    </MapPage>
  );
}
