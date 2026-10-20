import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { bikemap, type GreenPrefs, type LatLng, type RouteResponse } from "./api";
import { CARD_POPUP_CLASS, StreetCard } from "./detail-card";
import { FeatureTools } from "./feature-tools";
import { HazardDialog, HazardMarkers, useHazards } from "./hazards";
import {
  type BikeMapHandle,
  type DrawEvent,
  lenOf,
  MapControls,
  MapLayers,
  MapLibreMap,
  type MapPick,
  MapPopup,
  PickPopup,
  pickFromStreet,
  RaceLayer,
  type RaceProgress,
  type RaceResult,
  ScaleBar,
  useCrossings,
} from "./map";
import { RideBar } from "./ride";
import { applyVoteDeltas, clampPref, toPrefVector } from "./route-utils";
import { type RouteSel, Sheet } from "./sheet";
import { ModeSwitch } from "./switch";
import { ENGINE_MODE, type UiMode } from "./theme";
import { BikeRoot } from "./theme-context";
import { type RaceState, TryTray } from "./tray";
import { ll, placePoint, presetPin, type TripPoint, urlPoint, urlValue } from "./trip";
import { useRouteVoice } from "./use-voice";
import "./bikemap.css";
import "./features.css";

/** Nature's "Scenic" sends this rural weight to /route; "Direct" sends 0. */
const SCENIC_RURAL = 0.6;

// The product: one full-screen map with a Modern (safe) ↔ Nature (green) switch.
// Both modes share one trip, so switching keeps From/To and only changes how the route is chosen.
export function BikeApp() {
  const [params, setParams] = useSearchParams();
  const ui: UiMode = params.get("mode") === "nature" ? "nature" : "modern";
  const mode = ENGINE_MODE[ui];

  const places = useQuery({ queryKey: ["bikemap", "places"], queryFn: bikemap.places, staleTime: Infinity });
  // Fetched at startup (Overpass can take seconds) so search already knows the nature spots.
  const nature = useQuery({
    queryKey: ["bikemap", "destinations"],
    queryFn: bikemap.destinations,
    staleTime: Infinity,
    retry: 1,
  });
  // Parks, water and street trees (one ~300 kB file): the map draws them, the sheet counts trees along the route.
  const greenLayers = useQuery({
    queryKey: ["bikemap", "green-layers"],
    queryFn: bikemap.greenLayers,
    staleTime: Infinity,
  });

  const [startPick, setStart] = useState<TripPoint>();
  const [endPick, setEnd] = useState<TripPoint>();
  const preset = (id: string) => {
    const p = places.data?.find((x) => x.id === id);
    return p ? placePoint(p) : undefined;
  };
  // Default trip = v3's demo ride (Infinite Loop -> Cupertino Library). Both ends are editable in the sheet's fields;
  // ?from= / ?to= take a place id (memorial-park) or "lat,lng[,name]" for other demos.
  // an unknown value in the URL falls back to the demo trip (never a sheet stuck on "Finding your way…")
  const start = startPick ?? urlPoint(params.get("from"), places.data ?? []) ?? preset("infinite-loop");
  const end = endPick ?? urlPoint(params.get("to"), places.data ?? []) ?? preset("library");

  const [rural, setRural] = useState(params.get("direct") === "1" ? 0 : SCENIC_RURAL);
  const [prefs, setPrefs] = useState<GreenPrefs>({
    green: true,
    quiet: true,
    shade: params.get("shade") === "1",
  });
  const [hazardArmed, setHazardArmed] = useState(false);
  const [hazardAt, setHazardAt] = useState<LatLng | null>(null);
  const { hazards, setHazards } = useHazards();
  const [voteAdjust, setVoteAdjust] = useState<Record<string, number>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("bikemap-votes-v1") ?? "{}");
      return Object.fromEntries(
        Object.entries(raw ?? {})
          .filter(
            ([k, v]) =>
              ["vegetation", "quiet", "shade"].includes(k) && typeof v === "number" && Number.isFinite(v),
          )
          .map(([k, v]) => [k, clampPref(v as number)]),
      );
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("bikemap-votes-v1", JSON.stringify(voteAdjust));
    } catch {
      /* Storage unavailable. */
    }
  }, [voteAdjust]);
  const prefOverride = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(toPrefVector(rural, prefs)).map(([f, v]) => [
          f,
          v === 0 ? 0 : clampPref(v + (voteAdjust[f] ?? 0)),
        ]),
      ),
    [rural, prefs, voteAdjust],
  );
  const [sel, setSel] = useState<RouteSel>("rec");
  const [pick, setPick] = useState<MapPick | null>(null);
  const [streetAt, setStreetAt] = useState<LatLng | null>(null);
  const [clickAt, setClickAt] = useState<LatLng | null>(null);
  const [view3d, setView3d] = useState(params.get("view") === "3d");
  const [drawing, setDrawing] = useState(false);
  const [hop, setHop] = useState(0);
  const [trayOpen, setTrayOpen] = useState(params.get("tools") === "1");
  const [race, setRace] = useState<RaceState>("idle");
  const [raceId, setRaceId] = useState(0);
  const [raceLive, setRaceLive] = useState<RaceProgress | null>(null);
  const [raceEnd, setRaceEnd] = useState<RaceResult | null>(null);
  const mapRef = useRef<BikeMapHandle>(null);
  const [mapReady, setMapReady] = useState(false);
  const flyTo = (at: LatLng, zoom?: number) => mapRef.current?.flyTo(at, zoom);

  // Keep ?from / ?to in step with the trip so a reload or a shared link shows the same ride.
  function syncUrl(next: { from?: TripPoint; to?: TripPoint }) {
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        for (const [k, p] of Object.entries(next) as ["from" | "to", TripPoint | undefined][]) {
          if (p) q.set(k, urlValue(p));
        }
        return q;
      },
      { replace: true },
    );
  }
  const setStartPt = (p: TripPoint) => {
    setStart(p);
    syncUrl({ from: p });
  };
  const setEndPt = (p: TripPoint) => {
    setEnd(p);
    syncUrl({ to: p });
  };
  const dropAt = (at: LatLng, name = "Dropped pin"): TripPoint => ({
    key: `click/${at.join()}`,
    name,
    lat: at[0],
    lng: at[1],
  });

  const cityPins = useMemo(() => (places.data ?? []).map(presetPin), [places.data]);
  const naturePins = nature.data?.destinations ?? [];
  const searchable = useMemo(() => {
    const seen = new Set<string>();
    return [...cityPins, ...naturePins].filter((p) => !seen.has(p.name) && seen.add(p.name));
  }, [cityPins, naturePins]);

  const tripKey = `${start?.key}:${start?.lat},${start?.lng}>${end?.key}:${end?.lat},${end?.lng}`;
  // Both engines are fetched so each map already has its own route when the seam sweeps across.
  const routeQuery = (m: "safe" | "green") => ({
    queryKey: [
      "bikemap",
      "route",
      m,
      tripKey,
      m === "green" ? rural : null,
      m === "green" ? prefs : null,
      m === "green" ? prefOverride : null,
    ],
    queryFn: () =>
      bikemap.route({
        start: ll(start as TripPoint),
        end: ll(end as TripPoint),
        mode: m,
        ...(m === "green" ? { rural, prefs, pref_override: prefOverride } : {}),
      }),
    enabled: !!start && !!end,
    placeholderData: (prev: RouteResponse | undefined) => prev, // keep the old line on screen while a new one loads
  });
  const safeRoute = useQuery(routeQuery("safe"));
  const greenRoute = useQuery(routeQuery("green"));
  const route = ui === "nature" ? greenRoute : safeRoute;
  const freshRoute = !route.isPlaceholderData && !route.isError ? route.data : undefined;
  const voice = useRouteVoice(freshRoute?.[sel === "rec" ? "recommended" : "fastest"]);
  const crossings = useCrossings(safeRoute.data);

  // Nature's Street View stops along our route, refetched only when the green line itself changes.
  const grec = greenRoute.data?.recommended;
  const routeKey = grec
    ? `${grec.distance_m}|${grec.coords.length}|${grec.coords[0]}|${grec.coords.at(-1)}`
    : null;
  const photos = useQuery({
    queryKey: ["bikemap", "route-photos", "green", routeKey],
    queryFn: () => bikemap.routePhotos((grec as NonNullable<typeof grec>).coords, "green", 5),
    enabled: !!grec && !greenRoute.isPlaceholderData && !greenRoute.isError,
    staleTime: Infinity,
    placeholderData: (prev) => prev,
  });

  // Right-click / long-press: ask the API about that street (Claude's photo read + Street View link).
  const street = useQuery({
    queryKey: ["bikemap", "street", streetAt, mode],
    queryFn: () => bikemap.street(streetAt as LatLng, mode),
    enabled: !!streetAt,
    retry: false,
  });

  // Frame the trip when a new trip's route arrives and after a mode switch.
  const fitted = useRef("");
  const rd = route.data;
  const fresh = !route.isPlaceholderData;
  useEffect(() => {
    const key = `${ui}|${tripKey}`;
    if (!mapReady || !rd || !fresh || fitted.current === key) return;
    fitted.current = key;
    mapRef.current?.fit([rd.fastest.coords, rd.recommended.coords]);
  }, [mapReady, rd, fresh, ui, tripKey]);

  // A new trip (or new Nature settings) ends a race: the old result no longer describes the route on screen.
  const raceRef = useRef(race);
  raceRef.current = race;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire only when the trip or the route settings change
  useEffect(() => {
    if (raceRef.current !== "idle") stopRace();
  }, [tripKey, rural, prefs, prefOverride]);

  function closeCards() {
    setPick(null);
    setStreetAt(null);
    setClickAt(null);
  }

  function stopRace() {
    setRace("idle");
    setRaceLive(null);
    setRaceEnd(null);
  }
  function startRace() {
    if (!freshRoute) return;
    voice.stop();
    setHazardArmed(false);
    closeCards();
    setRaceLive(null);
    setRaceEnd(null);
    setRace("running");
    setRaceId((n) => n + 1);
  }

  const recenter = () => {
    closeCards();
    if (race !== "idle") stopRace();
    if (rd) mapRef.current?.fit([rd.fastest.coords, rd.recommended.coords]);
  };

  function switchMode(m: UiMode) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (m === "modern") next.delete("mode");
        else next.set("mode", m);
        return next;
      },
      { replace: true },
    );
    closeCards();
    if (race !== "idle") stopRace();
  }

  function pickRoute(k: RouteSel) {
    if (k === sel) return;
    setSel(k);
    setPick(null);
    const r = rd?.[k === "rec" ? "recommended" : "fastest"];
    if (r) mapRef.current?.fit([r.coords], { maxZoom: 16.2 });
  }

  function onDraw(e: DrawEvent) {
    if (e.phase === "start") setDrawing(true);
    else if (e.phase === "ours") setDrawing(false);
    else {
      setDrawing(false);
      setHop((h) => h + 1);
    }
  }

  // Escape closes whatever floats (card, tray, race).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPick(null);
      setStreetAt(null);
      setClickAt(null);
      setTrayOpen(false);
      setHazardArmed(false);
      setHazardAt(null);
      setRace("idle"); // ends a race too (state setters are stable, unlike stopRace)
      setRaceLive(null);
      setRaceEnd(null);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  function toggleReport() {
    stopRace();
    voice.stop();
    closeCards();
    setTrayOpen(false);
    setHazardArmed((armed) => !armed);
  }

  const apiDown = places.isError;
  const routeError = apiDown
    ? "Can't reach the bike map service."
    : route.isError
      ? "No route between these points. Try a spot closer to a street."
      : undefined;

  const streetPick = streetAt && street.data ? pickFromStreet(street.data, streetAt, ui) : null;
  const fastLen = safeRoute.data ? lenOf(safeRoute.data.fastest.coords) : 0;
  const rideXs = fastLen ? crossings.map((c) => ({ n: c.n, f: c.along / fastLen })) : [];
  const racing = race !== "idle";

  return (
    <BikeRoot ui={ui}>
      <MapLibreMap
        ref={mapRef}
        ui={ui}
        view3d={view3d}
        onReady={() => setMapReady(true)}
        onClick={(e) => {
          if (racing) return;
          if (hazardArmed) {
            setHazardAt(e.at);
            setHazardArmed(false);
            closeCards();
            return;
          }
          setPick(null);
          setStreetAt(null);
          setTrayOpen(false);
          setClickAt(e.at);
        }}
        onContextMenu={(e) => {
          e.originalEvent.preventDefault();
          if (racing) return;
          setClickAt(null);
          setPick(null);
          setStreetAt(e.at);
        }}
      >
        <HazardMarkers
          hazards={hazards}
          onRemove={(id) => setHazards((prev) => prev.filter((h) => h.id !== id))}
        />
        <MapLayers
          routes={{ modern: safeRoute.data, nature: greenRoute.data }}
          sel={sel}
          photos={photos.data}
          prefs={prefs}
          pick={pick}
          interactive={!racing && !hazardArmed}
          onPick={(p) => {
            setClickAt(null);
            setStreetAt(null);
            setTrayOpen(false);
            setPick(p);
          }}
          onDraw={onDraw}
        />
        <RaceLayer
          running={racing}
          runId={raceId}
          route={route.data}
          leafTarget={() => document.getElementById("bm-ride-pip")}
          onProgress={setRaceLive}
          onEnd={(r) => {
            setRaceEnd(r);
            setRace("done");
          }}
        />
        <PickPopup pick={pick} className={CARD_POPUP_CLASS} onClose={() => setPick(null)}>
          <StreetCard
            pick={pick}
            onVote={
              ui === "nature" &&
              freshRoute &&
              pick?.kind === "street" &&
              pick.features &&
              (pick.source === "rec" || pick.source === "fast")
                ? (like) => {
                    const features = pick.features;
                    if (features) setVoteAdjust((prev) => applyVoteDeltas(prev, features, like));
                    closeCards();
                  }
                : undefined
            }
            onClose={() => setPick(null)}
            onStart={
              pick && pick.kind !== "crossing"
                ? () => {
                    setStartPt(dropAt(pick.at));
                    closeCards();
                  }
                : undefined
            }
            onEnd={
              pick && pick.kind !== "crossing"
                ? () => {
                    setEndPt(dropAt(pick.at));
                    closeCards();
                  }
                : undefined
            }
          />
        </PickPopup>
        {streetAt && (
          <MapPopup at={streetAt} className={CARD_POPUP_CLASS} offset={18} onClose={() => setStreetAt(null)}>
            <StreetCard
              pick={streetPick}
              loading={street.isFetching}
              error={street.isError ? "No scored street here." : undefined}
              onClose={() => setStreetAt(null)}
              onStart={() => {
                setStartPt(dropAt(streetAt));
                closeCards();
              }}
              onEnd={() => {
                setEndPt(dropAt(streetAt));
                closeCards();
              }}
            />
          </MapPopup>
        )}
        {clickAt && (
          <MapPopup at={clickAt} onClose={() => setClickAt(null)}>
            <div className="bm-drop">
              <button
                type="button"
                onClick={() => {
                  setStartPt(dropAt(clickAt));
                  setClickAt(null);
                }}
              >
                <i />
                Start here
              </button>
              <button
                type="button"
                className="go"
                onClick={() => {
                  setEndPt(dropAt(clickAt));
                  setClickAt(null);
                }}
              >
                <i className="e" />
                Go here
              </button>
            </div>
          </MapPopup>
        )}
        <ScaleBar />
        <MapControls view3d={view3d} onToggle3d={() => setView3d((v) => !v)} onRecenter={recenter} />
      </MapLibreMap>

      <HazardDialog
        at={hazardAt}
        onClose={() => setHazardAt(null)}
        onSave={(hazard) => setHazards((prev) => [...prev, hazard])}
      />
      {hazardArmed && (
        <div className="bm-report-hint" role="status">
          Tap the map to mark a hazard.
          <button type="button" onClick={() => setHazardArmed(false)}>
            Cancel
          </button>
        </div>
      )}
      <ModeSwitch ui={ui} onChange={switchMode} />

      <Sheet
        ui={ui}
        places={places.data ?? []}
        pins={searchable}
        start={start}
        end={end}
        onStart={(p) => {
          setStartPt(p);
          closeCards();
        }}
        onEnd={(p) => {
          setEndPt(p);
          closeCards();
        }}
        onSwap={() => {
          setStart(end);
          setEnd(start);
          syncUrl({ from: end, to: start });
          closeCards();
        }}
        onLocate={(p) => flyTo(ll(p))}
        route={route.data}
        loading={route.isFetching}
        error={routeError}
        sel={sel}
        onSel={pickRoute}
        scenic={rural >= 0.5}
        onScenic={(s) => setRural(s ? SCENIC_RURAL : 0)}
        prefs={prefs}
        onPrefs={setPrefs}
        crossings={crossings}
        activeCrossing={pick?.kind === "crossing" ? pick.crossing.n : null}
        onCrossing={(c) => {
          if (ui !== "modern") switchMode("modern");
          setClickAt(null);
          setStreetAt(null);
          setPick({ kind: "crossing", at: c.at, mode: "modern", crossing: c });
          flyTo(c.at, 17);
        }}
        photos={photos.data}
        onPhoto={(i) => {
          const ph = photos.data?.[i];
          if (!ph) return;
          if (ui !== "nature") switchMode("nature");
          setClickAt(null);
          setStreetAt(null);
          setPick({ kind: "photo", at: ph.at, mode: "nature", index: i, photo: ph });
          flyTo(ph.at, 17);
        }}
        trees={greenLayers.data?.trees}
        drawing={drawing}
        hop={hop}
        onTry={() => setTrayOpen((o) => !o)}
        defaultMore={params.get("more") === "1"}
        tools={
          <FeatureTools
            ui={ui}
            rural={rural}
            onRural={setRural}
            onPreset={(value, next) => {
              setRural(value);
              setPrefs(next);
              setVoteAdjust({});
            }}
            hasVotes={Object.keys(voteAdjust).length > 0}
            onResetVotes={() => setVoteAdjust({})}
            armed={hazardArmed}
            onReport={toggleReport}
            voice={voice}
            canListen={!!freshRoute}
          />
        }
      />

      <TryTray
        hidden={racing}
        open={trayOpen}
        onOpenChange={setTrayOpen}
        race={race}
        canRace={!!freshRoute}
        listening={voice.speaking}
        onListen={voice.supported && freshRoute ? voice.toggle : undefined}
        onReport={toggleReport}
        onRace={() => (race === "running" ? stopRace() : startRace())}
      />
      <RideBar
        ui={ui}
        open={racing}
        live={raceLive}
        result={raceEnd}
        crossings={rideXs}
        onStop={stopRace}
        onAgain={startRace}
      />
    </BikeRoot>
  );
}
