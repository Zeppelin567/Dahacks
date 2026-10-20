// Trip fields: two rounded From / To fields that work like a maps app. Click (or Tab into) a field and type:
// saved places and nature spots match on every key, OpenStreetMap (the whole routing area) after a short pause.
// Before typing, the list offers "Use my location", "Choose on the map" and the presets. Arrows + Enter pick,
// Esc puts the old name back. The swap button flips the trip.
import { useQuery } from "@tanstack/react-query";
import { Popover } from "radix-ui";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { bikemap, type Place, type SearchResult } from "./api";
import { tripName } from "./derive";
import { Ico } from "./icons";
import { type Pin, placePoint, type TripPoint } from "./trip";

type Which = "from" | "to";
type How = "key" | "pointer";

const CUPERTINO = { lat: 37.318, lng: -122.04 };

/** Browser geolocation, kept inside Cupertino (the only city BikeScape scores). */
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

// OpenStreetMap search (Nominatim behind /search): one request per settled term, remembered for the session.
const searched = new Map<string, SearchResult[]>();
function useOsmSearch(term: string) {
  const key = term.toLowerCase();
  const [got, setGot] = useState<{ key: string; rows: SearchResult[]; error?: boolean }>();
  useEffect(() => {
    if (key.length < 3) return;
    const hit = searched.get(key);
    if (hit) {
      setGot({ key, rows: hit });
      return;
    }
    let live = true;
    let t: ReturnType<typeof setTimeout>;
    // one quiet retry: the public geocoder sometimes drops a request
    const ask = (tries: number) => {
      bikemap
        .search(key)
        .then((rows) => {
          searched.set(key, rows);
          if (live) setGot({ key, rows });
        })
        .catch(() => {
          if (!live) return;
          if (tries > 0) t = setTimeout(() => ask(tries - 1), 1200);
          else setGot({ key, rows: [], error: true });
        });
    };
    t = setTimeout(() => ask(1), 380);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  const fresh = got?.key === key ? got : undefined;
  return {
    rows: fresh?.rows ?? [],
    loading: key.length >= 3 && !fresh,
    error: !!fresh?.error,
  };
}

type Opt = {
  id: string;
  icon: ReactNode;
  name: ReactNode;
  detail?: string;
  current?: boolean;
  /** draw a hairline under this row (ends the "special" rows) */
  sep?: boolean;
  run: (how: How) => void;
};

/** "Memorial Park" with the typed part tinted. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const shortAddr = (d: string) => d.split(", ").slice(0, 2).join(", ");
const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 88_000) < 80;

/** A map-tap point reads "Near Sunrise Drive" instead of "Dropped pin" (nearest scored street, display only). */
function usePinLabel(p?: TripPoint) {
  const dropped = !!p && p.name === "Dropped pin";
  const q = useQuery({
    queryKey: ["bikemap", "pin-label", p?.lat, p?.lng],
    queryFn: () => bikemap.street([p?.lat ?? 0, p?.lng ?? 0], "safe").then((d) => d.name),
    enabled: dropped,
    staleTime: Infinity,
    retry: false,
  });
  const street = q.data && !/^unnamed/i.test(q.data) ? q.data : undefined;
  return dropped && street ? `Near ${street}` : undefined;
}

const PencilIco = () => (
  <svg className="bm-i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z M13.5 6.5l4 4" />
  </svg>
);
const MapIco = () => (
  <svg className="bm-i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 6.5L9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z M9 4.5v13 M15 6.5v13" />
  </svg>
);

export function TripFields({
  start,
  end,
  places,
  pins,
  onStart,
  onEnd,
  onSwap,
  onLocate,
}: {
  start?: TripPoint;
  end?: TripPoint;
  /** presets (from /places), listed before anything is typed */
  places: Place[];
  /** everything that matches locally while typing (presets + nature spots) */
  pins: Pin[];
  onStart: (p: TripPoint) => void;
  onEnd: (p: TripPoint) => void;
  onSwap: () => void;
  /** optional: called after "Use my location" resolves (the app may fly there) */
  onLocate?: (p: TripPoint) => void;
}) {
  const [which, setWhich] = useState<Which | null>(null);
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [mapHint, setMapHint] = useState<Which | null>(null);
  const [spin, setSpin] = useState(0);
  const fromInput = useRef<HTMLInputElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLFieldSetElement>(null);
  const clickFocus = useRef(false);
  const listId = useId();

  const input = (w: Which) => (w === "from" ? fromInput : toInput).current;
  const pointOf = (w: Which) => (w === "from" ? start : end);
  const pinLabel = { from: usePinLabel(start), to: usePinLabel(end) };
  const shownOf = (w: Which) => {
    const v = pointOf(w);
    return v ? (pinLabel[w] ?? tripName(v.name)) : "";
  };

  const open = which !== null;
  const dirty = which !== null && draft !== shownOf(which);
  const query = dirty ? draft.trim() : "";
  const searching = query.length > 0;
  const osm = useOsmSearch(query);

  // The map hint ("tap the map…") goes away once the trip changes, or after a while.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear on any change of the trip
  useEffect(() => {
    setMapHint(null);
  }, [start?.key, end?.key, start?.lat, end?.lat]);
  useEffect(() => {
    if (!mapHint) return;
    const t = setTimeout(() => setMapHint(null), 9000);
    return () => clearTimeout(t);
  }, [mapHint]);

  function begin(w: Which) {
    setWhich(w);
    setDraft(shownOf(w));
    setCursor(null);
    setMsg(undefined);
    setMapHint(null);
    requestAnimationFrame(() => input(w)?.select());
  }
  function finish() {
    setWhich(null);
    setCursor(null);
    setMsg(undefined);
  }
  function pick(w: Which, pt: TripPoint, how: How) {
    (w === "from" ? onStart : onEnd)(pt);
    finish();
    const el = input(w);
    if (!el) return;
    // touch: drop the keyboard so the new route is visible; keys: stay put with the name selected for retyping
    if (how === "pointer" && matchMedia("(pointer: coarse)").matches) el.blur();
    else requestAnimationFrame(() => el.select());
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: pick/pointOf/input only read props listed here
  const opts: Opt[] = useMemo(() => {
    if (!which) return [];
    const cur = pointOf(which);
    if (!searching) {
      const me: Opt = {
        id: "me",
        icon: busy ? <span className="bm-spin" /> : <Ico n="locate" />,
        name: "Use my location",
        run: (how) => {
          const w = which;
          setBusy(true);
          setMsg(undefined);
          locateMe()
            .then((pt) => {
              pick(w, pt, how);
              onLocate?.(pt);
            })
            .catch((e: Error) => setMsg(e.message))
            .finally(() => setBusy(false));
        },
      };
      const map: Opt = {
        id: "map",
        icon: <MapIco />,
        name: "Choose on the map",
        detail: which === "from" ? "Tap a spot, then Start here" : "Tap a spot, then Go here",
        sep: true,
        run: () => {
          setMapHint(which);
          finish();
          input(which)?.blur();
        },
      };
      const presets = places.map(placePoint).map<Opt>((pt) => ({
        id: pt.key,
        icon: <Ico n="pin" />,
        name: pt.name,
        current: pt.key === cur?.key,
        run: (how) => pick(which, pt, how),
      }));
      return [me, map, ...presets];
    }
    const ql = query.toLowerCase();
    const rank = (n: string) => {
      const s = n.toLowerCase();
      if (s.startsWith(ql)) return 0;
      if (s.split(/[\s/(-]+/).some((w) => w.startsWith(ql))) return 1;
      return s.includes(ql) ? 2 : 9;
    };
    const local = pins
      .map((p) => ({ p, r: rank(p.name) }))
      .filter((x) => x.r < 9)
      .sort((a, b) => a.r - b.r)
      .slice(0, 6)
      .map(({ p }) => p);
    const rows: Opt[] = local.map((p) => {
      const pt: TripPoint = { key: p.id, name: p.name, lat: p.lat, lng: p.lng };
      return {
        id: p.id,
        icon: p.icon || <Ico n="pin" />,
        name: <Hl text={p.name} q={query} />,
        detail: p.category_label || undefined,
        current: pt.key === cur?.key,
        run: (how) => pick(which, pt, how),
      };
    });
    // OpenStreetMap also matches on tags ("Memorial" finds every historic marker): keep rows that say the
    // typed words, unless that leaves nothing at all to offer
    const words = ql.split(/\s+/).filter((w) => w.length >= 3);
    const says = (r: SearchResult) => words.some((w) => `${r.name} ${r.detail}`.toLowerCase().includes(w));
    const fresh = osm.rows.filter(
      (r) => !local.some((p) => p.name.toLowerCase() === r.name.toLowerCase() || near(p, r)),
    );
    const relevant = fresh.filter(says);
    for (const r of relevant.length || local.length ? relevant : fresh) {
      const pt: TripPoint = { key: `osm/${r.lat},${r.lng}`, name: r.name, lat: r.lat, lng: r.lng };
      rows.push({
        id: pt.key,
        icon: <Ico n="search" />,
        name: <Hl text={r.name} q={query} />,
        detail: shortAddr(r.detail),
        run: (how) => pick(which, pt, how),
      });
    }
    return rows;
  }, [which, searching, query, places, pins, osm.rows, busy, start, end, onLocate]);

  const active = cursor ?? (searching && opts.length > 0 ? 0 : -1);
  const optId = (i: number) => `${listId}-o${i}`;

  // keep the keyboard row in view
  useEffect(() => {
    if (which && active >= 0)
      document.getElementById(`${listId}-o${active}`)?.scrollIntoView({ block: "nearest" });
  }, [which, active, listId]);

  const note = !searching
    ? msg
    : osm.loading
      ? "loading"
      : osm.error
        ? opts.length === 0
          ? "Map search didn't answer. Try again"
          : undefined
        : opts.length === 0
          ? query.length < 3
            ? "Keep typing…"
            : "Nothing by that name nearby"
          : undefined;

  function keys(w: Which, e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab moves on: close the list first so focus lands on the next control, not on a popover focus guard
    if (e.key === "Tab") {
      if (which) finish();
      return;
    }
    if (e.key === "Escape") {
      if (which) {
        e.stopPropagation();
        finish();
        requestAnimationFrame(() => input(w)?.select());
      }
      return;
    }
    if (which !== w) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        begin(w);
      }
      return;
    }
    const n = opts.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setCursor((active + 1) % n);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setCursor(active <= 0 ? n - 1 : active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) opts[active]?.run("key");
    }
  }

  function field(w: Which) {
    const editing = which === w;
    const v = pointOf(w);
    const label = w === "from" ? "Start" : "Destination";
    return (
      <label
        className="bm-tf"
        data-which={w}
        data-editing={editing || undefined}
        title={editing ? undefined : v && (pinLabel[w] ?? v.name)}
      >
        <i className={w === "from" ? "dt" : "dt e"} aria-hidden="true" />
        <input
          ref={w === "from" ? fromInput : toInput}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={editing}
          aria-controls={editing ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={editing && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={w === "from" ? "Choose start" : "Where to?"}
          value={editing ? draft : shownOf(w)}
          onMouseDown={(e) => {
            clickFocus.current = document.activeElement !== e.currentTarget;
          }}
          onMouseUp={(e) => {
            // keep the select-all from focus (a click would otherwise drop a caret in the middle)
            if (clickFocus.current) e.preventDefault();
            clickFocus.current = false;
          }}
          onFocus={() => {
            if (which !== w) begin(w);
          }}
          onClick={() => {
            if (which !== w) begin(w);
          }}
          onBlur={() => {
            if (which === w) finish();
          }}
          onChange={(e) => {
            if (which !== w) {
              setWhich(w);
              setMsg(undefined);
            }
            setDraft(e.target.value);
            setCursor(null);
          }}
          onKeyDown={(e) => keys(w, e)}
        />
        {editing && draft ? (
          <button
            type="button"
            className="bm-tf-x"
            tabIndex={-1}
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft("");
              setCursor(null);
              input(w)?.focus();
            }}
          >
            <Ico n="close" />
          </button>
        ) : (
          <span className="bm-tf-edit" aria-hidden="true">
            <PencilIco />
          </span>
        )}
      </label>
    );
  }

  return (
    <div className="bm-trip">
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          if (!o) finish();
        }}
      >
        <Popover.Anchor asChild>
          <fieldset ref={anchor} className="bm-trip-fields" aria-label="Start and destination">
            {field("from")}
            {field("to")}
          </fieldset>
        </Popover.Anchor>
        {/* No portal: the list stays inside .bm-app so it keeps the theme tokens and font. */}
        <Popover.Content
          className="bm-picker"
          // phones: the sheet sits at the bottom and the keyboard rises over it, so the list opens upward
          side={matchMedia("(max-width: 700px)").matches ? "top" : "bottom"}
          align="start"
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // clicks inside the fields are the fields' own business (switching From <-> To, the clear button)
            // (Radix checks on click, after React has re-rendered: a target that left the DOM was inside, e.g. the clear button)
            const t = e.target as Node;
            if (!t.isConnected || anchor.current?.contains(t)) e.preventDefault();
          }}
          // a click in the list must not blur the field (that would close the list before the click lands)
          onMouseDown={(e) => e.preventDefault()}
        >
          <div
            id={listId}
            role="listbox"
            className="bm-picker-list"
            aria-label={which === "to" ? "Destinations" : "Starts"}
          >
            {opts.map((o, i) => (
              <button
                key={o.id}
                id={optId(i)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                data-active={i === active || undefined}
                data-current={o.current || undefined}
                className={o.sep ? "bm-picker-row sep" : "bm-picker-row"}
                disabled={o.id === "me" && busy}
                onPointerMove={(e) => {
                  if (e.pointerType === "mouse" && cursor !== i) setCursor(i);
                }}
                onClick={() => o.run("pointer")}
              >
                <span className="ic">{o.icon}</span>
                <span className="nm">
                  {o.name}
                  {o.detail && <small>{o.detail}</small>}
                </span>
                {o.current && <Ico n="check" className="cur" />}
              </button>
            ))}
          </div>
          {note && (
            <div className="bm-picker-note" role="status">
              {note === "loading" ? (
                <>
                  <span className="bm-spin" /> Searching the map…
                </>
              ) : (
                note
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Root>
      <button
        type="button"
        className="bm-trip-swap"
        aria-label="Swap start and destination"
        title="Swap"
        disabled={!start || !end}
        onClick={() => {
          finish();
          setSpin((s) => s + 1);
          onSwap();
        }}
      >
        <span style={{ transform: `rotate(${spin * 180}deg)` }}>
          <Ico n="swap" />
        </span>
      </button>
      {mapHint && (
        <div className="bm-trip-hint" role="status">
          <MapIco />
          {mapHint === "from" ? "Tap the map, then Start here" : "Tap the map, then Go here"}
        </div>
      )}
    </div>
  );
}
