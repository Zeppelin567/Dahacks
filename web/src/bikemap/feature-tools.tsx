import type { GreenPrefs } from "./api";
import type { UiMode } from "./theme";
import type { useRouteVoice } from "./use-voice";

export const GREEN_PRESETS = [
  { label: "Fastest", rural: 0, prefs: { green: true, quiet: true, shade: false } },
  { label: "Balanced", rural: 0.5, prefs: { green: true, quiet: true, shade: false } },
  { label: "Max nature", rural: 1, prefs: { green: true, quiet: true, shade: true } },
];

export function FeatureTools(p: {
  ui: UiMode;
  rural: number;
  onRural: (value: number) => void;
  onPreset: (rural: number, prefs: GreenPrefs) => void;
  hasVotes: boolean;
  onResetVotes: () => void;
  armed: boolean;
  onReport: () => void;
  voice: ReturnType<typeof useRouteVoice>;
  canListen: boolean;
}) {
  return (
    <section className="bm-feature-tools" aria-label="Ride preferences and tools">
      {p.ui === "nature" && (
        <>
          <h2>Make it your ride</h2>
          <div className="bm-feature-actions">
            {GREEN_PRESETS.map((preset) => (
              <button type="button" key={preset.label} onClick={() => p.onPreset(preset.rural, preset.prefs)}>
                {preset.label}
              </button>
            ))}
          </div>
          <label className="bm-scenic-slider">
            <span>
              Scenic preference <output>{Math.round(p.rural * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={p.rural}
              onChange={(e) => p.onRural(Number(e.target.value))}
            />
            <small>
              Direct <span>Scenic</span>
            </small>
          </label>
          <p>Tap a route stretch to ask for more or less like it.</p>
          {p.hasVotes && (
            <button type="button" onClick={p.onResetVotes}>
              Reset stretch votes
            </button>
          )}
        </>
      )}
      <div className="bm-feature-actions">
        <button
          type="button"
          disabled={!p.voice.supported || !p.canListen}
          aria-pressed={p.voice.speaking}
          onClick={p.voice.toggle}
        >
          {p.voice.speaking ? "Stop listening" : "Listen to route"}
        </button>
        <button type="button" aria-pressed={p.armed} onClick={p.onReport}>
          {p.armed ? "Cancel report" : "Report a hazard"}
        </button>
      </div>
      <p>
        {p.voice.supported
          ? "Listen plays a route overview. It does not track your position."
          : "Speech is unavailable in this browser."}
      </p>
      <p>Hazards and stretch votes are saved on this browser only.</p>
      {p.voice.error && <p role="status">{p.voice.error}</p>}
    </section>
  );
}
