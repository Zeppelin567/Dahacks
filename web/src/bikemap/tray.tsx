// "Try it" (v3 #tools): a small button bottom-right that springs open a tray of demo tiles (Race, and Listen /
// Split if wired). On phones the button is hidden; the sheet's play button opens the tray above the sheet.
import { Ico, type IconName } from "./icons";

export type RaceState = "idle" | "running" | "done";

function Tile({
  icon,
  word,
  sub,
  pressed,
  onClick,
  disabled = false,
}: {
  icon: IconName;
  word: string;
  sub: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="tile" disabled={disabled} aria-pressed={pressed} onClick={onClick}>
      <Ico n={icon} />
      {word}
      <small>{sub}</small>
    </button>
  );
}

export function TryTray({
  hidden = false,
  open,
  onOpenChange,
  race = "idle",
  onRace,
  canRace = true,
  onReport,
  listening = false,
  onListen,
  split = false,
  onSplit,
}: {
  /** hide the whole thing (during a race, like v3) */
  hidden?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  race?: RaceState;
  /** start, stop or replay (the app decides from `race`) */
  onRace?: () => void;
  canRace?: boolean;
  onReport?: () => void;
  listening?: boolean;
  onListen?: () => void;
  split?: boolean;
  onSplit?: () => void;
}) {
  const close = (fn?: () => void) => () => {
    onOpenChange(false);
    fn?.();
  };
  return (
    <div
      className="bm-tools bm-ui"
      data-open={open || undefined}
      data-hidden={hidden || undefined}
      inert={hidden}
    >
      <div className="tray" inert={!open}>
        {onRace && (
          <Tile
            icon={race === "running" ? "close" : race === "done" ? "replay" : "flag"}
            disabled={!canRace}
            word={race === "running" ? "Stop" : race === "done" ? "Again" : "Race"}
            sub="Race the fast way"
            pressed={race !== "idle"}
            onClick={close(onRace)}
          />
        )}
        {onListen && (
          <Tile
            icon="listen"
            word="Listen"
            sub="Route overview"
            pressed={listening}
            onClick={close(onListen)}
          />
        )}
        {onReport && (
          <Tile icon="flag" word="Report" sub="Mark a hazard" pressed={false} onClick={close(onReport)} />
        )}
        {onSplit && (
          <Tile icon="split" word="Split" sub="Split the city" pressed={split} onClick={close(onSplit)} />
        )}
      </div>
      <button
        type="button"
        className="tools-btn"
        aria-label="Try it"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="play">
          <Ico n="play" />
        </span>
        Try it
      </button>
    </div>
  );
}
