import { useState } from "react";
import { Legend, Panel } from "@/bikemap/controls";
import { MapPage } from "@/bikemap/map-page";
import { TradeoffCard } from "@/bikemap/tradeoff-card";
import { VoiceNavButton } from "@/bikemap/voice-nav";

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
        <div className="grid gap-2">
          <TradeoffCard data={r} mode="safe" />
          <VoiceNavButton route={r.recommended} />
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
