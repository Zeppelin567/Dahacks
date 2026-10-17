import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { bikemap, type GreenPrefs, type LatLng, type Segment } from "./api";
import { PinCard, StreetCard } from "./detail-card";
import { HazardButton } from "./hazard-report";
import { MapView } from "./map-view";
import { LocateButton, ModeSwitch, SearchBox, StatsBar, TripCard } from "./panels";
import { PresetProfiles } from "./preset-profiles";
import { applyVoteDeltas, clampPref, toPrefVector } from "./route-utils";
import { ENGINE_MODE, type UiMode } from "./theme";
import { TradeoffCard } from "./tradeoff-card";
import { ll, type Pin, pinPoint, placePoint, presetPin, type TripPoint } from "./trip";
import { VoiceNavButton } from "./voice-nav";
import "./bikemap.css";

type Selection = { kind: "street"; at: LatLng } | { kind: "pin"; pin: Pin } | null;

// The product: one full-screen map with a Modern (safe) ↔ Nature (green) switch.
// Both modes share one trip, so switching keeps From/To and only changes how the route is chosen.
export function BikeApp() {
  const [params, setParams] = useSearchParams();
  const ui: UiMode = params.get("mode") === "nature" ? "nature" : "modern";
  const mode = ENGINE_MODE[ui];

  const places = useQuery({ queryKey: ["bikemap", "places"], queryFn: bikemap.places, staleTime: Infinity });
  // Fetched at startup (Overpass can take seconds) so Nature mode has its pins the moment you switch.
  const nature = useQuery({
    queryKey: ["bikemap", "destinations"],
    queryFn: bikemap.destinations,
    staleTime: Infinity,
    retry: 1,
  });

  const [startPick, setStart] = useState<TripPoint>();
  const [endPick, setEnd] = useState<TripPoint>();
  const preset = (id: string) => {
    const p = places.data?.find((x) => x.id === id);
    return p ? placePoint(p) : undefined;
  };
  const start = startPick ?? preset("deanza");
  const end = endPick ?? preset("main-street");

  const [rural, setRural] = useState(0.6);
  const [prefs, setPrefs] = useState<GreenPrefs>({ green: true, quiet: true, shade: false });
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [hazardArmed, setHazardArmed] = useState(false);
  const [voteAdjust, setVoteAdjust] = useState<Record<string, number>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem("bikemap-votes-v1") ?? "{}");
      return Object.fromEntries(
        Object.entries(value ?? {}).filter(
          ([key, v]) =>
            ["vegetation", "quiet", "shade"].includes(key) && typeof v === "number" && Number.isFinite(v),
        ),
      ) as Record<string, number>;
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
        Object.entries(toPrefVector(rural, prefs)).map(([f, v]) => [f, clampPref(v + (voteAdjust[f] ?? 0))]),
      ),
    [rural, prefs, voteAdjust],
  );
  const handleVote = (seg: Segment, like: boolean) => {
    const features = seg.features;
    if (features) setVoteAdjust((prev) => applyVoteDeltas(prev, features, like));
  };
  const [showRisk, setShowRisk] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [clickAt, setClickAt] = useState<LatLng | null>(null);
  const [flyTo, setFlyTo] = useState<{ at: LatLng; seq: number } | null>(null);

  const cityPins = useMemo(() => (places.data ?? []).map(presetPin), [places.data]);
  const naturePins = nature.data?.destinations ?? [];
  const pins = ui === "modern" ? cityPins : naturePins;
  const searchable = useMemo(() => {
    const seen = new Set<string>();
    return [...cityPins, ...naturePins].filter((p) => !seen.has(p.name) && seen.add(p.name));
  }, [cityPins, naturePins]);

  const network = useQuery({
    queryKey: ["bikemap", "network", "safe"],
    queryFn: () => bikemap.network("safe"),
    staleTime: Infinity,
    enabled: ui === "modern",
  });

  const tripKey = `${start?.key}:${start?.lat},${start?.lng}>${end?.key}:${end?.lat},${end?.lng}`;
  const green = mode === "green";
  const route = useQuery({
    queryKey: [
      "bikemap",
      "route",
      mode,
      tripKey,
      green ? rural : null,
      green ? prefs : null,
      green ? prefOverride : null,
    ],
    queryFn: () =>
      bikemap.route({
        start: ll(start as TripPoint),
        end: ll(end as TripPoint),
        mode,
        ...(green ? { rural, prefs, pref_override: prefOverride } : {}),
      }),
    enabled: !!start && !!end,
    placeholderData: (prev) => prev, // keep the old line on screen while the slider moves
  });

  const streetAt = selection?.kind === "street" ? selection.at : null;
  const street = useQuery({
    queryKey: ["bikemap", "street", streetAt, mode],
    queryFn: () => bikemap.street(streetAt as LatLng, mode),
    enabled: !!streetAt,
    retry: false,
    placeholderData: (prev) => prev, // switching modes swaps the card's content in place
  });

  function switchMode(m: UiMode) {
    setParams(m === "modern" ? {} : { mode: m }, { replace: true });
    if (selection?.kind === "pin") setSelection(null);
    setClickAt(null);
  }

  function goTo(p: TripPoint) {
    setEnd(p);
    setClickAt(null);
  }

  const apiDown = places.isError;
  const routeError = apiDown
    ? "The map service is temporarily unavailable. Please try again shortly."
    : route.isError
      ? "Couldn't plan a route between these points. Try a spot closer to a street."
      : undefined;

  return (
    <div className="bm-app" data-ui={ui} data-panel-open={mobilePanelOpen} data-detail-open={!!selection}>
      <div className="absolute inset-0">
        <MapView
          ui={ui}
          hazardArmed={hazardArmed}
          onDisarmHazard={() => setHazardArmed(false)}
          onVoteSegment={green ? handleVote : undefined}
          network={network.data?.segments}
          showNetwork={ui === "modern" && showRisk}
          route={route.data?.recommended}
          routeIsFresh={!route.isPlaceholderData}
          tripKey={tripKey}
          start={start}
          end={end}
          pins={pins}
          showPins={showPins}
          selectedPinId={selection?.kind === "pin" ? selection.pin.id : undefined}
          selectedCoords={selection?.kind === "street" ? street.data?.coords : undefined}
          clickAt={clickAt}
          flyTo={flyTo}
          onMapClick={(at) => {
            if (!hazardArmed) setClickAt(at);
          }}
          onStreetClick={(at) => {
            setClickAt(null);
            setSelection({ kind: "street", at });
          }}
          onPinClick={(pin) => {
            setClickAt(null);
            setSelection({ kind: "pin", pin });
          }}
          onSetStart={(at) => {
            setStart({ key: `click/${at.join()}`, name: "Dropped pin", lat: at[0], lng: at[1] });
            setClickAt(null);
          }}
          onSetEnd={(at) => goTo({ key: `click/${at.join()}`, name: "Dropped pin", lat: at[0], lng: at[1] })}
        />
      </div>

      {/* Floating UI. The wrapper ignores clicks so the map stays usable between the cards. */}
      <div className="bm-overlay">
        <div className="bm-top">
          <SearchBox
            pins={searchable}
            onPick={(p) => {
              goTo(p);
              setFlyTo({ at: ll(p), seq: Date.now() });
            }}
          />
          <ModeSwitch ui={ui} onChange={switchMode} />
          <HazardButton
            armed={hazardArmed}
            onToggle={() => {
              setHazardArmed((v) => !v);
              setMobilePanelOpen(false);
              setSelection(null);
              setClickAt(null);
            }}
          />
          <LocateButton
            onLocate={(p) => {
              setStart(p);
              setFlyTo({ at: ll(p), seq: Date.now() });
            }}
          />
        </div>

        <button
          type="button"
          className="bm-mobile-toggle bm-glass bm-btn"
          aria-expanded={mobilePanelOpen && !selection}
          aria-controls="trip-panel"
          onClick={() => {
            setSelection(null);
            setMobilePanelOpen((open) => !open);
          }}
        >
          {mobilePanelOpen && !selection ? "Back to map" : "Plan & compare routes"}
        </button>
        <section className="bm-left" id="trip-panel" aria-label="Trip planning">
          <TripCard
            ui={ui}
            places={places.data ?? []}
            start={start}
            end={end}
            onStart={setStart}
            onEnd={goTo}
            onSwap={() => {
              setStart(end);
              setEnd(start);
            }}
            rural={rural}
            onRural={setRural}
            prefs={prefs}
            onPrefs={setPrefs}
            showRisk={showRisk}
            onShowRisk={setShowRisk}
            showPins={showPins}
            onShowPins={setShowPins}
          />
          <section className="bm-glass mt-3 grid gap-3 p-4">
            {green && (
              <>
                <PresetProfiles
                  onApply={(p) => {
                    setRural(p.rural);
                    setPrefs(p.prefs);
                    setVoteAdjust({});
                  }}
                />
                {Object.keys(voteAdjust).length > 0 && (
                  <button type="button" className="bm-btn" onClick={() => setVoteAdjust({})}>
                    Reset segment votes
                  </button>
                )}
              </>
            )}
            {route.data && !route.isPlaceholderData && !route.isError && (
              <TradeoffCard data={route.data} mode={mode} />
            )}
            <VoiceNavButton
              route={!route.isPlaceholderData && !route.isError ? route.data?.recommended : undefined}
            />
          </section>
        </section>

        {selection && (
          <div className="bm-right">
            {selection.kind === "street" ? (
              <StreetCard
                ui={ui}
                detail={street.data}
                loading={street.isFetching}
                error={street.isError ? "No street within 60 m of that spot." : undefined}
                onClose={() => setSelection(null)}
              />
            ) : (
              <PinCard
                pin={selection.pin}
                from={start}
                onRoute={(pin) => {
                  goTo(pinPoint(pin));
                  setSelection(null);
                }}
                onClose={() => setSelection(null)}
              />
            )}
          </div>
        )}

        <div className="bm-bottom">
          <StatsBar ui={ui} route={route.data?.recommended} loading={route.isFetching} error={routeError} />
        </div>
      </div>
    </div>
  );
}
