import { ArrowUpRight, MapPin, MessagesSquare, PenLine } from "lucide-react";
import type { CSSProperties } from "react";
import { Kicker } from "./deck/parts";
import "./real-voices.css";

/*
 * Real riders, real posts. Every quote below is copied word for word from the linked page
 * (trimmed only with "…"). Handles, places and dates are exactly what each page shows.
 * Nothing here is invented: no upvotes, no comment counts. Sources and fetch dates are in
 * Dahacks-design/build/REAL_VOICES.md. None of these are Reddit posts, so no Reddit logo.
 */

type Tone = "risky" | "calm" | "green";
/** Plain text, a highlighted phrase, or a "…" where words were cut from the original. */
type Part = string | { hl: string; tone?: Tone } | "…";

type Voice = {
  handle: string;
  platform: string;
  kind: "blog" | "forum";
  where?: string;
  date: string;
  quote: Part[];
  url: string;
  site: string;
};

const VOICES: Voice[] = [
  {
    handle: "Ray Hosler",
    platform: "Silicon Valley Cyclist · blog",
    kind: "blog",
    where: "Lawrence Expressway",
    date: "Jul 25, 2016",
    quote: [
      "Google Maps suggests taking ",
      { hl: "Lawrence Expressway" },
      ". Now that’s hardly what I call a good route. In fact, it’s ",
      { hl: "downright hazardous" },
      ".",
      "…",
      "Lawrence Expressway is choked with cars during commute hours and traffic moves at ",
      { hl: "50-55 mph" },
      ".",
    ],
    url: "https://rayhosler.wordpress.com/2016/07/25/part-1-finding-the-best-commute-route/",
    site: "rayhosler.wordpress.com",
  },
  {
    handle: "something_random_tho",
    platform: "Lemmy · c/bicycling",
    kind: "forum",
    where: "Santa Monica → Culver City",
    date: "Jun 21, 2024",
    quote: [
      "Google recommended I take National and--lo and behold--there's ",
      { hl: "no bike lane" },
      " with cars flying past at ",
      { hl: "55mph+" },
      " on blind hills. That's a ",
      { hl: "death trap" },
      ".",
    ],
    url: "https://lemmy.world/post/16790112",
    site: "lemmy.world",
  },
  {
    handle: "Explorer-1",
    platform: "Electric Bike Review forum",
    kind: "forum",
    where: "Boston North Shore",
    date: "Jul 10, 2024",
    quote: [
      "It's a valuable tool, but it does not know if you want ",
      { hl: "the scenic route", tone: "green" },
      " or one more ",
      { hl: "commuter oriented", tone: "calm" },
      ".",
    ],
    url: "https://forums.electricbikereview.com/threads/google-maps-bicycle-routing.56176/post-655908",
    site: "forums.electricbikereview.com",
  },
  {
    handle: "AvalancheRun",
    platform: "Electric Bike Review forum",
    kind: "forum",
    date: "Jul 9, 2024",
    quote: [
      "It would be cool if google used their satellite, ",
      { hl: "street view, and AI power", tone: "calm" },
      " to really ",
      { hl: "rate the safety of roads", tone: "calm" },
      ".",
    ],
    url: "https://forums.electricbikereview.com/threads/google-maps-bicycle-routing.56176/post-655834",
    site: "forums.electricbikereview.com",
  },
];

const d = (i: number) => ({ "--i": i }) as CSSProperties;

/** "Real riders. Real routes." A full slide of real, linked posts, right after the commute slide. */
export function RealVoices() {
  const [lead, ...rest] = VOICES;
  if (!lead) return null;
  return (
    <section className="slide city voices" aria-labelledby="voices-title">
      <div className="wrap vx">
        <div className="vx-head">
          <Kicker icon={<MessagesSquare size={15} />}>Not just us</Kicker>
          <h2 id="voices-title" className="h rv" style={d(1)}>
            Real riders. Real routes.
          </h2>
        </div>

        <div className="vx-grid">
          <VoiceCard v={lead} featured i={2} />
          <div className="vx-stack">
            {rest.map((v, k) => (
              <VoiceCard key={v.url} v={v} i={3 + k} />
            ))}
          </div>
        </div>

        <div className="vx-foot rv" style={d(6)}>
          <p className="vx-caption">
            Google Maps doesn’t know what a road <b>feels</b> like.
          </p>
          <span className="vx-note">Real posts, quoted word for word · sources linked</span>
        </div>
      </div>
    </section>
  );
}

function VoiceCard({ v, featured = false, i }: { v: Voice; featured?: boolean; i: number }) {
  const Icon = v.kind === "blog" ? PenLine : MessagesSquare;
  return (
    <article className={`vx-card card rv${featured ? " is-lead" : ""}`} style={d(i)}>
      <header className="vx-top">
        <span className="vx-ava" aria-hidden>
          <Icon size={featured ? 18 : 16} />
        </span>
        <span className="vx-who">
          <b>{v.handle}</b>
          <small>{v.platform}</small>
        </span>
        <time className="vx-date">{v.date}</time>
      </header>

      {featured && v.where && <Where text={v.where} />}

      <blockquote className="vx-quote">
        “
        {v.quote.map((p, k) =>
          p === "…" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static quote parts never reorder
            <span key={k} className="vx-cut" title="words cut from the original">
              {" … "}
            </span>
          ) : typeof p === "string" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static quote parts never reorder
            <span key={k}>{p}</span>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: static quote parts never reorder
            <mark key={k} className={`vx-hl ${p.tone ?? "risky"}`}>
              {p.hl}
            </mark>
          ),
        )}
        ”
      </blockquote>

      <footer className="vx-foot-row">
        {!featured && v.where && <Where text={v.where} />}
        <a className="vx-src" href={v.url} target="_blank" rel="noreferrer">
          {v.site} <ArrowUpRight size={13} />
        </a>
      </footer>
    </article>
  );
}

function Where({ text }: { text: string }) {
  return (
    <span className="vx-where">
      <MapPin size={13} /> {text}
    </span>
  );
}
