import { ArrowUpRight, Leaf, MapPin, Play, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bikemap, type LatLng, type StreetDetail } from "@/bikemap/api";
import { StreetCard } from "@/bikemap/detail-card";
import { MapView } from "@/bikemap/map-view";
import { StatsBar } from "@/bikemap/panels";
import type { UiMode } from "@/bikemap/theme";
import { distanceM, placePoint, presetPin } from "@/bikemap/trip";
import { type DemoData, MEDIA } from "./data";
import "@/bikemap/bikemap.css";

export function ProductDemo({
  data,
  paused,
  ui,
  onModeChange,
}: {
  data: DemoData;
  paused: boolean;
  ui: UiMode;
  onModeChange: (mode: UiMode) => void;
}) {
  const [tripId, setTripId] = useState(data.trips[0]?.id ?? "main-street");
  const [rural, setRural] = useState(0.5);
  const [detail, setDetail] = useState<StreetDetail>();
  const [selectedAt, setSelectedAt] = useState<LatLng | null>(null);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const trip = data.trips.find((t) => t.id === tripId) ?? data.trips[0];
  const key = ui === "modern" ? "safe" : `green${rural}`;
  const route = trip?.routes[key];
  const photos = trip?.photos[key] ?? [];
  useEffect(() => {
    if (recording) dialog.current?.showModal();
    else {
      dialog.current?.close();
      video.current?.pause();
    }
  }, [recording]);
  useEffect(() => {
    if (paused) video.current?.pause();
  }, [paused]);
  useEffect(() => {
    pending.current++;
    setDetail(undefined);
    setSelectedAt(null);
    setLoading(false);
  }, [ui]);
  if (!trip || !route) return <p className="rs-loading">Preparing the route…</p>;

  function switchUi(mode: UiMode) {
    pending.current++;
    onModeChange(mode);
    setDetail(undefined);
    setSelectedAt(null);
    setLoading(false);
  }
  async function inspect(at: LatLng) {
    const request = ++pending.current;
    setSelectedAt(at);
    setLoading(true);
    const mode = ui === "modern" ? "safe" : "green";
    const cached = [...photos, ...(trip?.details ?? [])]
      .filter((p) => p.detail.mode === mode)
      .sort(
        (a, b) =>
          distanceM({ lat: a.at[0], lng: a.at[1] }, { lat: at[0], lng: at[1] }) -
          distanceM({ lat: b.at[0], lng: b.at[1] }, { lat: at[0], lng: at[1] }),
      )[0];
    if (cached && distanceM({ lat: cached.at[0], lng: cached.at[1] }, { lat: at[0], lng: at[1] }) < 150) {
      setDetail(cached.detail);
      setLoading(false);
      return;
    }
    setDetail(undefined);
    try {
      const live = await bikemap.street(at, mode);
      if (pending.current === request) setDetail(live);
    } catch {
      /* StreetCard presents the empty state. Saved route photos always work offline. */
    } finally {
      if (pending.current === request) setLoading(false);
    }
  }

  return (
    <div className="rs-product" data-deck-interactive>
      <div className="rs-product-top">
        <div className="rs-product-brand">
          <span className="rs-brand-dot" /> RideScape <span>Cupertino</span>
        </div>
        <fieldset className="rs-mode" aria-label="Presentation route mode">
          <button type="button" aria-pressed={ui === "modern"} onClick={() => switchUi("modern")}>
            <ShieldCheck size={16} /> Fast & Safe
          </button>
          <button type="button" aria-pressed={ui === "nature"} onClick={() => switchUi("nature")}>
            <Leaf size={16} /> Nature
          </button>
        </fieldset>
        <a
          className="rs-live-link"
          href={ui === "nature" ? "/bike-app?mode=nature" : "/bike-app"}
          target="_blank"
          rel="noreferrer"
        >
          Live app <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="rs-demo-map">
        <div className="bm-app" data-ui={ui}>
          <MapView
            compact
            ui={ui}
            network={data.network.segments}
            showNetwork={ui === "modern"}
            greenLayers={ui === "nature" ? data.layers : undefined}
            route={route.recommended}
            routeIsFresh
            tripKey={`${trip.id}-${key}`}
            start={placePoint(trip.start)}
            end={placePoint(trip.end)}
            pins={[presetPin(trip.start), presetPin(trip.end)]}
            showPins={false}
            selectedCoords={detail?.coords}
            clickAt={null}
            flyTo={null}
            onMapClick={(at) => {
              if (at) void inspect(at);
            }}
            onStreetClick={(at) => void inspect(at)}
            onPinClick={() => {}}
            onSetStart={() => {}}
            onSetEnd={() => {}}
          />
          <div className="rs-demo-controls bm-glass">
            <span className="rs-eyebrow">
              {ui === "modern" ? "A calmer commute" : "A little more nature"}
            </span>
            <label htmlFor="demo-trip">Try a journey</label>
            <select
              id="demo-trip"
              value={tripId}
              onChange={(e) => {
                pending.current++;
                setTripId(e.target.value);
                setDetail(undefined);
                setSelectedAt(null);
                setLoading(false);
              }}
            >
              {data.trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.end.name}
                </option>
              ))}
            </select>
            <div className="rs-demo-from">
              <MapPin size={13} /> From {trip.start.name.replace(" / Civic Center", "")}
            </div>
            {ui === "nature" ? (
              <div className="rs-scenic-control">
                <div>
                  <label htmlFor="demo-scenic">Direct to scenic</label>
                  <b>{Math.round(rural * 100)}%</b>
                </div>
                <input
                  id="demo-scenic"
                  aria-label="Scenic preference"
                  type="range"
                  min="0"
                  max="1"
                  step="0.5"
                  value={rural}
                  onChange={(e) => {
                    pending.current++;
                    setRural(Number(e.target.value));
                    setDetail(undefined);
                    setSelectedAt(null);
                    setLoading(false);
                  }}
                />
                <div className="rs-slider-labels">
                  <span>Direct</span>
                  <span>Scenic</span>
                </div>
                <div className="rs-demo-tags">
                  <span>
                    <Leaf size={12} /> Greenery
                  </span>
                  <span>Quiet</span>
                </div>
              </div>
            ) : (
              <div className="rs-safety-legend">
                <span>
                  <i /> Safe
                </span>
                <span>
                  <i /> Caution
                </span>
                <span>
                  <i /> Risky
                </span>
              </div>
            )}
            <p>Click a street to see what’s behind its score.</p>
          </div>
          {selectedAt && (
            <div className="rs-demo-detail">
              <StreetCard
                ui={ui}
                detail={detail}
                loading={loading}
                onClose={() => {
                  pending.current++;
                  setSelectedAt(null);
                  setDetail(undefined);
                }}
                error="Try one of the highlighted streets or route photos."
              />
            </div>
          )}
          <div className="rs-demo-stats">
            <StatsBar
              ui={ui}
              route={route.recommended}
              loading={false}
              photos={photos}
              photosLoading={false}
              selectedAt={selectedAt}
              onPhoto={(at) => {
                const p = photos.find((p) => p.at[0] === at[0] && p.at[1] === at[1]);
                if (p) {
                  pending.current++;
                  setSelectedAt(at);
                  setDetail(p.detail);
                  setLoading(false);
                }
              }}
            />
          </div>
        </div>
      </div>
      <div className="rs-product-foot">
        <span>Real routes. Real street scores.</span>
        <button type="button" onClick={() => setRecording(true)}>
          <Play size={13} /> Watch the recording
        </button>
      </div>
      <dialog ref={dialog} className="rs-video-dialog" onCancel={() => setRecording(false)}>
        <button
          type="button"
          className="rs-icon-button rs-dialog-close"
          aria-label="Close recording"
          onClick={() => setRecording(false)}
        >
          <X />
        </button>
        {/* biome-ignore lint/a11y/useMediaCaption: The supplied screen recording has no audio stream. */}
        <video ref={video} controls playsInline poster={`${MEDIA}demo-poster.jpg`} src={`${MEDIA}demo.mp4`} />
      </dialog>
    </div>
  );
}
