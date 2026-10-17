// The Race ride bar (v3 #ride), bottom centre: two lanes (ghost on the fast way, Pip on ours) with the fast
// way's crossings as rings that fill when the ghost hits them, live counters, then the result (+min, scares/trees).
import { Ico } from "./icons";
import type { UiMode } from "./theme";

export type RideLive = {
  fast: number;
  ours: number;
  scares: number;
  hit: number[];
  leaves: number;
  leavesFast: number;
  oursHit?: number;
};
export type RideResult = {
  extraMin: number;
  scares: number;
  oursRisky: number;
  treesOurs: number;
  treesFast: number;
};

export function RideBar({
  ui,
  open,
  live,
  result,
  crossings = [],
  onStop,
  onAgain,
}: {
  ui: UiMode;
  open: boolean;
  live?: RideLive | null;
  result?: RideResult | null;
  /** Modern: each crossing's position along the fast route, 0..1, with its number */
  crossings?: { n: number; f: number }[];
  onStop: () => void;
  onAgain: () => void;
}) {
  const modern = ui === "modern";
  const pos = (f: number) => `calc(14px + (100% - 28px) * ${Math.max(0, Math.min(1, f))})`;
  return (
    <div className="bm-ride" data-open={open || undefined} inert={!open} aria-live="polite">
      {result ? (
        <>
          <button type="button" className="btn" aria-label="Replay" onClick={onAgain}>
            <Ico n="replay" />
          </button>
          <div className="result">
            <span>
              {result.extraMin >= 0 ? "+" : "−"}
              {Math.abs(result.extraMin).toFixed(1)}
              <small>min</small>
            </span>
            <i className="sep" />
            {modern ? (
              <>
                <span className="grp" style={{ color: "var(--bm-bad)" }}>
                  <Ico n="scare" />
                </span>
                <span className="grp">
                  <i className="dot f" />
                  <span className="bad">{result.scares}</span>
                </span>
                <span className="grp">
                  <i className="dot u" />
                  <span className="us">{result.oursRisky}</span>
                </span>
              </>
            ) : (
              <>
                <span className="grp" style={{ color: "var(--bm-ours)" }}>
                  <Ico n="tree" />
                </span>
                <span className="grp">
                  <i className="dot f" />
                  <span style={{ color: "var(--bm-ink2)" }}>{result.treesFast}</span>
                </span>
                <span className="grp">
                  <i className="dot u" />
                  <span className="us">{result.treesOurs}</span>
                </span>
              </>
            )}
          </div>
          <button type="button" className="btn soft" aria-label="Close" onClick={onStop}>
            <Ico n="close" />
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" aria-label="Stop" onClick={onStop}>
            <Ico n="close" />
          </button>
          <div className="lane">
            <div className="ln a">
              <i className="fill" style={{ width: `${(live?.fast ?? 0) * 100}%` }} />
              {modern &&
                crossings.map((x) => (
                  <i
                    key={x.n}
                    className={live?.hit.includes(x.n) ? "x hit" : "x"}
                    style={{ left: `${x.f * 100}%` }}
                  />
                ))}
            </div>
            <div className="ln b">
              <i className="fill" style={{ width: `${(live?.ours ?? 0) * 100}%` }} />
            </div>
            <i className="rd g" style={{ left: pos(live?.fast ?? 0) }} />
            <i className="rd p" style={{ left: pos(live?.ours ?? 0) }} />
          </div>
          <span className="cnt g">
            <i className="dot f" />
            <Ico n={modern ? "scare" : "leaf"} />
            <span>{modern ? (live?.scares ?? 0) : (live?.leavesFast ?? 0)}</span>
          </span>
          <span className="cnt p" id="bm-ride-pip">
            <i className="dot u" />
            <Ico n={modern ? "scare" : "leaf"} />
            <span>{modern ? (live?.oursHit ?? 0) : (live?.leaves ?? 0)}</span>
          </span>
        </>
      )}
    </div>
  );
}
