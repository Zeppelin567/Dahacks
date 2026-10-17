import { type ReactNode, useEffect, useRef, useState } from "react";
// Pip comes straight from the website's own assets, so the deck and the app share one mascot.
import pipFavicon from "../../../web/public/pip/favicon-128.png";
import pipModern from "../../../web/public/pip/pip_modern.png";
import pipNature from "../../../web/public/pip/pip_nature.png";
import stickerModern from "../../../web/public/pip/sticker_modern.png";
import stickerNature from "../../../web/public/pip/sticker_nature.png";
import { SITE } from "../data";

export const PIP = {
  modern: pipModern,
  nature: pipNature,
  stickerModern,
  stickerNature,
  pixel: pipFavicon,
};

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pip the quail. Breathes at rest and hops once when its slide comes into view. */
export function Pip({
  mood = "modern",
  sticker = false,
  size = 120,
  className = "",
}: {
  mood?: "modern" | "nature";
  sticker?: boolean;
  size?: number;
  className?: string;
}) {
  const src = sticker
    ? mood === "nature"
      ? PIP.stickerNature
      : PIP.stickerModern
    : mood === "nature"
      ? PIP.nature
      : PIP.modern;
  return <img className={`pip ${className}`} src={src} alt="" width={size} height={size} draggable={false} />;
}

export function Kicker({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="kicker rv">
      {icon}
      {children}
    </span>
  );
}

/** Calls back once when the element is mostly on screen. */
export function useInView<T extends Element>(threshold = 0.4) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** A number that eases up to its value once it is visible. */
export function CountUp({
  to,
  from = 0,
  ms = 1400,
  suffix = "",
  className = "",
}: {
  to: number;
  from?: number;
  ms?: number;
  suffix?: string;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.6);
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      setV(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, from, ms]);
  return (
    <span ref={ref} className={className}>
      {v.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

export type SlotName = "modern" | "nature" | "3d" | "card" | "switch" | "race" | "trip" | "mobile";

/**
 * A picture of the CURRENT website, loaded from public/site/<name>.png.
 * Until that file exists it shows a calm placeholder that names the file to capture.
 */
export function SiteSlot({
  name,
  label,
  ratio,
  fit = "cover",
  className = "",
}: {
  name: SlotName;
  label: string;
  ratio: string;
  fit?: "cover" | "contain";
  className?: string;
}) {
  const [missing, setMissing] = useState(false);
  return (
    <figure className={`slot ${missing ? "is-empty" : ""} ${className}`} style={{ aspectRatio: ratio }} data-slot={name}>
      {!missing && (
        <img
          src={`${SITE}${name}.png`}
          alt={label}
          style={{ objectFit: fit }}
          onError={() => setMissing(true)}
          draggable={false}
        />
      )}
      {missing && (
        <div className="slot-empty">
          <img src={PIP.modern} alt="" width={56} height={56} className="slot-pip m" />
          <img src={PIP.nature} alt="" width={56} height={56} className="slot-pip n" />
          <span className="slot-label">{label}</span>
          <code>site/{name}.png</code>
        </div>
      )}
    </figure>
  );
}
