// The rounded street / crossing card (v3 .sc): Street View photo on top in Nature, name + score badge,
// up to three icon chips, a "Why" fold with Claude's note, and the Street View credit + link.
// Render it inside <MapPopup className={CARD_POPUP_CLASS}> so the popup chrome matches (sheet.css).
import { useState } from "react";
import type { Level, Photo } from "./api";
import { chipsFor, streetViewAt, whyLines } from "./derive";
import { Ico } from "./icons";
import type { MapPick } from "./map/layers/shared";
import type { UiMode } from "./theme";
import { useBikeTheme } from "./theme-context";

/** className for the MapPopup that hosts a card (keeps map.css's .bm-popup, adds the v3 card chrome). */
export const CARD_POPUP_CLASS = "bm-popup bm-sc";

type CardData = {
  title: string;
  /** 0..1 */
  score: number;
  level: Level;
  reasons: string[];
  note?: string | null;
  photo?: Photo | null;
  streetview: string;
  ui: UiMode;
  manual?: boolean;
};

/** Everything a card shows, from whatever was tapped on the map. */
export function cardData(pick: MapPick): CardData {
  if (pick.kind === "crossing") {
    const s = pick.crossing.segment;
    return {
      title: pick.crossing.name,
      score: s.score,
      level: "bad",
      reasons: s.reasons,
      streetview: streetViewAt(pick.at),
      ui: "modern",
    };
  }
  if (pick.kind === "photo") {
    const d = pick.photo.detail;
    return {
      title: d.name,
      score: d.score10 / 10,
      level: d.level,
      reasons: d.chips.map((c) => c.replace(/^runs/i, "Runs")),
      note: d.note,
      photo: d.photo,
      streetview: d.streetview_url,
      ui: "nature",
      manual: d.source === "manual",
    };
  }
  const d = pick.photo?.detail;
  return {
    title: pick.title,
    score: pick.score,
    level: pick.level,
    reasons: pick.reasons,
    // a /street answer carries Claude's note as reasons[0]; route/net taps only lend the photo on the same street
    note: pick.source === "api" ? (d?.note ?? null) : null,
    photo: pick.mode === "nature" ? (d?.photo ?? null) : null,
    streetview: d?.streetview_url ?? streetViewAt(pick.at),
    ui: pick.mode,
    manual: d?.source === "manual",
  };
}

const badgeColor = (ui: UiMode, level: Level) =>
  level === "good"
    ? "var(--bm-good)"
    : level === "ok"
      ? "var(--bm-ok-text)"
      : ui === "modern"
        ? "var(--bm-bad)"
        : "#8A5A3C";

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="sc-x" aria-label="Close" onClick={onClose}>
      <Ico n="close" />
    </button>
  );
}

/**
 * The card. Pass `pick` once known; `loading` shows Pip reading the street; `error` replaces the body.
 * Chips come from the reasons (v3 rules: red only on a low score). Raw API chips are a fallback.
 */
export function StreetCard({
  pick,
  loading,
  error,
  onClose,
  onStart,
  onEnd,
  onVote,
}: {
  pick?: MapPick | null;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  /** "Start here" / "Go here" for the tapped spot (a street tap still lets you set a trip point) */
  onStart?: () => void;
  onEnd?: () => void;
  onVote?: (like: boolean) => void;
}) {
  const drop = (onStart || onEnd) && (
    <div className="bm-drop sc-drop">
      {onStart && (
        <button type="button" onClick={onStart}>
          <i />
          Start here
        </button>
      )}
      {onEnd && (
        <button type="button" className="go" onClick={onEnd}>
          <i className="e" />
          Go here
        </button>
      )}
    </div>
  );
  const [why, setWhy] = useState(false);
  const [broken, setBroken] = useState<string>();
  const { pip } = useBikeTheme();
  if (!pick) {
    return (
      <div className="sc-card">
        <div className="sc-body">
          <div className="sc-head">
            {loading ? (
              <span className="sc-wait">
                <img className="bm-pip" src={pip} alt="" />
                Reading this street…
              </span>
            ) : (
              <span className="sc-wait">{error ?? "No street here."}</span>
            )}
            <CloseBtn onClose={onClose} />
          </div>
          {drop}
        </div>
      </div>
    );
  }
  const d = cardData(pick);
  const { chips, used } = chipsFor(d.reasons, d.ui, d.score);
  const fallback =
    chips.length === 0 && pick.kind !== "crossing"
      ? d.reasons.filter((r) => r.length <= 32 && r !== d.note).slice(0, 3)
      : [];
  const lines = whyLines(d.reasons, d.note, used);
  const photo = d.photo && broken !== d.photo.url ? d.photo : null;
  return (
    <div className="sc-card" data-loading={loading || undefined}>
      {photo && (
        <div className="sc-photo">
          <img src={photo.url} alt={`Street View of ${d.title}`} onError={() => setBroken(photo.url)} />
          <CloseBtn onClose={onClose} />
        </div>
      )}
      <div className={why ? "sc-body open" : "sc-body"}>
        <div className="sc-head">
          <span className="sc-name">{d.title}</span>
          <span
            className={d.ui === "modern" && d.level === "good" ? "sc-badge ink" : "sc-badge"}
            style={{ "--c": badgeColor(d.ui, d.level) } as React.CSSProperties}
          >
            {Math.round(d.score * 10)}
            <small>/10</small>
          </span>
          {!photo && <CloseBtn onClose={onClose} />}
        </div>
        {(chips.length > 0 || fallback.length > 0) && (
          <div className="sc-chips">
            {chips.map((c) => (
              <span key={c.icon} className={d.level !== "bad" && c.tone !== "pos" ? "plain" : c.tone}>
                <Ico n={c.icon} />
                {c.label}
              </span>
            ))}
            {fallback.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <>
            <button type="button" className="why-btn" aria-expanded={why} onClick={() => setWhy((w) => !w)}>
              Why <Ico n="chevD" />
            </button>
            <div className="why">
              <div>
                <ul>
                  {lines.map((w) => (
                    <li key={w.t} className={w.ai ? "ai" : undefined}>
                      {w.ai && <Ico n="spark" />}
                      {w.t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
        <div className="disc-line">
          <a href={d.streetview} target="_blank" rel="noreferrer">
            <Ico n="cam" />
            {photo ? "© Google · Street View" : "Street View"}
            <Ico n="ext" />
          </a>
          {pick.kind !== "crossing" && d.reasons.length > 0 && (
            <span className="ai-tag">
              <Ico n="spark" />
              {d.manual ? "Set by team" : "Claude"}
            </span>
          )}
        </div>
        {onVote && pick?.kind === "street" && pick.features && (
          <section className="bm-feature-actions" aria-label="Rate this stretch">
            <button type="button" onClick={() => onVote(true)}>
              More like this
            </button>
            <button type="button" onClick={() => onVote(false)}>
              Less like this
            </button>
          </section>
        )}
        {drop}
      </div>
    </div>
  );
}
