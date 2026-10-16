import { useEffect, useMemo, useState } from "react";
import type { GreenPrefs, Segment } from "@/bikemap/api";
import { Legend, Panel } from "@/bikemap/controls";
import { MapPage } from "@/bikemap/map-page";
import { PresetProfiles, type GreenPreset } from "@/bikemap/preset-profiles";
import { toPrefVector, applyVoteDeltas } from "@/bikemap/route-utils";
import { TradeoffCard } from "@/bikemap/tradeoff-card";
import { VoiceNavButton } from "@/bikemap/voice-nav";
import { cn } from "@/lib/utils";

const PREFS: { key: keyof GreenPrefs; label: string }[] = [
  { key: "green", label: "🌳 Greenery" },
  { key: "quiet", label: "🤫 Quiet" },
  { key: "shade", label: "☀️ Shade" },
];

const VOTES_KEY = "bikemap-votes-v1";

function loadVotes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VOTES_KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : {};
    return typeof o === "object" && o !== null ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

// Map 2: bring the countryside into the commute. One slider = how much detour you'll take for it.
export function GreenRoutePage() {
  const [rural, setRural] = useState(0.5);
  const [prefs, setPrefs] = useState<GreenPrefs>({ green: true, quiet: true, shade: false });
  // Accumulated per-feature deltas from segment 👍/👎 (paper §4.3), in [-5,5] space.
  // Persisted so a page refresh mid-demo doesn't lose the votes.
  const [voteAdjust, setVoteAdjust] = useState<Record<string, number>>(loadVotes);

  useEffect(() => {
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(voteAdjust));
    } catch {
      // storage unavailable — votes just won't persist
    }
  }, [voteAdjust]);

  const baseVec = useMemo(() => toPrefVector(rural, prefs), [rural, prefs]);
  const prefOverride = useMemo(() => {
    const o: Record<string, number> = {};
    for (const [f, b] of Object.entries(baseVec)) {
      o[f] = Math.max(-5, Math.min(5, b + (voteAdjust[f] ?? 0)));
    }
    return o;
  }, [baseVec, voteAdjust]);

  const handleVote = (seg: Segment, like: boolean) => {
    const features = seg.features;
    if (!features) return; // backend hasn't shipped features yet — buttons stay hidden
    setVoteAdjust((a) => applyVoteDeltas(a, features, like));
  };

  const applyPreset = (p: GreenPreset) => {
    setRural(p.rural);
    setPrefs(p.prefs);
    setVoteAdjust({});
  };

  const voted = Object.keys(voteAdjust).length > 0;

  return (
    <MapPage
      mode="green"
      title="Green route"
      blurb="Slide toward Rural and the route bends through parks, trees and quiet streets."
      rural={rural}
      prefs={prefs}
      prefOverride={prefOverride}
      showNetwork={false}
      onVoteSegment={handleVote}
      stats={(r) => (
        <div className="grid gap-2">
          <TradeoffCard data={r} mode="green" />
          <VoiceNavButton route={r.recommended} />
        </div>
      )}
    >
      <Panel title="City ↔ Rural">
        <PresetProfiles onApply={applyPreset} />
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
        {voted && (
          <button
            type="button"
            onClick={() => setVoteAdjust({})}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Reset segment votes
          </button>
        )}
        <Legend mode="green" labels={{ good: "Rural feel", ok: "Some green", bad: "Concrete" }} />
      </Panel>
    </MapPage>
  );
}
