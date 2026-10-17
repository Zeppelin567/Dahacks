import {
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  Clock,
  Cpu,
  Eye,
  Leaf,
  ShieldCheck,
  Sparkles,
  TreeDeciduous,
  TriangleAlert,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { FACTS, LIVE_NATURE_URL, LIVE_URL, MEDIA, PRODUCT } from "./data";
import { EveryStreetSlide, FeltDistanceSlide, HowWeBuiltSlide, ReadingStreetSlide, SpotsToStreetsSlide } from "./deck/how-it-works";
import { CountUp, Kicker, Pip, SiteSlot } from "./deck/parts";
import { STACK_A, STACK_B, StackRow } from "./deck/tech-stack";
import { RealVoices } from "./real-voices";
import "./deck/deck.css";

// One label per slide, in page order (the nav dots and arrow keys follow this list).
// The story: the problem -> how we built it -> the app -> the stack -> choose your way.
const SLIDES = [
  // The problem
  "Hello",
  "Two ways to ride",
  "The commute",
  "Real riders",
  "A better view",
  // How we built it (deck/how-it-works.tsx)
  "How we built it",
  "Every street",
  "Reading a street",
  "Spots to streets",
  "Felt distance",
  // The app
  "Your ride",
  "The calm way",
  "The green way",
  "Little things",
  "Tech stack",
  "Tech stack",
  "Choose your way",
];

/** The first slide of each part of the story. The nav dots leave a small gap before it. */
const PART_STARTS = new Set(["How we built it", "Your ride"]);

const d = (i: number) => ({ "--i": i }) as CSSProperties;

export default function Presentation() {
  const [active, setActive] = useState(0);

  // Reveal each slide once, and track which one is on screen for the dots.
  useEffect(() => {
    const slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            // Slides count in page order, so a slide can be added without renumbering data-idx.
            setActive(slides.indexOf(e.target as HTMLElement));
          }
        }
      },
      { threshold: 0.45 },
    );
    for (const s of slides) io.observe(s);
    if (slides.length !== SLIDES.length) {
      console.warn(`Deck: ${slides.length} slides on the page but ${SLIDES.length} labels in SLIDES. Keep them in the same order.`);
    }
    return () => io.disconnect();
  }, []);

  const go = useCallback((i: number) => {
    const n = Math.max(0, Math.min(SLIDES.length - 1, i));
    document.querySelectorAll<HTMLElement>(".slide")[n]?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(active + 1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(active - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  return (
    <main className="deck">
      <nav className="dots" aria-label="Slides">
        {SLIDES.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            className={i === active ? "on" : ""}
            style={PART_STARTS.has(label) ? { marginTop: 10 } : undefined}
            onClick={() => go(i)}
            aria-label={label}
            title={label}
          />
        ))}
      </nav>

      {/* 0 · Hello */}
      <section className="slide city streets" data-idx={0}>
        <div className="wrap hero">
          <div className="hero-text">
            <Kicker>DAHacks 5.0 · Cupertino</Kicker>
            <h1 className="title rv" style={d(1)}>
              {PRODUCT}
              <Pip size={128} className="title-pip" />
            </h1>
            <p className="lead rv" style={d(2)}>
              Two ways to ride Cupertino: <b className="t-ours">the calm way</b> and{" "}
              <b className="t-green">the green way</b>.
            </p>
            <div className="chips rv" style={d(3)}>
              <span className="chip">
                <Camera size={16} /> {FACTS.photosTotal.toLocaleString("en-US")} street photos
              </span>
              <span className="chip">
                <Sparkles size={16} /> {FACTS.model}
              </span>
              <span className="chip">
                <Clock size={16} /> {FACTS.routeMs} per route
              </span>
            </div>
          </div>
          <div className="hero-phone rv" style={d(2)}>
            <SiteSlot name="mobile" label="BikeScape on a phone" ratio="390 / 844" />
          </div>
        </div>
        <button type="button" className="next-hint" onClick={() => go(1)} aria-label="Next slide">
          <ChevronDown size={22} />
        </button>
      </section>

      {/* 1 · One bicycle, two ways to ride */}
      <section className="slide split" data-idx={1}>
        <div className="split-bg" aria-hidden>
          <span className="half city" />
          <span className="half nature" />
        </div>
        <div className="wrap riders">
          <h2 className="h center rv">
            One bicycle.
            <br />
            Two ways to ride.
          </h2>
          <div className="rider-grid">
            <article className="rider city card rv" style={d(2)}>
              <Pip size={132} />
              <span className="pill">
                <Building2 size={15} /> Getting there
              </span>
              <p className="quote">“I have an 8:30 class at De Anza. I just want to get there safely.”</p>
              <div className="chips">
                <span className="chip soft">Fast</span>
                <span className="chip soft">Safe</span>
              </div>
            </article>
            <article className="rider nature card rv" style={d(3)}>
              <Pip mood="nature" size={132} />
              <span className="pill">
                <Leaf size={15} /> Getting out
              </span>
              <p className="quote">“After a day at a screen, a few extra minutes is worth it for shade.”</p>
              <div className="chips">
                <span className="chip soft">Trees</span>
                <span className="chip soft">Quiet</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* 2 · The commute */}
      <section className="slide city" data-idx={2}>
        <div className="wrap commute">
          <div className="commute-top">
            <div>
              <Kicker icon={<TriangleAlert size={15} />}>The commute</Kicker>
              <h2 className="h rv" style={d(1)}>
                A difficult crossing.
              </h2>
            </div>
            <blockquote className="say rv" style={d(2)}>
              “Every day on my way to school, I have to cross Lawrence Expressway.”
            </blockquote>
          </div>
          <figure className="photo wide rv" style={d(3)}>
            <img src={`${MEDIA}lawrence.png`} alt="Lawrence Expressway crossing in Street View" />
            <figcaption className="tag">
              <TriangleAlert size={14} /> Lawrence Expressway
            </figcaption>
          </figure>
          <div className="chips rv" style={d(4)}>
            <span className="chip risky">Maps route bikes like cars</span>
            <span className="chip risky">They can’t see which crossings feel scary</span>
          </div>
        </div>
      </section>

      {/* 3 · Real riders: real, linked posts (sources in Dahacks-design/build/REAL_VOICES.md) */}
      <RealVoices />

      {/* 4 · A better view */}
      <section className="slide nature" data-idx={4}>
        <div className="wrap view">
          <div className="view-text">
            <Kicker icon={<TreeDeciduous size={15} />}>The escape</Kicker>
            <h2 className="h rv" style={d(1)}>
              A better view.
            </h2>
            <blockquote className="say rv" style={d(2)}>
              “I’d happily take a small detour for a beautiful view.”
            </blockquote>
            <p className="lead rv" style={d(3)}>
              Today’s maps only know the shortest line.
            </p>
          </div>
          <div className="view-pair">
            <figure className="photo rv" style={d(3)}>
              <img src="/google_maps_nature_fail.jpg" alt="A bare street with no trees" />
              <figcaption className="tag bare">Shortest way · bare</figcaption>
            </figure>
            <figure className="photo rv" style={d(4)}>
              <img src={`${MEDIA}nature.jpeg`} alt="A tree-lined street at dusk" />
              <figcaption className="tag leafy">
                <Leaf size={14} /> Worth the detour
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━ Part 2 · How we built it ━━━━━━━━━━
          Story: overview -> 1 collect the photos -> 2 Claude reads each spot -> 3 spots become streets
          -> 4 route on felt distance. The slides live in deck/how-it-works.tsx. */}
      {/* 5 · How we built it: the four steps at a glance */}
      <HowWeBuiltSlide />
      {/* 6 · Step 1 · Every street: OSM map, a stop every 80 m, Street View photos, the photo ring */}
      <EveryStreetSlide />
      {/* 7 · Step 2 · Reading a street: Claude scores one spot */}
      <ReadingStreetSlide />
      {/* 8 · Step 3 · From spots to streets: medians, junctions, rules, team-set */}
      <SpotsToStreetsSlide />
      {/* 9 · Step 4 · Felt distance: Dijkstra, crossing cost, 1.5x cap */}
      <FeltDistanceSlide />

      {/* ━━━━━━━━━━ Part 3 · The app ━━━━━━━━━━ */}
      {/* 10 · Your ride */}
      <section className="slide city" data-idx={10}>
        <div className="wrap side">
          <div className="side-text">
            <Chapter>The app</Chapter>
            <Kicker icon={<Sparkles size={15} />}>Our solution</Kicker>
            <h2 className="h rv" style={d(1)}>
              Your ride.
              <br />
              Your rules.
            </h2>
            <p className="lead rv" style={d(2)}>
              One switch. Same map, two moods.
            </p>
            <ul className="steps rv" style={d(3)}>
              <li>
                <span className="ico coral">
                  <Eye size={18} />
                </span>
                Spots risky streets
              </li>
              <li>
                <span className="ico navy">
                  <ShieldCheck size={18} />
                </span>
                Finds a calm way around
              </li>
              <li>
                <span className="ico green">
                  <Leaf size={18} />
                </span>
                Detours for trees
              </li>
            </ul>
          </div>
          <div className="side-media rv" style={d(2)}>
            <SiteSlot name="switch" label="Switching Modern → Nature" ratio="16 / 10" />
          </div>
        </div>
      </section>

      {/* 11 · The calm way (Modern demo) */}
      <section className="slide city" data-idx={11}>
        <div className="wrap side">
          <div className="side-text">
            <Kicker icon={<Building2 size={15} />}>Modern</Kicker>
            <h2 className="h rv" style={d(1)}>
              The calm way.
            </h2>
            <p className="trip rv" style={d(2)}>
              <i className="o" /> {FACTS.safe.from} <ArrowRight size={16} /> <i className="f" /> {FACTS.safe.to}
            </p>
            <div className="compare card rv" style={d(3)}>
              <span className="compare-head">
                <TriangleAlert size={16} className="t-risky" /> Risky crossings
              </span>
              <div className="compare-row">
                <div>
                  <span className="big t-risky">{FACTS.safe.fast}</span>
                  <small>
                    <i className="dot ghost" /> Fast way
                  </small>
                </div>
                <span className="arrow">
                  <ArrowRight size={18} />
                </span>
                <div>
                  <CountUp to={FACTS.safe.ours} from={FACTS.safe.fast} ms={1200} className="big t-ours" />
                  <small>
                    <i className="dot ours" /> Our way
                  </small>
                </div>
              </div>
              <span className="cost">{FACTS.safe.extra} · about 9 seconds</span>
            </div>
          </div>
          <div className="side-media rv" style={d(2)}>
            <SiteSlot name="modern" label="Modern mode · Infinite Loop → Library" ratio="16 / 10" />
          </div>
        </div>
      </section>

      {/* 12 · The green way (Nature demo) */}
      <section className="slide nature" data-idx={12}>
        <div className="wrap side">
          <div className="side-text">
            <Kicker icon={<Leaf size={15} />}>Nature</Kicker>
            <h2 className="h rv" style={d(1)}>
              The green way.
            </h2>
            <p className="trip rv" style={d(2)}>
              <i className="o" /> {FACTS.green.from} <ArrowRight size={16} /> <i className="f" /> {FACTS.green.to}
            </p>
            <div className="compare card rv" style={d(3)}>
              <span className="compare-head">
                <Leaf size={16} className="t-ours" /> Under trees
              </span>
              <div className="compare-row">
                <div>
                  <span className="big t-ghost">
                    {FACTS.green.fast}
                    <em>%</em>
                  </span>
                  <small>
                    <i className="dot ghost" /> Fast way
                  </small>
                </div>
                <span className="arrow">
                  <ArrowRight size={18} />
                </span>
                <div>
                  <span className="big t-ours">
                    <CountUp to={FACTS.green.ours} from={FACTS.green.fast} ms={1400} />
                    <em>%</em>
                  </span>
                  <small>
                    <i className="dot ours" /> Our way
                  </small>
                </div>
              </div>
              <span className="cost">
                {FACTS.green.extra} · via {FACTS.green.via}
              </span>
            </div>
          </div>
          <div className="side-media layered rv" style={d(2)}>
            <SiteSlot name="nature" label="Nature mode · Library → Main Street" ratio="16 / 10" />
            <SiteSlot name="card" label="Street photo card" ratio="29 / 37" fit="contain" className="float-card" />
          </div>
        </div>
      </section>

      {/* 13 · Little things */}
      <section className="slide city" data-idx={13}>
        <div className="wrap extras">
          <div className="extras-head">
            <Kicker icon={<Sparkles size={15} />}>Little things</Kicker>
            <h2 className="h rv" style={d(1)}>
              Made to enjoy.
            </h2>
          </div>
          <div className="extras-grid">
            <figure className="tile big-tile rv" style={d(2)}>
              <SiteSlot name="3d" label="3D city view" ratio="16 / 10" />
              <figcaption className="tag soft">3D city</figcaption>
            </figure>
            <figure className="tile rv" style={d(3)}>
              <SiteSlot name="race" label="Race: our way vs the fast way" ratio="16 / 10" />
              <figcaption className="tag soft">Race the fast way</figcaption>
            </figure>
            <figure className="tile rv" style={d(4)}>
              <SiteSlot name="trip" label="Trip card" ratio="16 / 10" fit="contain" />
              <figcaption className="tag soft">Your trip at a glance</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 14 · Tech stack, part 1 */}
      <section className="slide city" data-idx={14}>
        <div className="wrap stack-wrap">
          <Pip size={96} className="guide right" />
          <Kicker icon={<Cpu size={15} />}>Tech stack · 1 of 2</Kicker>
          <h2 className="h rv" style={d(1)}>
            From street photos to a route.
          </h2>
          <StackRow layers={STACK_A} />
        </div>
      </section>

      {/* 15 · Tech stack, part 2 */}
      <section className="slide nature" data-idx={15}>
        <div className="wrap stack-wrap">
          <Kicker icon={<Cpu size={15} />}>Tech stack · 2 of 2</Kicker>
          <h2 className="h rv" style={d(1)}>
            From a route to your screen.
          </h2>
          <StackRow layers={STACK_B} />
        </div>
      </section>

      {/* 16 · Choose your way */}
      <section className="slide split end" data-idx={16}>
        <div className="split-bg" aria-hidden>
          <span className="half city" />
          <span className="half nature" />
        </div>
        <div className="wrap finale">
          <div className="finale-pips rv">
            <Pip size={150} />
            <Pip mood="nature" size={150} />
          </div>
          <h2 className="title center rv" style={d(1)}>
            Choose your way.
          </h2>
          <p className="lead center rv" style={d(2)}>
            The fastest way isn’t always the safest.
            <br />
            The safest isn’t always the prettiest.
          </p>
          <div className="cta rv" style={d(3)}>
            <a className="btn navy" href={LIVE_URL}>
              <Building2 size={18} /> Ride the calm way
            </a>
            <a className="btn green" href={LIVE_NATURE_URL}>
              <Leaf size={18} /> Ride the green way
            </a>
          </div>
          <p className="thanks rv" style={d(4)}>
            Thank you
          </p>
        </div>
      </section>
    </main>
  );
}

/** A quiet eyebrow on the first slide of each part of the story ("How we built it", "The app"). */
function Chapter({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <span
      className="rv"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        gap: 10,
        margin: "0 0 14px",
        color: "var(--ink3)",
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <i aria-hidden style={{ width: 22, height: 4, borderRadius: 999, background: "var(--accent)" }} />
      {children}
    </span>
  );
}
