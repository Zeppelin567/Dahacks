import { useEffect, useRef } from "react";
import { FACTS, MEDIA, type PhotoSample } from "../data";
import { CountUp, reducedMotion, useInView } from "./parts";

/**
 * Real Street View photos drift in from around the slide and settle into a slow ring.
 * The middle counts up to the number of photos Claude read (8,931 Cupertino + 5,610 extended area = 14,541).
 */
export function PhotoRing({
  photos,
  count = FACTS.photosTotal,
  caption = "street photos",
  sub,
  max = 18,
  className = "",
}: {
  photos: PhotoSample[];
  count?: number;
  caption?: string;
  /** Optional small line under the caption. */
  sub?: string;
  /** How many photos ride the ring. */
  max?: number;
  className?: string;
}) {
  const [stage, seen] = useInView<HTMLDivElement>(0.35);
  const ring = useRef<HTMLDivElement>(null);
  const picks = photos.filter((_, i) => i % 3 === 0).slice(0, max);

  useEffect(() => {
    const el = ring.current;
    if (!el || !seen) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".ring-card"));
    const still = reducedMotion();
    let raf = 0;
    const t0 = performance.now();

    const draw = (now: number) => {
      const t = still ? 60 : (now - t0) / 1000;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const rx = w * 0.42;
      const ry = h * 0.38;
      cards.forEach((card, i) => {
        const p = Math.max(0, Math.min(1, (t - i * 0.07) / 1.8));
        const e = 1 - (1 - p) ** 3;
        const a = (i / cards.length) * Math.PI * 2 - Math.PI / 2 + t * 0.03 + (1 - e) * 0.6;
        const spread = 1 + (1 - e) * 0.45;
        const depth = (Math.sin(a) + 1) / 2;
        card.style.transform = `translate(-50%, -50%) translate(${Math.cos(a) * rx * spread}px, ${Math.sin(a) * ry * spread}px) scale(${0.82 + depth * 0.18})`;
        card.style.opacity = String(e * (0.7 + depth * 0.3));
        card.style.zIndex = String(1 + Math.round(depth * 10));
      });
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seen]);

  return (
    <div className={`ring-stage ${className}`} ref={stage}>
      <div className="ring" ref={ring}>
        {picks.map((p) => (
          <figure className="ring-card" key={p.src}>
            <img src={`${MEDIA}${p.src}`} alt="" loading="lazy" draggable={false} />
          </figure>
        ))}
      </div>
      <div className="ring-center">
        <CountUp to={count} ms={2600} className="ring-num" />
        <span className="ring-cap">{caption}</span>
        {sub && <span className="ring-sub">{sub}</span>}
      </div>
    </div>
  );
}
