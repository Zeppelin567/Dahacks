import {
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  Clock,
  Cpu,
  Eye,
  Leaf,
  Route,
  ShieldCheck,
  Sparkles,
  TreeDeciduous,
  TriangleAlert,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { FACTS, LIVE_NATURE_URL, LIVE_URL, type Manifest, MEDIA, PRODUCT, type PhotoSample } from "./data";
import { FeltBars, MiniRoute } from "./deck/felt-distance";
import { CountUp, Kicker, Pip, SiteSlot } from "./deck/parts";
import { PhotoRing } from "./deck/photo-ring";
import { STACK_A, STACK_B, StackRow } from "./deck/tech-stack";
import { RealVoices } from "./real-voices";
import "./deck/deck.css";

const SLIDES = [
  "Hello",
  "Two ways to ride",
  "The commute",
  "Real riders",
  "A better view",
  "Your ride",
  "The calm way",
  "The green way",
  "Little things",
  "Reading a street",
  "Every street",
  "Felt distance",
  "Tech stack",
  "Tech stack",
  "Choose your way",
];

const d = (i: number) => ({ "--i": i }) as CSSProperties;

export default function Presentation() {
  const [manifest, setManifest] = useState<Manifest>();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${MEDIA}manifest.json`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("manifest"))))
      .then(setManifest)
      .catch(() => {});
    return () => ctl.abort();
  }, []);

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

  const photo = useMemo(() => {
    const by = (src: string) => manifest?.photos.find((p) => p.src === src);
    return { road: by("street-04.jpg"), expressway: by("street-21.jpg") };
  }, [manifest]);

  return (
    <main className="deck">
      <nav className="dots" aria-label="Slides">
        {SLIDES.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            className={i === active ? "on" : ""}
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
            <SiteSlot name="mobile" label="BikeMap on a phone" ratio="390 / 844" />
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

      {/* 2b · Real riders: real, linked posts (sources in Dahacks-design/build/REAL_VOICES.md) */}
      <RealVoices />

      {/* 3 · A better view */}
      <section className="slide nature" data-idx={3}>
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

      {/* 4 · Our solution */}
      <section className="slide city" data-idx={4}>
        <div className="wrap side">
          <div className="side-text">
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

      {/* 5 · Modern demo */}
      <section className="slide city" data-idx={5}>
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

      {/* 6 · Nature demo */}
      <section className="slide nature" data-idx={6}>
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

      {/* 7 · Little things */}
      <section className="slide city" data-idx={7}>
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

      {/* 8 · Reading a street */}
      <section className="slide city" data-idx={8}>
        <div className="wrap read">
          <div className="read-text">
            <Pip size={92} className="guide" />
            <Kicker icon={<Eye size={15} />}>How it works</Kicker>
            <h2 className="h rv" style={d(1)}>
              A street.
              <br />
              Every angle.
            </h2>
            <ul className="steps rv" style={d(2)}>
              <li>
                <span className="ico navy">
                  <Camera size={18} />
                </span>
                A photo stop every {FACTS.sampleEveryM} m
              </li>
              <li>
                <span className="ico navy">
                  <Route size={18} />
                </span>
                2 views on a road, 4 at a junction
              </li>
              <li>
                <span className="ico coral">
                  <Sparkles size={18} />
                </span>
                {FACTS.model} reads each stop twice
              </li>
            </ul>
          </div>
          <div className="read-cards">
            <SpotCard p={photo.road} />
            <div className="read-row">
              <div className="card junction rv" style={d(4)}>
                <div className="jgrid">
                  {(manifest?.junctionPhotos ?? []).slice(0, 4).map((j) => (
                    <img key={j} src={`${MEDIA}${j}`} alt="" />
                  ))}
                </div>
                <span className="mini-cap">Junction · 4 views</span>
              </div>
              {photo.expressway && (
                <div className="card risky-spot rv" style={d(5)}>
                  <img src={`${MEDIA}${photo.expressway.src}`} alt="" />
                  <div>
                    <span className="mini-cap">{photo.expressway.name}</span>
                    <span className="score risky">
                      {photo.expressway.safety}
                      <small>/10</small>
                    </span>
                    <span className="mini-sub">Risky · LTS {photo.expressway.lts}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 9 · Every street */}
      <section className="slide nature" data-idx={9}>
        <div className="wrap scale">
          <div className="scale-head">
            <Kicker icon={<Camera size={15} />}>The scale</Kicker>
            <h2 className="h rv" style={d(1)}>
              Every street, one photo at a time.
            </h2>
          </div>
          {manifest && <PhotoRing photos={manifest.photos} />}
          <div className="chips center rv" style={d(3)}>
            <span className="chip">{FACTS.photosCupertino.toLocaleString("en-US")} in Cupertino</span>
            <span className="chip">+ {FACTS.photosExtended.toLocaleString("en-US")} extended area</span>
            <span className="chip strong">{FACTS.scoringCost} to score Cupertino</span>
            <span className="chip">0 AI calls while you ride</span>
          </div>
        </div>
      </section>

      {/* 10 · Felt distance */}
      <section className="slide city" data-idx={10}>
        <div className="wrap felt-wrap">
          <div className="felt-text">
            <Kicker icon={<Route size={15} />}>Pathfinding</Kicker>
            <h2 className="h rv" style={d(1)}>
              Felt distance.
            </h2>
            <p className="lead rv" style={d(2)}>
              Dijkstra finds the way that <b>feels</b> shortest.
            </p>
            <FeltBars />
            <div className="chips rv" style={d(4)}>
              <span className="chip green">
                <Leaf size={15} /> Nature: bare streets feel longer
              </span>
              <span className="chip">
                <Cpu size={15} /> {FACTS.routeMs} per route
              </span>
            </div>
          </div>
          <MiniRoute />
        </div>
      </section>

      {/* 11 · Tech stack, part 1 */}
      <section className="slide city" data-idx={11}>
        <div className="wrap stack-wrap">
          <Pip size={96} className="guide right" />
          <Kicker icon={<Cpu size={15} />}>Tech stack · 1 of 2</Kicker>
          <h2 className="h rv" style={d(1)}>
            From street photos to a route.
          </h2>
          <StackRow layers={STACK_A} />
        </div>
      </section>

      {/* 12 · Tech stack, part 2 */}
      <section className="slide nature" data-idx={12}>
        <div className="wrap stack-wrap">
          <Kicker icon={<Cpu size={15} />}>Tech stack · 2 of 2</Kicker>
          <h2 className="h rv" style={d(1)}>
            From a route to your screen.
          </h2>
          <StackRow layers={STACK_B} />
        </div>
      </section>

      {/* 13 · Choose your way */}
      <section className="slide split end" data-idx={13}>
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

/** One real photo stop with Claude's two scores (from manifest.json). */
function SpotCard({ p }: { p?: PhotoSample }) {
  if (!p) return <div className="card spot rv" />;
  return (
    <div className="card spot rv" style={d(3)}>
      <div className="spot-photos">
        <figure>
          <img src={`${MEDIA}${p.src}`} alt="" />
          <figcaption>Forward</figcaption>
        </figure>
        {p.right && (
          <figure>
            <img src={`${MEDIA}${p.right}`} alt="" />
            <figcaption>Curb side</figcaption>
          </figure>
        )}
      </div>
      <div className="spot-body">
        <span className="spot-name">{p.name}</span>
        <div className="meters">
          <Meter label="Safety" value={p.safety} sub={`Calm · LTS ${p.lts}`} tone="navy" />
          <Meter label="Greenery" value={p.greenery} sub={`${p.shade}% shade`} tone="green" />
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "navy" | "green" }) {
  return (
    <div className={`meter ${tone}`}>
      <div className="meter-top">
        <span>{label}</span>
        <b>
          {value}
          <small>/10</small>
        </b>
      </div>
      <div className="meter-track">
        <span style={{ ["--w" as string]: `${value * 10}%` }} />
      </div>
      <span className="meter-sub">{sub}</span>
    </div>
  );
}
