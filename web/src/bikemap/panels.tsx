import { ArrowUpDown, ChevronDown, ChevronUp, LoaderCircle, LocateFixed, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { appConfig } from "@/app.config";
import { cn } from "@/lib/utils";
import {
  bikemap,
  type GreenPrefs,
  type LatLng,
  type Level,
  type Place,
  type Route,
  type SearchResult,
} from "./api";
import { LEVEL_COLORS, LEVEL_LABELS, type UiMode } from "./theme";
import { formatKm, type Pin, placePoint, type TripPoint } from "./trip";

export function ModeSwitch({ ui, onChange }: { ui: UiMode; onChange: (m: UiMode) => void }) {
  return (
    <fieldset className="bm-glass bm-switch" aria-label="Map mode">
      <span className="bm-switch-thumb" aria-hidden />
      <button type="button" aria-pressed={ui === "modern"} onClick={() => onChange("modern")}>
        🏙️ Modern
      </button>
      <button type="button" aria-pressed={ui === "nature"} onClick={() => onChange("nature")}>
        🌿 Nature
      </button>
    </fieldset>
  );
}

type Hit = { key: string; icon: string; name: string; detail: string; at: LatLng };

// Pins and presets match as you type (local). OpenStreetMap is only asked on Enter:
// Nominatim's usage policy forbids search-as-you-type.
export function SearchBox({ pins, onPick }: { pins: Pin[]; onPick: (p: TripPoint) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<{
    q: string;
    rows: SearchResult[];
    error?: string;
    loading: boolean;
  }>();

  const query = q.trim().toLowerCase();
  const local: Hit[] = useMemo(() => {
    if (query.length < 2) return [];
    return pins
      .filter((p) => p.name.toLowerCase().includes(query))
      .slice(0, 6)
      .map((p) => ({ key: p.id, icon: p.icon, name: p.name, detail: p.category_label, at: [p.lat, p.lng] }));
  }, [pins, query]);
  const osm: Hit[] =
    remote && remote.q === q.trim()
      ? remote.rows.map((r, i) => ({
          key: `osm/${i}/${r.name}`,
          icon: "📍",
          name: r.name,
          detail: r.detail,
          at: [r.lat, r.lng],
        }))
      : [];

  function runRemote() {
    const term = q.trim();
    if (term.length < 2) return;
    setOpen(true);
    setRemote({ q: term, rows: [], loading: true });
    bikemap
      .search(term)
      .then((rows) => setRemote({ q: term, rows, loading: false }))
      .catch(() =>
        setRemote({
          q: term,
          rows: [],
          loading: false,
          error: "Search is offline. Showing saved places only.",
        }),
      );
  }

  function pick(h: Hit) {
    onPick({ key: h.key, name: h.name, lat: h.at[0], lng: h.at[1] });
    setQ(h.name);
    setOpen(false);
  }

  const showDropdown = open && query.length >= 2;
  return (
    <div className="relative w-full md:w-[320px]">
      <div className="bm-glass flex h-11 items-center gap-2 px-3">
        <Search className="size-4 shrink-0 opacity-60" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runRemote();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search a place in Cupertino…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--bm-muted)]"
          aria-label="Search a place"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            className="opacity-60 hover:opacity-100"
            onClick={() => setQ("")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="bm-glass bm-glass-strong absolute top-12 right-0 left-0 z-[1100] grid grid-cols-[minmax(0,1fr)] max-h-80 overflow-y-auto p-1.5 text-sm">
          {local.map((h) => (
            <SearchRow key={h.key} hit={h} onPick={pick} />
          ))}
          {osm.length > 0 && <div className="bm-label px-2 pt-2 pb-1">OpenStreetMap</div>}
          {osm.map((h) => (
            <SearchRow key={h.key} hit={h} onPick={pick} />
          ))}
          <div className="px-2 py-1.5 text-xs text-[var(--bm-muted)]">
            {remote?.loading && remote.q === q.trim() ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircle className="size-3 animate-spin" /> Searching OpenStreetMap…
              </span>
            ) : remote?.error && remote.q === q.trim() ? (
              remote.error
            ) : remote && remote.q === q.trim() ? (
              osm.length === 0 && "No OpenStreetMap results inside Cupertino."
            ) : (
              "Press Enter to search OpenStreetMap"
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchRow({ hit, onPick }: { hit: Hit; onPick: (h: Hit) => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(hit)}
      className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bm-chip)]"
    >
      <span className="text-base leading-5">{hit.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{hit.name}</span>
        <span className="block truncate text-xs text-[var(--bm-muted)]">{hit.detail}</span>
      </span>
    </button>
  );
}

const CUPERTINO = { lat: 37.318, lng: -122.04 };

export function LocateButton({ onLocate }: { onLocate: (p: TripPoint) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  function locate() {
    if (!navigator.geolocation) return flash("Location isn't available in this browser.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const far = Math.hypot((here.lat - CUPERTINO.lat) * 111, (here.lng - CUPERTINO.lng) * 88) > 8;
        if (far) return flash("You're outside Cupertino, so the start stays where it is.");
        onLocate({ key: "me", name: "My location", ...here });
      },
      () => {
        setBusy(false);
        flash("Location blocked. The start stays at De Anza.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(undefined), 3500);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={locate}
        className="bm-glass grid size-11 place-items-center"
        aria-label="Start from my location"
        title="Start from my location"
      >
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
      </button>
      {msg && (
        <div className="bm-glass bm-glass-strong absolute top-12 right-0 w-60 px-3 py-2 text-xs">{msg}</div>
      )}
    </div>
  );
}

const PREFS: { key: keyof GreenPrefs; label: string }[] = [
  { key: "green", label: "🌳 Greenery" },
  { key: "quiet", label: "🤫 Quiet" },
  { key: "shade", label: "☀️ Shade" },
];

export function TripCard({
  ui,
  places,
  start,
  end,
  onStart,
  onEnd,
  onSwap,
  rural,
  onRural,
  prefs,
  onPrefs,
  showRisk,
  onShowRisk,
  showPins,
  onShowPins,
}: {
  ui: UiMode;
  places: Place[];
  start?: TripPoint;
  end?: TripPoint;
  onStart: (p: TripPoint) => void;
  onEnd: (p: TripPoint) => void;
  onSwap: () => void;
  rural: number;
  onRural: (v: number) => void;
  prefs: GreenPrefs;
  onPrefs: (p: GreenPrefs) => void;
  showRisk: boolean;
  onShowRisk: (v: boolean) => void;
  showPins: boolean;
  onShowPins: (v: boolean) => void;
}) {
  // Phones get the map first; the card opens with one tap.
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="bm-glass grid gap-3 p-4">
      <header className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {appConfig.logo}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] leading-tight font-semibold">{appConfig.name}</h1>
          <p className="truncate text-xs text-[var(--bm-muted)]">
            {ui === "modern" ? "The safest way across town" : "The greenest way across town"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1 opacity-70 hover:bg-[var(--bm-chip)] hover:opacity-100"
          aria-label={collapsed ? "Show trip controls" : "Hide trip controls"}
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2">
            <PointSelect label="From" dot="A" value={start} places={places} onChange={onStart} />
            <button
              type="button"
              onClick={onSwap}
              className="row-span-2 grid size-8 place-items-center rounded-full border border-[var(--bm-border)] hover:bg-[var(--bm-chip)]"
              aria-label="Swap start and end"
              title="Swap"
            >
              <ArrowUpDown className="size-4" />
            </button>
            <PointSelect label="To" dot="B" value={end} places={places} onChange={onEnd} />
          </div>
          <p className="-mt-1 text-xs text-[var(--bm-muted)]">
            Tip: click anywhere on the map to start or go there.
          </p>

          {ui === "nature" ? (
            <div className="grid gap-2 border-t border-[var(--bm-border)] pt-3">
              <div className="flex items-baseline justify-between">
                <span className="bm-label">Direct ↔ Scenic</span>
                <span className="text-xs text-[var(--bm-muted)] tabular-nums">
                  {Math.round(rural * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rural}
                onChange={(e) => onRural(Number(e.target.value))}
                className="bm-range w-full"
                aria-label="Direct to scenic"
              />
              <div className="flex justify-between text-xs text-[var(--bm-muted)]">
                <span>➡️ Direct</span>
                <span>🌄 Scenic</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PREFS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={prefs[key]}
                    onClick={() => onPrefs({ ...prefs, [key]: !prefs[key] })}
                    className={cn("bm-chip-btn", prefs[key] && "is-on")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-2 border-t border-[var(--bm-border)] pt-3">
              <Toggle checked={showRisk} onChange={onShowRisk} label="Show risk on every street" />
            </div>
          )}
          <Toggle
            checked={showPins}
            onChange={onShowPins}
            label={ui === "modern" ? "Show city places" : "Show parks & nature spots"}
          />
        </>
      )}
    </section>
  );
}

function PointSelect({
  label,
  dot,
  value,
  places,
  onChange,
}: {
  label: string;
  dot: string;
  value?: TripPoint;
  places: Place[];
  onChange: (p: TripPoint) => void;
}) {
  const presets = places.map(placePoint);
  const custom = value && !presets.some((p) => p.key === value.key) ? value : undefined;
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span
        className={cn("bm-endpoint bm-endpoint-sm", dot === "A" ? "bm-endpoint-start" : "bm-endpoint-end")}
      >
        {dot}
      </span>
      <span className="sr-only">{label}</span>
      <select
        className="bm-field min-w-0 flex-1"
        value={value?.key ?? ""}
        onChange={(e) => {
          const p = presets.find((x) => x.key === e.target.value);
          if (p) onChange(p);
        }}
      >
        {custom && <option value={custom.key}>📍 {custom.name}</option>}
        {presets.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 text-left text-sm"
    >
      <span>{label}</span>
      <span className={cn("bm-switch-track", checked && "is-on")} aria-hidden>
        <span />
      </span>
    </button>
  );
}

export function StatsBar({
  ui,
  route,
  loading,
  error,
}: {
  ui: UiMode;
  route?: Route;
  loading: boolean;
  error?: string;
}) {
  const colors = LEVEL_COLORS[ui];
  const labels = LEVEL_LABELS[ui];
  return (
    <div className="bm-glass flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm">
      {error ? (
        <span className="font-medium text-[#fb3b64]">{error}</span>
      ) : route ? (
        <span className="flex items-center gap-2 font-medium tabular-nums">
          {loading && <LoaderCircle className="size-3.5 animate-spin opacity-70" />}
          {ui === "modern" ? "🛡️ Safest route" : "🌿 Greenest route"}
          <span className="text-[var(--bm-muted)]">·</span>
          {formatKm(route.distance_m)}
          <span className="text-[var(--bm-muted)]">·</span>
          {Math.round(route.duration_min)} min
        </span>
      ) : (
        <span className="flex items-center gap-2 text-[var(--bm-muted)]">
          <LoaderCircle className="size-3.5 animate-spin" /> Planning your route…
        </span>
      )}
      <span className="flex items-center gap-3 text-xs text-[var(--bm-muted)]">
        {(Object.keys(labels) as Level[]).map((lvl) => (
          <span key={lvl} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-5 rounded-full" style={{ background: colors[lvl] }} />
            {labels[lvl]}
          </span>
        ))}
      </span>
    </div>
  );
}
