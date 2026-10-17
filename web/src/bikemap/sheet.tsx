// The v3 sheet: one solid rounded surface. Trip line (Pip + From -> To pickers), the headline
// (fast way -> our way, counting up), Ours/Fast route buttons, Nature's Direct|Scenic, then a compact legend
// row that is also the "More" expander (details: km, worst spot, named crossings, who can ride it / chips, trees, photos).
// Desktop: floating card top-left. <=700px: bottom sheet (sets --bm-sheet-h on <html> for the map's padding).
import "./sheet.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GreenPrefs, LatLng, Place, Route, RoutePhoto, RouteResponse } from "./api";
import {
  crossingTags,
  heroVals,
  RIDERS,
  shortName,
  treesAlong,
  tripName,
  whoCanRide,
  worstOf,
} from "./derive";
import { Ico, RiderIco } from "./icons";
import type { Crossing } from "./map/layers/shared";
import { PointPicker } from "./panels";
import { LEVEL_COLORS, LEVEL_LABELS, type UiMode } from "./theme";
import { useBikeTheme } from "./theme-context";
import type { Pin, TripPoint } from "./trip";

export type RouteSel = "rec" | "fast";

export type SheetProps = {
  ui: UiMode;
  /** presets for the pickers (from /places) */
  places: Place[];
  /** everything the pickers can match locally (presets + nature spots) */
  pins: Pin[];
  start?: TripPoint;
  end?: TripPoint;
  onStart: (p: TripPoint) => void;
  onEnd: (p: TripPoint) => void;
  onSwap: () => void;
  /** "My location" resolved (the app may fly there) */
  onLocate?: (p: TripPoint) => void;
  /** the current mode's /route response */
  route?: RouteResponse;
  /** a request is in flight (the old route may still be on screen) */
  loading: boolean;
  error?: string;
  /** which line is highlighted on the map */
  sel: RouteSel;
  onSel: (k: RouteSel) => void;
  /** Nature: Direct (false) | Scenic (true) */
  scenic: boolean;
  onScenic: (scenic: boolean) => void;
  prefs: GreenPrefs;
  onPrefs: (p: GreenPrefs) => void;
  /** Modern: the numbered beads on the fast line (from the map layer) */
  crossings?: Crossing[];
  onCrossing?: (c: Crossing) => void;
  /** the crossing whose card is open (row highlight) */
  activeCrossing?: number | null;
  /** Nature: Street View stops along our route */
  photos?: RoutePhoto[];
  onPhoto?: (i: number) => void;
  /** street-tree points (/green-layers), for "trees along" in Nature */
  trees?: LatLng[];
  /** true while the route draws itself in: "Our way" shows "–", then counts up from the fast number */
  drawing?: boolean;
  /** bump to make Pip hop (e.g. when the route finishes drawing) */
  hop?: number;
  /** phone: the small play button in the trip line opens the "Try it" tray */
  onTry?: () => void;
  defaultMore?: boolean;
};

const fmt = (v: number | null) => (v == null ? "–" : String(Math.round(v)));

/** Animates to `target` (ease-out, 700 ms). When `seed.key` changes it restarts from `seed.from`. */
function useCount(target: number | null, seed: { key: string; from: number | null }, rm: boolean) {
  const [v, setV] = useState<number | null>(target);
  const cur = useRef<number | null>(target);
  const lastKey = useRef(seed.key);
  useEffect(() => {
    if (target == null) {
      cur.current = null;
      setV(null);
      return;
    }
    let from = cur.current ?? seed.from ?? target;
    if (seed.key !== lastKey.current) {
      lastKey.current = seed.key;
      if (seed.from != null) from = seed.from;
    }
    if (rm || from === target) {
      cur.current = target;
      setV(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 700);
      const val = from + (target - from) * (1 - (1 - t) ** 3);
      cur.current = val;
      setV(val);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, seed.key, seed.from, rm]);
  return v;
}

/** Restart a one-shot CSS animation class (Pip's pop / hop). */
function usePulse(trigger: unknown, cls: string, skipFirst = true) {
  const ref = useRef<HTMLImageElement>(null);
  const first = useRef(skipFirst);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run exactly when the trigger changes
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.classList.remove("pop", "hop");
    void el.offsetWidth;
    el.classList.add(cls);
  }, [trigger]);
  return ref;
}

export function Sheet(p: SheetProps) {
  const { ui, route, sel } = p;
  const { pip, reducedMotion } = useBikeTheme();
  const [more, setMore] = useState(!!p.defaultMore);
  const sheet = useRef<HTMLElement>(null);

  // Pip changes outfit with a pop on mode switch, and hops when asked (route drawn).
  const pipRef = usePulse(ui, "pop");
  const hopRef = useRef(p.hop);
  useEffect(() => {
    if (p.hop === hopRef.current) return;
    hopRef.current = p.hop;
    const el = pipRef.current;
    if (!el) return;
    el.classList.remove("pop", "hop");
    void el.offsetWidth;
    el.classList.add("hop");
  }, [p.hop, pipRef]);

  // phones: tell the map how tall the bottom sheet is (camera padding, controls, scale bar)
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--bm-sheet-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hero = heroVals(ui, route);
  const routeKey = route
    ? `${ui}|${route.recommended.distance_m}|${route.recommended.coords.length}|${route.fastest.distance_m}`
    : "";
  // a mode switch jumps straight to the new mode's fast-way number (never counts through the other mode's value)
  const them = useCount(hero?.them ?? null, { key: ui, from: hero?.them ?? null }, reducedMotion);
  const us = useCount(
    hero && !p.drawing ? hero.us : null,
    { key: routeKey, from: hero?.them ?? null },
    reducedMotion,
  );
  const same = !!hero && hero.us === hero.them;

  const toggleMore = (on = !more) => setMore(on);
  const grabY = useRef<number | null>(null);

  return (
    <aside
      ref={sheet}
      className="bm-sheet bm-ui"
      data-more={more || undefined}
      data-loading={(p.loading && !!route) || undefined}
      aria-label="Trip"
    >
      <div
        className="grab"
        aria-hidden="true"
        onPointerDown={(e) => {
          grabY.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (grabY.current == null) return;
          const dy = e.clientY - grabY.current;
          grabY.current = null;
          if (dy < -20) toggleMore(true);
          else if (dy > 20) toggleMore(false);
          else toggleMore();
        }}
      />

      {/* A. trip: Pip, then From -> To; each name opens its picker */}
      <section className="trip">
        <div className="bubble">
          <img ref={pipRef} className="bm-pip" src={pip} alt="Pip" />
        </div>
        <div className="ft">
          <PointPicker
            which="from"
            value={p.start}
            places={p.places}
            pins={p.pins}
            onPick={p.onStart}
            onSwap={p.onSwap}
            onLocate={p.onLocate}
          >
            <button
              type="button"
              className="pt from"
              aria-label={`From ${p.start?.name ?? ""}. Change start`}
            >
              <i />
              <span title={p.start?.name}>{p.start ? tripName(p.start.name) : "Start"}</span>
            </button>
          </PointPicker>
          <Ico n="arrow" className="ft-arrow" />
          <PointPicker
            which="to"
            value={p.end}
            places={p.places}
            pins={p.pins}
            onPick={p.onEnd}
            onSwap={p.onSwap}
          >
            <button
              type="button"
              className="pt to"
              aria-label={`To ${p.end?.name ?? ""}. Change destination`}
            >
              <i className="e" />
              <span title={p.end?.name}>{p.end ? tripName(p.end.name) : "Destination"}</span>
            </button>
          </PointPicker>
        </div>
        {p.onTry && (
          <button type="button" className="try-mini" aria-label="Try it" onClick={p.onTry}>
            <Ico n="play" />
          </button>
        )}
      </section>

      {/* B. hero: two numbers; the whole block toggles More */}
      <button
        type="button"
        className="hero hl"
        aria-label={
          hero && !p.error
            ? `${hero.label} ${hero.them}${hero.unit} to ${hero.us}${hero.unit}. ${more ? "Less" : "More"}`
            : undefined
        }
        aria-expanded={more}
        aria-controls="bm-more"
        onClick={() => toggleMore()}
      >
        {p.error ? (
          <span className="hero-err">
            <img className="bm-pip" src={pip} alt="" />
            <span>{p.error}</span>
          </span>
        ) : !hero ? (
          <span className="hero-wait">
            <span className="ring">
              <img className="bm-pip" src={pip} alt="" />
            </span>
            <span>Finding your way…</span>
          </span>
        ) : (
          <>
            <span className="hero-label">
              <Ico n={hero.icon} />
              {hero.label}
              {p.loading && <span className="bm-spin" role="status" aria-label="Updating" />}
            </span>
            <span className={same ? "nums same" : "nums"}>
              <span className="col">
                <span className="num them">
                  {fmt(them)}
                  {them != null && <small>{hero.unit}</small>}
                </span>
                <span className="cap">
                  <i className="dot f" />
                  Fast way
                </span>
              </span>
              <span className="arrow">
                <Ico n="arrow" />
              </span>
              <span className="col">
                <span className={us == null ? "num us wait" : "num us"}>
                  {fmt(us)}
                  {us != null && <small>{hero.unit}</small>}
                </span>
                <span className="cap">
                  <i className="dot u" />
                  Our way
                </span>
              </span>
            </span>
          </>
        )}
      </button>

      {/* C. which line is highlighted */}
      {route && (
        <section className="routes">
          <button type="button" className="rt" aria-pressed={sel === "rec"} onClick={() => p.onSel("rec")}>
            <i className="dot u" />
            Ours <b>{route.recommended.duration_min.toFixed(1)}</b>
            <small>min</small>
          </button>
          <button type="button" className="rt" aria-pressed={sel === "fast"} onClick={() => p.onSel("fast")}>
            <i className="dot f" />
            Fast <b>{route.fastest.duration_min.toFixed(1)}</b>
            <small>min</small>
          </button>
        </section>
      )}

      {/* D. Nature: Direct | Scenic (folds away in Modern) */}
      <div className="fold" aria-hidden={ui !== "nature"}>
        <div>
          <ScenicSeg scenic={p.scenic} onChange={p.onScenic} disabled={ui !== "nature"} />
        </div>
      </div>

      <div className="more" id="bm-more">
        <div>
          <div className="more-in">{route && <More {...p} route={route} />}</div>
        </div>
      </div>

      <button
        type="button"
        className="more-btn hl"
        aria-expanded={more}
        aria-controls="bm-more"
        onClick={() => toggleMore()}
      >
        <Legend ui={ui} />
        <span className="ml">
          {more ? "Less" : "More"}
          <Ico n="chevD" />
        </span>
      </button>
    </aside>
  );
}

function ScenicSeg({
  scenic,
  onChange,
  disabled,
}: {
  scenic: boolean;
  onChange: (s: boolean) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className={scenic ? "segc r" : "segc"} aria-label="Direct or scenic" disabled={disabled}>
      <span className="th" aria-hidden="true" />
      <button type="button" aria-pressed={!scenic} onClick={() => onChange(false)}>
        <Ico n="direct" />
        Direct
      </button>
      <button type="button" aria-pressed={scenic} onClick={() => onChange(true)}>
        <Ico n="leaf" />
        Scenic
      </button>
    </fieldset>
  );
}

/** Always visible, inside the More row: three swatches. */
export function Legend({ ui }: { ui: UiMode }) {
  const c = LEVEL_COLORS[ui];
  const l = LEVEL_LABELS[ui];
  return (
    <span className="legend">
      <span>
        <i style={{ background: c.good }} />
        {l.good}
      </span>
      <span>
        <i style={{ background: c.ok }} />
        {l.ok}
      </span>
      <span>
        <i
          className={ui === "nature" ? "bare" : undefined}
          style={ui === "nature" ? undefined : { background: c.bad }}
        />
        {ui === "nature" ? "Bare" : l.bad}
      </span>
    </span>
  );
}

const PREFS: { k: keyof GreenPrefs; icon: "tree" | "quiet" | "shade"; label: string }[] = [
  { k: "green", icon: "tree", label: "Greenery" },
  { k: "quiet", icon: "quiet", label: "Quiet" },
  { k: "shade", icon: "shade", label: "Shade" },
];

function Fact({ v, l, cls }: { v: string; l: string; cls?: string }) {
  return (
    <span className="fact">
      <b className={cls}>{v}</b>
      <span>{l}</span>
    </span>
  );
}

function More(p: SheetProps & { route: RouteResponse }) {
  const { ui, route, sel } = p;
  const us = sel === "rec";
  const rr: Route = us ? route.recommended : route.fastest;
  const dot = <i className={us ? "dot u" : "dot f"} />;
  const km = (rr.distance_m / 1000).toFixed(1);
  const trees = useMemo(() => (ui === "nature" ? treesAlong(rr, p.trees) : 0), [ui, rr, p.trees]);

  if (ui === "modern") {
    const worst = worstOf(rr);
    const who = whoCanRide(rr);
    const xs = p.crossings ?? [];
    return (
      <>
        <section>
          <div className="facts">
            {dot}
            <Fact v={km} l="km" />
            <Fact v={`${worst}/10`} l="worst spot" cls={worst < 4 ? "bad" : undefined} />
          </div>
        </section>
        {xs.length > 0 && (
          <section>
            <div className="mini-h">
              <Ico n="scare" />
              <i className="dot f" />
              <span>Fast</span>
            </div>
            <div className="rows">
              {xs.map((x) => (
                <button
                  key={x.n}
                  type="button"
                  className={p.activeCrossing === x.n ? "row on" : "row"}
                  onClick={() => p.onCrossing?.(x)}
                >
                  <span className="xn">{x.n}</span>
                  <span className="rn">{shortName(x.name)}</span>
                  <span className="tags">
                    {crossingTags(x.segment.reasons).map((ic) => (
                      <Ico key={ic} n={ic} />
                    ))}
                  </span>
                  <Ico n="chevR" />
                </button>
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="riders">
            {RIDERS.map(({ k, label }) => (
              <div
                key={k}
                className={who[k] ? "rider-c on" : "rider-c"}
                title={label}
                role="img"
                aria-label={`${label}: ${who[k] ? "yes" : "no"}`}
              >
                <span>
                  <RiderIco k={k} />
                </span>
                <em>
                  <Ico n={who[k] ? "check" : "close"} />
                </em>
              </div>
            ))}
          </div>
        </section>
        <Fine />
      </>
    );
  }
  return (
    <>
      <section>
        <div className="chips">
          {PREFS.map(({ k, icon, label }) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={p.prefs[k]}
              onClick={() => p.onPrefs({ ...p.prefs, [k]: !p.prefs[k] })}
            >
              <Ico n={icon} />
              {label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="facts">
          {dot}
          <Fact v={km} l="km" />
          {p.trees && <Fact v={String(trees)} l="trees" cls={us ? "us" : undefined} />}
        </div>
      </section>
      {(p.photos?.length ?? 0) > 0 && (
        <section>
          <div className="thumbs">
            {p.photos?.map((ph, i) =>
              ph.detail.photo ? (
                <button
                  key={ph.detail.photo.url}
                  type="button"
                  aria-label={ph.detail.name}
                  title={ph.detail.name}
                  onClick={() => p.onPhoto?.(i)}
                >
                  <img alt="" src={ph.detail.photo.url} loading="lazy" />
                </button>
              ) : null,
            )}
          </div>
        </section>
      )}
      <Fine />
    </>
  );
}

function Fine() {
  return (
    <section>
      <div className="fine">
        <Ico n="spark" />
        Scores: Claude reading street photos
      </div>
    </section>
  );
}
