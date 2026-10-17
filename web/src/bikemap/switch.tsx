// The Modern | Nature switch, top centre (v3 #switch): a chip-coloured thumb springs across; long-press opens Split.
import { useRef } from "react";
import { Ico } from "./icons";
import type { UiMode } from "./theme";

export function ModeSwitch({
  ui,
  onChange,
  onLongPress,
  split = false,
}: {
  ui: UiMode;
  onChange: (m: UiMode) => void;
  /** optional: hold the switch for half a second (v3 opens the Split seam) */
  onLongPress?: () => void;
  /** true while the seam is held open: the thumb fades out */
  split?: boolean;
}) {
  const timer = useRef(0);
  const longPressed = useRef(false);
  const down = () => {
    if (!onLongPress) return;
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, 500);
  };
  const up = () => window.clearTimeout(timer.current);
  const pick = (m: UiMode) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (m !== ui || split) onChange(m);
  };
  return (
    <div
      className="bm-modeswitch bm-ui"
      role="tablist"
      aria-label="Map mode"
      data-split={split || undefined}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
    >
      <span className="thumb" aria-hidden="true" />
      {(["modern", "nature"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          data-mode={m}
          aria-selected={ui === m}
          onClick={() => pick(m)}
        >
          <Ico n={m === "modern" ? "building" : "leaf"} />
          {m === "modern" ? "Modern" : "Nature"}
        </button>
      ))}
    </div>
  );
}
