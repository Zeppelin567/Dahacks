import { ArrowRight, ExternalLink, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import type { StreetDetail } from "./api";
import { LEVEL_COLORS, LEVEL_LABELS, type UiMode } from "./theme";
import { distanceM, formatKm, type Pin, type TripPoint } from "./trip";

function CardShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="bm-glass bm-card-in relative grid gap-3 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 rounded-md p-1 opacity-70 hover:bg-[var(--bm-chip)] hover:opacity-100"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      {children}
    </section>
  );
}

export function StreetCard({
  ui,
  detail,
  loading,
  error,
  onClose,
}: {
  ui: UiMode;
  detail?: StreetDetail;
  loading: boolean;
  error?: string;
  onClose: () => void;
}) {
  const [brokenPhoto, setBrokenPhoto] = useState<string>();
  if (!detail) {
    return (
      <CardShell onClose={onClose}>
        <div className="flex items-center gap-2 pr-6 text-sm text-[var(--bm-muted)]">
          {loading ? (
            <>
              <LoaderCircle className="size-4 animate-spin" /> Reading this street…
            </>
          ) : (
            (error ?? "No street here.")
          )}
        </div>
      </CardShell>
    );
  }

  const color = LEVEL_COLORS[ui][detail.level];
  const photo = detail.photo && brokenPhoto !== detail.photo.url ? detail.photo : null;
  return (
    <CardShell onClose={onClose}>
      <header className="flex items-center gap-3 pr-6">
        <div className="bm-score" style={{ borderColor: color, color }}>
          <span className="text-lg leading-none font-bold tabular-nums">{detail.score10.toFixed(1)}</span>
          <span className="text-[10px] leading-none opacity-80">/ 10</span>
        </div>
        <div className="min-w-0">
          <h2 className="truncate leading-tight font-semibold">{detail.name}</h2>
          <p className="text-xs text-[var(--bm-muted)]">
            {detail.road} ·{" "}
            <span style={{ color }} className="font-medium">
              {ui === "modern"
                ? `${LEVEL_LABELS.modern[detail.level]} to ride`
                : LEVEL_LABELS.nature[detail.level]}
            </span>
            {loading && <LoaderCircle className="ml-1 inline size-3 animate-spin" />}
          </p>
        </div>
      </header>

      {photo && (
        <figure className="grid gap-1">
          <img
            src={photo.url}
            alt={`Street View of ${detail.name}`}
            onError={() => setBrokenPhoto(photo.url)}
            className="aspect-[16/10] w-full rounded-xl border border-[var(--bm-border)] object-cover"
          />
          <figcaption className="text-[11px] text-[var(--bm-muted)]">
            {detail.source === "manual" ? "Street View at this spot" : "The photo Claude scored"}
            {` · Google Street View${photo.date ? ` · ${photo.date}` : ""}`}
          </figcaption>
        </figure>
      )}

      {detail.source === "manual" ? (
        detail.note && (
          <blockquote className="border-l-2 pl-3 text-sm leading-snug" style={{ borderColor: color }}>
            {detail.note}
            <span className="mt-1 block text-[11px] text-[var(--bm-muted)]">
              Score set by the team from the Street View photo
            </span>
          </blockquote>
        )
      ) : detail.source === "photo" ? (
        detail.note && (
          <blockquote className="border-l-2 pl-3 text-sm leading-snug" style={{ borderColor: color }}>
            {detail.note}
            <span className="mt-1 block text-[11px] text-[var(--bm-muted)]">
              Claude's read of the street photo ({ui === "modern" ? "safety" : "greenery"})
            </span>
          </blockquote>
        )
      ) : (
        <p className="rounded-lg bg-[var(--bm-chip)] px-3 py-2 text-xs text-[var(--bm-muted)]">
          No street imagery here, so this street is scored from map data.
        </p>
      )}

      {detail.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {detail.chips.map((c) => (
            <li key={c} className="bm-chip">
              {c}
            </li>
          ))}
        </ul>
      )}

      <a href={detail.streetview_url} target="_blank" rel="noreferrer" className="bm-btn w-fit">
        Open in Street View <ExternalLink className="size-3.5" />
      </a>
    </CardShell>
  );
}

export function PinCard({
  pin,
  from,
  onRoute,
  onClose,
}: {
  pin: Pin;
  from?: TripPoint;
  onRoute: (p: Pin) => void;
  onClose: () => void;
}) {
  const dist = from ? distanceM(from, pin) : null;
  return (
    <CardShell onClose={onClose}>
      <header className="flex items-center gap-3 pr-6">
        {pin.icon && (
          <div className="bm-pin is-selected shrink-0 text-xl" style={{ width: 44, height: 44 }}>
            {pin.icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="leading-tight font-semibold">{pin.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="bm-chip bm-chip-accent">{pin.category_label}</span>
            {pin.score != null && <span className="bm-chip">Green score {pin.score}/100</span>}
            {dist != null && <span className="bm-chip">{formatKm(dist)} away</span>}
          </div>
        </div>
      </header>
      {pin.description && <p className="text-sm text-[var(--bm-muted)]">{pin.description}</p>}
      {pin.amenities.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pin.amenities.map((a) => (
            <li key={a} className="bm-chip">
              {a}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => onRoute(pin)} className="bm-btn bm-btn-primary bm-btn-lg">
        Route here <ArrowRight className="size-4" />
      </button>
    </CardShell>
  );
}
