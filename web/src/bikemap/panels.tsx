// Trip pickers: tap "From" or "To" in the sheet's trip line for one small rounded picker with search
// (saved places match as you type; OpenStreetMap on Enter), the presets, My location, and Swap.
import { Popover } from "radix-ui";
import { useMemo, useRef, useState } from "react";
import { bikemap, type LatLng, type Place, type SearchResult } from "./api";
import { Ico } from "./icons";
import { type Pin, placePoint, type TripPoint } from "./trip";

type Hit = { key: string; icon: string; name: string; detail: string; at: LatLng };

const CUPERTINO = { lat: 37.318, lng: -122.04 };

/** Browser geolocation, kept inside Cupertino (the only city BikeMap scores). */
export function locateMe(): Promise<TripPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser."));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const far = Math.hypot((here.lat - CUPERTINO.lat) * 111, (here.lng - CUPERTINO.lng) * 88) > 8;
        if (far) return reject(new Error("You're outside Cupertino."));
        resolve({ key: "me", name: "My location", ...here });
      },
      () => reject(new Error("Location is blocked.")),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export function PointPicker({
  which,
  value,
  places,
  pins,
  onPick,
  onSwap,
  onLocate,
  children,
}: {
  which: "from" | "to";
  value?: TripPoint;
  places: Place[];
  /** everything searchable locally (presets + nature spots) */
  pins: Pin[];
  onPick: (p: TripPoint) => void;
  onSwap: () => void;
  /** optional: called after "My location" resolves (the app may fly there) */
  onLocate?: (p: TripPoint) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [remote, setRemote] = useState<{
    q: string;
    rows: SearchResult[];
    error?: string;
    loading: boolean;
  }>();
  const input = useRef<HTMLInputElement>(null);

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
          icon: "",
          name: r.name,
          detail: r.detail,
          at: [r.lat, r.lng],
        }))
      : [];

  function runRemote() {
    const term = q.trim();
    if (term.length < 2) return;
    setRemote({ q: term, rows: [], loading: true });
    bikemap
      .search(term)
      .then((rows) => setRemote({ q: term, rows, loading: false }))
      .catch(() => setRemote({ q: term, rows: [], loading: false, error: "Search is offline." }));
  }

  function choose(p: TripPoint) {
    onPick(p);
    setOpen(false);
    setQ("");
  }

  function locate() {
    setBusy(true);
    setMsg(undefined);
    locateMe()
      .then((p) => {
        choose(p);
        onLocate?.(p);
      })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  }

  const presets = places.map(placePoint);
  const searching = query.length >= 2;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setMsg(undefined);
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      {/* No portal: the picker stays inside .bm-app so it keeps the theme tokens and font. */}
      <Popover.Content
        className="bm-picker"
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // phones: don't pop the keyboard over the map until they tap the field
          if (innerWidth >= 700) input.current?.focus();
        }}
      >
        <div className="bm-picker-search">
          <Ico n="search" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runRemote();
            }}
            placeholder={which === "from" ? "Start from…" : "Go to…"}
            aria-label={which === "from" ? "Search a start" : "Search a destination"}
          />
          {q && (
            <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ("")}>
              <Ico n="close" />
            </button>
          )}
        </div>
        <div className="bm-picker-list">
          {!searching && which === "from" && (
            <button type="button" className="bm-picker-row" onClick={locate} disabled={busy}>
              <span className="ic">{busy ? <span className="bm-spin" /> : <Ico n="locate" />}</span>
              <span className="nm">My location</span>
            </button>
          )}
          {!searching &&
            presets.map((p) => (
              <button
                key={p.key}
                type="button"
                className="bm-picker-row"
                aria-current={p.key === value?.key || undefined}
                onClick={() => choose(p)}
              >
                <span className="ic">
                  <Ico n="pin" />
                </span>
                <span className="nm">{p.name}</span>
              </button>
            ))}
          {searching &&
            [...local, ...osm].map((h) => (
              <button
                key={h.key}
                type="button"
                className="bm-picker-row"
                onClick={() => choose({ key: h.key, name: h.name, lat: h.at[0], lng: h.at[1] })}
              >
                <span className="ic">{h.icon || <Ico n="pin" />}</span>
                <span className="nm">
                  {h.name}
                  {h.detail && <small>{h.detail}</small>}
                </span>
              </button>
            ))}
          {searching && (
            <div className="bm-picker-note">
              {remote?.loading && remote.q === q.trim() ? (
                <>
                  <span className="bm-spin" /> Searching…
                </>
              ) : remote?.error && remote.q === q.trim() ? (
                remote.error
              ) : remote && remote.q === q.trim() ? (
                osm.length === 0 && "Nothing in Cupertino"
              ) : (
                "Enter to search the map"
              )}
            </div>
          )}
          {msg && <div className="bm-picker-note">{msg}</div>}
        </div>
        <button
          type="button"
          className="bm-picker-swap"
          onClick={() => {
            onSwap();
            setOpen(false);
          }}
        >
          <Ico n="swap" /> Swap
        </button>
      </Popover.Content>
    </Popover.Root>
  );
}
