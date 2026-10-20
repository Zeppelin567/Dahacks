import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { UiMode } from "@/bikemap/theme";
import type { DemoData } from "./data";

// The sandbox shows the real BikeScape website (web/, `npm run dev`), so it always matches the current app.
// One frame per mode stays loaded, so the deck's Fast & Safe ↔ Nature slider switches instantly.
const WEBSITE = import.meta.env.VITE_WEBSITE_URL ?? "http://localhost:5173/";
const TRIP: Record<UiMode, string> = {
  modern: "?from=infinite-loop&to=library",
  nature: "?mode=nature&from=library&to=main-street",
};

export function ProductDemo({
  ui,
}: {
  data: DemoData;
  paused: boolean;
  ui: UiMode;
  onModeChange: (mode: UiMode) => void;
}) {
  // The page keeps scrolling over the map until the presenter clicks into it.
  const [live, setLive] = useState(false);

  return (
    <div className="ls-sandbox" data-ui={ui} onMouseLeave={() => setLive(false)}>
      <div className="ls-frames">
        {(["modern", "nature"] as const).map((m) => (
          <iframe
            key={m}
            src={WEBSITE + TRIP[m]}
            title={m === "modern" ? "BikeScape, Fast & Safe" : "BikeScape, Nature"}
            className={m === ui ? "is-shown" : ""}
            tabIndex={m === ui ? 0 : -1}
          />
        ))}
        {!live && (
          <button type="button" className="ls-shield" onClick={() => setLive(true)}>
            <span>Click to try it</span>
          </button>
        )}
      </div>
      <div className="ls-foot">
        <span>Real routes. Real street scores.</span>
        <a href={WEBSITE + TRIP[ui]} target="_blank" rel="noreferrer">
          Live app <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}
