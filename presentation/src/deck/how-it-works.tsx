import {
  Braces,
  Camera,
  Check,
  DollarSign,
  FlaskConical,
  Gauge,
  Leaf,
  Map as MapIcon,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { FACTS, type Manifest, MEDIA, SITE } from "../data";
import { Kicker, Pip } from "./parts";
import { PhotoRing } from "./photo-ring";
import "./how-it-works.css";

/*
 * "How we built it": four steps, one slide each, plus an overview.
 *   Overview  HowWeBuiltSlide      the four steps at a glance (the old deck's STEP 01-04 flow)
 *   STEP 1    EveryStreetSlide     map -> a dot every 80 m -> free photo check -> 2 / 4 photos -> 14,541
 *   STEP 2    ReadingStreetSlide   one spot's photos + map facts -> Claude Haiku 5.5 -> JSON
 *   STEP 3    SpotsToStreetsSlide  spot scores -> street medians, junctions, rules, team-set -> the coloured map
 *   STEP 4    FeltDistanceSlide    felt length, crossing cost, Dijkstra, 1.5x cap, ~9 ms, Green slider
 * Every number is from docs/backend-story.md, Dahacks-design/build/TECH_STACK.md or py/data (real Claude output).
 * The coloured maps are drawn from the live API (/bikemap/network), saved as public/site/streets-*.json.
 */

const d = (i: number) => ({ "--i": i }) as CSSProperties;

/** The website's own street colours (web/src/bikemap/theme.ts, LEVEL_COLORS). */
const SAFE_COLORS = { good: "#3B9677", ok: "#E8A23A", bad: "#D9653B" } as const;
const GREEN_COLORS = { good: "#3F7D2A", ok: "#8EBF4C", bad: "#CDAA72" } as const;
type Level = keyof typeof SAFE_COLORS;
/** Same bands as the engine: 7+ calm, 4-6 busy, 3 or less risky. */
const levelOf = (score: number): Level => (score >= 7 ? "good" : score >= 4 ? "ok" : "bad");

function useManifest() {
  const [m, setM] = useState<Manifest>();
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${MEDIA}manifest.json`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("manifest"))))
      .then(setM)
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  return m;
}

/* ------------------------------------------------------------------ */
/* Step tracker shown on every "how we built it" slide                 */
/* ------------------------------------------------------------------ */

type StepN = 1 | 2 | 3 | 4;
const STEPS: { n: StepN; label: string }[] = [
  { n: 1, label: "Collect" },
  { n: 2, label: "Read" },
  { n: 3, label: "Map" },
  { n: 4, label: "Route" },
];

export function StepTrack({ at }: { at: StepN }) {
  return (
    <div className="hw-track rv" role="img" aria-label={`How we built it: step ${at} of 4`}>
      <span className="hw-track-name">
        <Wrench size={14} /> How we built it
      </span>
      <ol>
        {STEPS.map((s) => (
          <li key={s.n} className={s.n === at ? "on" : s.n < at ? "done" : ""}>
            <b>{s.n < at ? <Check size={13} strokeWidth={3} /> : s.n}</b>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview: the four steps                                            */
/* ------------------------------------------------------------------ */

const INTRO: { n: StepN; title: string; line: string; tone: "navy" | "coral" | "calm"; art: ReactNode }[] = [
  {
    n: 1,
    title: "Collect",
    line: `A photo stop every ${FACTS.sampleEveryM} m, on every street`,
    tone: "navy",
    art: (
      <div className="hw-fan">
        <img src={`${MEDIA}street-24.jpg`} alt="" />
        <img src={`${MEDIA}junction-0.jpg`} alt="" />
        <img src={`${MEDIA}street-04.jpg`} alt="" />
      </div>
    ),
  },
  {
    n: 2,
    title: "Read",
    line: `${FACTS.model} scores each spot`,
    tone: "coral",
    art: (
      <div className="hw-mini-score">
        <Sparkles size={20} />
        <b>
          2<small>/10</small>
        </b>
        <span>LTS 4</span>
      </div>
    ),
  },
  {
    n: 3,
    title: "Map",
    line: "Spot scores become street scores",
    tone: "calm",
    art: (
      <svg viewBox="0 0 160 70" className="hw-mini-art" aria-hidden>
        <path d="M10 48 H150" stroke="var(--chip)" strokeWidth="10" strokeLinecap="round" />
        <path className="hw-draw" d="M10 48 H150" stroke={SAFE_COLORS.good} strokeWidth="10" strokeLinecap="round" pathLength={1} />
        {[7, 6, 7, 5, 7].map((s, i) => (
          <circle key={`${s}-${i}`} cx={22 + i * 29} cy="22" r="9" fill={SAFE_COLORS[levelOf(s)]} stroke="#fff" strokeWidth="2.5" />
        ))}
      </svg>
    ),
  },
  {
    n: 4,
    title: "Route",
    line: "Find the way that feels shortest",
    tone: "navy",
    art: (
      <svg viewBox="0 0 160 70" className="hw-mini-art" aria-hidden>
        <g stroke="#fff" strokeWidth="5" strokeLinecap="round">
          <path d="M20 8 V62 M80 8 V62 M140 8 V62 M8 20 H152 M8 50 H152" />
        </g>
        <path d="M20 20 V50 H140" stroke="var(--ghost)" strokeWidth="4" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
        <path className="hw-draw" d="M20 20 H80 V50 H140" stroke="var(--navy)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} />
        <circle cx="20" cy="38" r="6" fill="var(--risky)" stroke="#fff" strokeWidth="2" />
      </svg>
    ),
  },
];

export function HowWeBuiltSlide() {
  return (
    <section className="slide city streets hw hw-intro">
      <div className="wrap">
        <div className="hw-intro-head">
          <Kicker icon={<Wrench size={15} />}>How we built it</Kicker>
          <h2 className="h rv" style={d(1)}>
            From a street photo
            <br />
            to your route.
          </h2>
        </div>
        <div className="hw-path">
          <div className="hw-path-line" aria-hidden />
          <div className="hw-rider" aria-hidden>
            <Pip size={68} />
          </div>
          <ol className="hw-cards">
            {INTRO.map((s, i) => (
              <li key={s.n} className={`hw-step card rv tone-${s.tone}`} style={d(2 + i)}>
                <span className="hw-stop" aria-hidden />
                <span className="hw-step-n">STEP 0{s.n}</span>
                <div className="hw-step-art">{s.art}</div>
                <h3>{s.title}</h3>
                <p>{s.line}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="chips center rv" style={d(6)}>
          <span className="chip">
            <Camera size={16} /> {FACTS.photosTotal.toLocaleString("en-US")} street photos
          </span>
          <span className="chip strong">{FACTS.scoringCost} to score Cupertino</span>
          <span className="chip">
            <Timer size={16} /> {FACTS.routeMs} per route
          </span>
          <span className="chip">0 AI calls while you ride</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 1 · Every street (data collection)                             */
/* ------------------------------------------------------------------ */

/** Wedge for a 90° Street View photo, pointing at angle `a` (degrees, 0 = east, 90 = south). */
function wedge(cx: number, cy: number, r: number, a: number, spread = 90) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a1 = rad(a - spread / 2);
  const a2 = rad(a + spread / 2);
  const p = (t: number) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  return `M${cx} ${cy} L${p(a1)} A${r} ${r} 0 0 1 ${p(a2)} Z`;
}

function SampleDiagram({ junctions }: { junctions?: string[] }) {
  const road = [60, 140, 220, 500];
  const side = [40, 200];
  return (
    <div className="hw-sample card rv" style={d(3)}>
      <svg viewBox="0 0 600 230" className="hw-sample-map" role="img" aria-label="A photo stop every 80 metres and at every junction: 2 photos on a road, 4 at a junction">
        <rect x="0" y="0" width="600" height="230" rx="18" fill="var(--bg)" />
        {/* streets, like the website's paper map */}
        <g fill="none" strokeLinecap="round">
          <path d="M18 120 H582 M420 14 V216" stroke="rgba(60,45,20,0.08)" strokeWidth="26" />
          <path d="M18 120 H582 M420 14 V216" stroke="#fff" strokeWidth="22" />
        </g>
        {/* 80 m ruler */}
        <g className="hw-ruler" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round">
          <path d="M60 84 H140 M60 77 V91 M140 77 V91" />
        </g>
        <text x="100" y="70" textAnchor="middle" className="hw-svg-label">
          80 m
        </text>
        {/* photo wedges: forward + curb side on a road, N/E/S/W at the junction */}
        <g className="hw-cones">
          <path d={wedge(140, 120, 62, 0)} className="cone" />
          <path d={wedge(140, 120, 62, 90)} className="cone alt" />
          {[-90, 0, 90, 180].map((a) => (
            <path key={a} d={wedge(420, 120, 52, a, 64)} className="cone" />
          ))}
        </g>
        {/* the free check: no photo here, so no photo is bought */}
        <g className="hw-dot skip" style={d(3)}>
          <circle cx="300" cy="120" r="9" />
          <path d="M295 115 L305 125 M305 115 L295 125" />
        </g>
        <text x="300" y="160" textAnchor="middle" className="hw-svg-small">
          no photo here
        </text>
        {road.map((x, i) => (
          <circle key={x} className="hw-dot" style={d(i)} cx={x} cy="120" r="9" />
        ))}
        {side.map((y, i) => (
          <circle key={y} className="hw-dot" style={d(5 + i)} cx="420" cy={y} r="9" />
        ))}
        <rect className="hw-dot junction" style={d(4)} x="409" y="109" width="22" height="22" rx="7" />
        <text x="140" y="210" textAnchor="middle" className="hw-svg-label">
          2 photos
        </text>
        <text x="505" y="70" textAnchor="middle" className="hw-svg-label">
          4 photos
        </text>
      </svg>
      <div className="hw-sample-photos">
        <figure className="hw-pair-mini">
          <div>
            <img src={`${MEDIA}street-04.jpg`} alt="McClellan Road, forward" />
            <figcaption>Forward</figcaption>
          </div>
          <div>
            <img src={`${MEDIA}street-04-right.jpg`} alt="McClellan Road, curb side" />
            <figcaption>Curb side</figcaption>
          </div>
        </figure>
        <figure className="hw-quad-mini">
          {(junctions ?? ["junction-0.jpg", "junction-1.jpg", "junction-2.jpg", "junction-3.jpg"]).slice(0, 4).map((j) => (
            <img key={j} src={`${MEDIA}${j}`} alt="" />
          ))}
          <figcaption>Junction · 4 ways</figcaption>
        </figure>
      </div>
    </div>
  );
}

export function EveryStreetSlide() {
  const manifest = useManifest();
  return (
    <section className="slide nature hw hw-collect">
      <div className="wrap hw-split">
        <div className="hw-main">
          <StepTrack at={1} />
          <h2 className="h rv" style={d(1)}>
            Every street,
            <br />
            every {FACTS.sampleEveryM} m.
          </h2>
          <ol className="hw-flow rv" style={d(2)}>
            <li>
              <i>
                <MapIcon size={17} />
              </i>
              <span>
                <b>Street map</b>
                <small>OpenStreetMap + city bike lanes</small>
              </span>
            </li>
            <li>
              <i>
                <MapPin size={17} />
              </i>
              <span>
                <b>Every {FACTS.sampleEveryM} m</b>
                <small>a photo stop, plus every junction</small>
              </span>
            </li>
            <li>
              <i>
                <Search size={17} />
              </i>
              <span>
                <b>Free check</b>
                <small>is there a photo here?</small>
              </span>
            </li>
            <li>
              <i>
                <Camera size={17} />
              </i>
              <span>
                <b>Street View</b>
                <small>2 on a road, 4 at a junction</small>
              </span>
            </li>
          </ol>
          <SampleDiagram junctions={manifest?.junctionPhotos} />
        </div>
        <div className="hw-ring-col rv" style={d(2)}>
          {manifest ? <PhotoRing photos={manifest.photos} className="hw-ring" /> : <div className="ring-stage hw-ring" />}
          <div className="chips center">
            <span className="chip">{FACTS.photosCupertino.toLocaleString("en-US")} in Cupertino</span>
            <span className="chip">+ {FACTS.photosExtended.toLocaleString("en-US")} in the extended area</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 2 · Reading a street (Claude scores one spot)                  */
/* ------------------------------------------------------------------ */

/*
 * A real spot and Claude's real answer (py/data/safety_scores.jsonl, safe-v2, sample r1126492107_1935652864_0_2;
 * green_scores.jsonl, green-v1). Map facts from the OSM graph: primary, 40 mph, 4-5 lanes.
 * Shown hazards are 2 of the 4 Claude returned; the rider sentence is the app's text (scoring.py HAZARD_TEXT).
 */
type Tok = [cls: "k" | "s" | "n" | "p", text: string];
/** One line of Claude's answer: its tokens, and whether it sits inside the braces / is the headline score. */
type JLine = { toks: Tok[]; inner?: boolean; hl?: boolean };
const JSON_LINES: JLine[] = [
  { toks: [["p", "{"]] },
  { inner: true, toks: [["k", '"seen"'], ["p", ": { "], ["k", '"pavement"'], ["p", ": "], ["s", '"good"'], ["p", ", … },"]] },
  {
    inner: true,
    toks: [["k", '"hazards"'], ["p", ": ["], ["s", '"high_speed_traffic"'], ["p", ", "], ["s", '"freeway_ramp_crossing"'], ["p", ", …],"]],
  },
  { inner: true, toks: [["k", '"lts"'], ["p", ": "], ["n", "4"], ["p", ","]] },
  { inner: true, hl: true, toks: [["k", '"safety_score"'], ["p", ": "], ["n", "2"], ["p", ","]] },
  { inner: true, toks: [["k", '"confidence"'], ["p", ": "], ["s", '"medium"'], ["p", ","]] },
  {
    inner: true,
    toks: [["k", '"note"'], ["p", ": "], ["s", '"Stevens Creek Boulevard at 40 mph with 4-5 lanes under an overpass; a stressful, hard-to-ride corridor."']],
  },
  { toks: [["p", "}"]] },
];

export function ReadingStreetSlide() {
  return (
    <section className="slide city hw hw-read">
      <div className="wrap">
        <div className="hw-head">
          <StepTrack at={2} />
          <h2 className="h rv" style={d(1)}>
            Claude reads one spot.
          </h2>
        </div>
        <div className="hw-pipe">
          <article className="hw-in card rv" style={d(2)}>
            <header>
              <span className="hw-tag">In</span>
              <b>Stevens Creek Blvd</b>
            </header>
            <div className="hw-pair">
              <figure>
                <img src={`${MEDIA}street-20.jpg`} alt="Stevens Creek Boulevard, forward" />
                <figcaption>Forward</figcaption>
              </figure>
              <figure>
                <img src={`${MEDIA}street-20-right.jpg`} alt="Stevens Creek Boulevard, curb side" />
                <figcaption>Curb side</figcaption>
              </figure>
            </div>
            <div className="hw-facts">
              <span className="hw-facts-label">Map facts</span>
              <span className="chip soft">40 mph</span>
              <span className="chip soft">4–5 lanes</span>
              <span className="chip soft">Main road</span>
            </div>
          </article>

          <div className="hw-claude rv" style={d(3)}>
            <div className="hw-claude-badge">
              <Sparkles size={34} />
            </div>
            <b>{FACTS.model}</b>
            <span className="hw-calls">
              <span>1 · Safety</span>
              <span className="g">2 · Greenery</span>
            </span>
          </div>

          <article className="hw-out card rv" style={d(4)}>
            <header>
              <span className="hw-tag coral">Out</span>
              <b>
                <Braces size={16} /> Structured JSON
              </b>
              <span className="hw-score">
                2<small>/10</small>
              </span>
            </header>
            <pre className="hw-json" aria-label="Claude's JSON answer">
              {JSON_LINES.map((line, i) => (
                <span
                  key={line.toks.map((t) => t[1]).join("")}
                  className={`hw-jl${line.inner ? " in" : ""}${line.hl ? " hl" : ""}`}
                  style={d(5 + i * 0.6)}
                >
                  {line.toks.map(([cls, text], j) => (
                    <span key={`${j}${text}`} className={`j-${cls}`}>
                      {text}
                    </span>
                  ))}
                </span>
              ))}
            </pre>
            <div className="hw-out-foot">
              <span className="hw-rider-text">
                <TriangleAlert size={15} /> On the map: “Cars pass at 40 mph or more”
              </span>
              <span className="hw-green-call">
                <Leaf size={15} /> Call 2: greenery 1/10 · shade 0%
              </span>
            </div>
          </article>
        </div>
        <div className="hw-notes">
          <span className="hw-note rv" style={d(9)}>
            <Gauge size={17} />
            <span>
              <b>LTS</b> = traffic stress: 1 a child could ride it, 4 only the fearless
            </span>
          </span>
          <span className="hw-note rv" style={d(10)}>
            <DollarSign size={17} />
            <span>
              <b>{FACTS.scoringCost}</b> for the whole Cupertino run
            </span>
          </span>
          <span className="hw-note rv" style={d(11)}>
            <FlaskConical size={17} />
            <span>
              A <b>20-spot test</b> caught a mistake (curb side out of view), so we fixed the prompt
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 3 · From spots to streets (the bake)                           */
/* ------------------------------------------------------------------ */

type StreetsData = { w: number; h: number; d: Record<Level, string> };

/** Every scored street, drawn from the live API's /bikemap/network layer (saved to public/site/streets-*.json). */
function StreetsMap({ layer, tag, className = "" }: { layer: "safe" | "green"; tag?: string; className?: string }) {
  const [data, setData] = useState<StreetsData>();
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${SITE}streets-${layer}.json`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("streets"))))
      .then(setData)
      .catch(() => {});
    return () => ctl.abort();
  }, [layer]);
  const colors = layer === "safe" ? SAFE_COLORS : GREEN_COLORS;
  // Worse streets draw thicker on the Safe map, greener streets thicker on the Green map (as on the website).
  const widths: Record<Level, number> = layer === "safe" ? { good: 1.5, ok: 2.6, bad: 3.6 } : { good: 3, ok: 1.8, bad: 1.5 };
  const order: Level[] = layer === "safe" ? ["good", "ok", "bad"] : ["bad", "ok", "good"];
  return (
    <figure className={`hw-map card ${layer} ${className}`}>
      {tag && <span className="hw-map-tag">{tag}</span>}
      <svg viewBox={`0 0 ${data?.w ?? 1000} ${data?.h ?? 700}`} role="img" aria-label={`Every scored street, ${layer} map`}>
        {data && (
          <>
            <g fill="none" stroke="var(--line-soft)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              {order.map((lv) => (
                <path key={lv} d={data.d[lv]} />
              ))}
            </g>
            {order.map((lv, i) => (
              <path
                key={lv}
                className="hw-layer"
                style={d(i)}
                d={data.d[lv]}
                fill="none"
                stroke={colors[lv]}
                strokeWidth={widths[lv]}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </>
        )}
      </svg>
      <figcaption className="hw-legend">
        {layer === "safe" ? (
          <>
            <span>
              <i style={{ background: SAFE_COLORS.good }} /> Calm
            </span>
            <span>
              <i style={{ background: SAFE_COLORS.ok }} /> Busy
            </span>
            <span>
              <i style={{ background: SAFE_COLORS.bad }} /> Risky
            </span>
          </>
        ) : (
          <>
            <span>
              <i style={{ background: GREEN_COLORS.good }} /> Leafy
            </span>
            <span>
              <i style={{ background: GREEN_COLORS.ok }} /> Some green
            </span>
            <span>
              <i style={{ background: GREEN_COLORS.bad }} /> Bare
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** Stevens Canyon Road, one street piece: 8 real safe-v2 spot scores in order. Median 7. */
const CANYON = [7, 6, 7, 5, 6, 7, 7, 7];

function MedianArt() {
  return (
    <svg viewBox="0 0 300 60" className="hw-row-art" aria-label="Eight spot scores on Stevens Canyon Road, median 7 out of 10">
      <path d="M12 40 H288" stroke="var(--chip)" strokeWidth="9" strokeLinecap="round" />
      <path className="hw-draw late" d="M12 40 H288" stroke={SAFE_COLORS.good} strokeWidth="9" strokeLinecap="round" pathLength={1} />
      {CANYON.map((s, i) => (
        <g key={`${s}-${i}`} className="hw-pop" style={d(3 + i * 0.35)}>
          <circle cx={22 + i * 29} cy="18" r="11" fill={SAFE_COLORS[levelOf(s)]} stroke="#fff" strokeWidth="2.5" />
          <text x={22 + i * 29} y="22" textAnchor="middle" className="hw-svg-num">
            {s}
          </text>
        </g>
      ))}
      <g className="hw-pop" style={d(7)}>
        <rect x="248" y="4" width="48" height="28" rx="14" fill={SAFE_COLORS.good} />
        <text x="272" y="23" textAnchor="middle" className="hw-svg-num big">
          7
        </text>
      </g>
    </svg>
  );
}

export function SpotsToStreetsSlide() {
  const manifest = useManifest();
  const jx = manifest?.junctionPhotos ?? ["junction-0.jpg", "junction-1.jpg", "junction-2.jpg", "junction-3.jpg"];
  return (
    <section className="slide nature hw hw-bake">
      <div className="wrap hw-split">
        <div className="hw-main">
          <StepTrack at={3} />
          <h2 className="h rv" style={d(1)}>
            From spots
            <br />
            to streets.
          </h2>
          <div className="hw-rows">
            <div className="hw-row card rv" style={d(2)}>
              <MedianArt />
              <p>
                <b>Street = median of its spots.</b> One odd photo can’t flip it.
                <small>Stevens Canyon Rd · 8 spots → 7/10</small>
              </p>
            </div>
            <div className="hw-row card rv" style={d(3)}>
              <div className="hw-jx">
                {jx.slice(0, 4).map((j) => (
                  <img key={j} src={`${MEDIA}${j}`} alt="" />
                ))}
              </div>
              <p>
                <b>Junction = its own score,</b> from its 4 photos.
                <small>It becomes the crossing cost in step 4.</small>
              </p>
            </div>
            <div className="hw-row card rv" style={d(4)}>
              <div className="hw-rules">
                <span style={{ background: SAFE_COLORS.good }}>Path 9</span>
                <span style={{ background: SAFE_COLORS.good }}>Quiet 7</span>
                <span style={{ background: SAFE_COLORS.bad }}>Main 3</span>
                <span style={{ background: SAFE_COLORS.bad }}>Expwy 1</span>
              </div>
              <p>
                <b>No photo?</b> A road-type rule.
                <small>Set a little below what Claude saw.</small>
              </p>
            </div>
            <div className="hw-row card rv" style={d(5)}>
              <span className="hw-team">
                <Users size={20} />
                <em>Set by the team</em>
              </span>
              <p>
                <b>5 team-set scores,</b> on streets we ride.
                <small>Labelled that way on the map.</small>
              </p>
            </div>
          </div>
        </div>
        <div className="hw-map-col">
          <div className="hw-maps rv" style={d(3)}>
            <StreetsMap layer="green" tag="Green map" className="back" />
            <StreetsMap layer="safe" tag="Safe map" className="front" />
            <figure className="hw-popup">
              <img src={`${SITE}street-popup.png`} alt="A street's score and reasons on the live website" />
              <figcaption>Tap any street on the live site</figcaption>
            </figure>
          </div>
          <div className="chips center rv" style={d(6)}>
            <span className="chip">Baked once into the routing graph</span>
            <span className="chip strong">0 AI calls while you ride</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STEP 4 · Felt distance (routing)                                    */
/* ------------------------------------------------------------------ */

/** felt = length × (1 + 3 × (1 − safety)); crossing = 1000 m × (1 − junction)². Bars are out of 500 m. */
const FELT_ROWS: { score: string; label: string; felt: string; w: number; level: Level; extra?: string }[] = [
  { score: "10/10", label: "Calm street", felt: "100 m", w: 20, level: "good" },
  { score: "5/10", label: "Busy street", felt: "250 m", w: 50, level: "ok" },
  { score: "2/10", label: "Risky street", felt: "340 m", w: 68, level: "bad", extra: `${FACTS.feltStressMax}` },
];

function FeltScale() {
  return (
    <div className="hw-felt card rv" style={d(3)}>
      <span className="hw-felt-head">100 m of street feels like:</span>
      {FELT_ROWS.map((r, i) => (
        <div className="hw-felt-row" key={r.score}>
          <span className="hw-pill" style={{ background: SAFE_COLORS[r.level] }}>
            {r.score}
          </span>
          <span className="hw-felt-name">{r.label}</span>
          <div className="hw-felt-track">
            <span className="hw-felt-bar" style={{ ["--w" as string]: `${r.w}%`, background: SAFE_COLORS[r.level], ...d(4 + i) }} />
          </div>
          <span className="hw-felt-val">
            {r.felt}
            {r.extra && <em> · {r.extra}</em>}
          </span>
        </div>
      ))}
      <div className="hw-felt-row cross">
        <span className="hw-pill" style={{ background: SAFE_COLORS.bad }}>
          3/10
        </span>
        <span className="hw-felt-name">Risky crossing</span>
        <div className="hw-felt-track">
          <span className="hw-felt-bar hatch" style={{ ["--w" as string]: "98%", ...d(7) }} />
        </div>
        <span className="hw-felt-val">+ 490 m</span>
      </div>
      <code className="hw-formula">
        <span>felt = length × (1 + 3 × (1 − safety))</span>
        <span>
          {"     "}+ 1000 m × (1 − junction)² <i>at a busy crossing</i>
        </span>
      </code>
    </div>
  );
}

/**
 * Worked example with the real formula (not a measured trip): the fast way is 1.0 km on a 5/10 road
 * plus one 3/10 crossing = 2.5 + 0.49 ≈ 3.0 km felt; our way is 1.1 km on 8/10 streets = 1.1 × 1.6 ≈ 1.8 km felt.
 */
function FeltExample() {
  const fast = "M100 40 V320 H300";
  const ours = "M100 40 H220 V180 H320 V320 H300";
  return (
    <div className="hw-example card rv" style={d(4)}>
      <span className="hw-example-tag">Example</span>
      <svg viewBox="0 0 400 360" role="img" aria-label="The fast way runs along a busy road through a risky crossing; our way takes quiet streets and feels shorter">
        <g stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M20 40 H380 M20 110 H380 M100 180 H380 M20 250 H380 M20 320 H380 M220 20 V340 M320 20 V340" />
        </g>
        <g stroke={SAFE_COLORS.ok} strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.55">
          <path d="M100 20 V340 M20 180 H100" />
        </g>
        <path className="hw-draw" d={fast} stroke="var(--ghost)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} />
        <path className="hw-draw late" d={ours} stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} />
        <path className="hw-draw late" d={ours} stroke="var(--navy)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} />
        <g className="hw-pop" style={d(8)}>
          <circle cx="100" cy="180" r="15" fill="var(--risky)" stroke="#fff" strokeWidth="3" />
          <text x="100" y="185" textAnchor="middle" className="hw-svg-num">
            !
          </text>
        </g>
        <text x="88" y="160" textAnchor="end" className="hw-svg-small">
          3/10 crossing
        </text>
        <circle cx="100" cy="40" r="9" fill="#fff" stroke="var(--ink)" strokeWidth="4" />
        <circle cx="300" cy="320" r="10" fill="var(--ink)" />
      </svg>
      <div className="hw-example-legend">
        <span>
          <i className="ln ghost" />
          <b>Fast way</b>
          <small>1.0 km · busy 5/10 road + a 3/10 crossing</small>
          <em className="t-risky">feels 3.0 km</em>
        </span>
        <span>
          <i className="ln ours" />
          <b>Our way</b>
          <small>1.1 km · calm 8/10 streets</small>
          <em className="t-ours">
            feels 1.8 km <Check size={16} strokeWidth={3} />
          </em>
        </span>
      </div>
    </div>
  );
}

export function FeltDistanceSlide() {
  return (
    <section className="slide city hw hw-felt-slide">
      <div className="wrap hw-split">
        <div className="hw-main">
          <StepTrack at={4} />
          <h2 className="h rv" style={d(1)}>
            Felt distance.
          </h2>
          <p className="lead rv" style={d(2)}>
            Dijkstra finds the way that <b>feels</b> shortest.
          </p>
          <FeltScale />
          <p className="hw-green-line rv" style={d(8)}>
            <Leaf size={17} />
            <span>
              <b>Green mode, same idea:</b> slide to Scenic and a bare street feels 6× longer than a leafy one.
            </span>
          </p>
        </div>
        <div className="hw-felt-right">
          <FeltExample />
          <div className="chips center rv" style={d(9)}>
            <span className="chip">
              <ShieldCheck size={16} /> At most 1.5× the fastest
            </span>
            <span className="chip">Never worse than the fastest</span>
            <span className="chip">
              <Timer size={16} /> {FACTS.routeMs} per route
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
