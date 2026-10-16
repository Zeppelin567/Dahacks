import { Button } from "@/components/ui/button";
import type { GreenPrefs } from "./api";

export type GreenPreset = {
  label: string;
  rural: number;
  prefs: GreenPrefs;
};

/** Named presets (BikeButler-style): one tap sets the whole preference bundle. */
export const GREEN_PRESETS: GreenPreset[] = [
  { label: "🏙️ Fastest", rural: 0, prefs: { green: true, quiet: true, shade: false } },
  { label: "⚖️ Balanced", rural: 0.5, prefs: { green: true, quiet: true, shade: false } },
  { label: "🌾 Max nature", rural: 1, prefs: { green: true, quiet: true, shade: true } },
];

export function PresetProfiles({ onApply }: { onApply: (p: GreenPreset) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GREEN_PRESETS.map((p) => (
        <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => onApply(p)}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}
