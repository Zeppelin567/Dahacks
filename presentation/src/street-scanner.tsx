import React, { useState, useEffect, useRef } from "react";
import {
  Scan,
  Database,
  ShieldCheck,
  TreePine,
  Flower2,
  Waves,
  RotateCcw,
  Play,
  Pause,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight,
} from "lucide-react";

interface StreetPano {
  step: number;
  image: string;
  station: string;
  latLng: string;
  safety: number;
  trees: number;
  flora: number;
  water: number;
  lts: number;
  note: string;
}

const MCCLELLAN_SAMPLES: StreetPano[] = [
  {
    step: 1,
    image: "/presentation-media/street-stream/mcclellan-step-1.jpg",
    station: "Station 0+080m",
    latLng: "37.3142, -122.0655",
    safety: 80,
    trees: 30,
    flora: 66,
    water: 72,
    lts: 1,
    note: "Quiet residential corridor · Low traffic stress · Clear sightlines",
  },
  {
    step: 2,
    image: "/presentation-media/street-stream/mcclellan-step-2.jpg",
    station: "Station 0+160m",
    latLng: "37.3143, -122.0654",
    safety: 70,
    trees: 35,
    flora: 58,
    water: 72,
    lts: 2,
    note: "Center line marked · Shared bikeway sharrows · Smooth asphalt",
  },
  {
    step: 3,
    image: "/presentation-media/street-stream/mcclellan-step-3.jpg",
    station: "Station 0+240m",
    latLng: "37.3146, -122.0653",
    safety: 82,
    trees: 32,
    flora: 68,
    water: 85,
    lts: 1,
    note: "Conifer buffer & mature willows · Stevens Creek riparian proximity",
  },
  {
    step: 4,
    image: "/presentation-media/street-stream/mcclellan-step-4.jpg",
    station: "Station 0+320m",
    latLng: "37.3142, -122.0652",
    safety: 65,
    trees: 30,
    flora: 76,
    water: 72,
    lts: 2,
    note: "Slight curve · Lush hillside landscaping · Reduced vehicle speed",
  },
  {
    step: 5,
    image: "/presentation-media/street-stream/mcclellan-step-5.jpg",
    station: "Station 0+400m",
    latLng: "37.3135, -122.0651",
    safety: 72,
    trees: 40,
    flora: 76,
    water: 85,
    lts: 2,
    note: "Overhead canopy enclosure · Moderate elevation grade · Low sound floor",
  },
  {
    step: 6,
    image: "/presentation-media/street-stream/mcclellan-step-6.jpg",
    station: "Station 0+480m",
    latLng: "37.3146, -122.0651",
    safety: 75,
    trees: 35,
    flora: 78,
    water: 78,
    lts: 2,
    note: "Dense creek vegetative buffer · Quiet neighborhood street gateway",
  },
];

/* ── Animated Rolling Counter Hook ── */
function useAnimatedNumber(target: number, duration = 350) {
  const [current, setCurrent] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const startVal = prevRef.current;
    prevRef.current = target;
    if (startVal === target) {
      setCurrent(target);
      return;
    }

    let startTimestamp: number | null = null;
    let frameId: number;

    const animate = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return current;
}

export default function StreetScanner() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [committedList, setCommittedList] = useState<StreetPano[]>([MCCLELLAN_SAMPLES[0]]);
  const [isCompleted, setIsCompleted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSample = MCCLELLAN_SAMPLES[activeStep] || MCCLELLAN_SAMPLES[0];

  // Dynamic animated numbers that smoothly change as images shuffle
  const animatedSafety = useAnimatedNumber(currentSample.safety, 400);
  const animatedTrees = useAnimatedNumber(currentSample.trees, 400);
  const animatedFlora = useAnimatedNumber(currentSample.flora, 400);
  const animatedWater = useAnimatedNumber(currentSample.water, 400);

  // Autonomous Continuous Shuffling & Data Ingestion Loop
  useEffect(() => {
    if (!isPlaying) return;

    let timer: NodeJS.Timeout;

    // When the 6th image has been reached and the overall consensus evaluation is displayed,
    // dwell for 3.5s so the viewer can read the evaluation, then automatically loop back!
    if (isCompleted) {
      timer = setTimeout(() => {
        setIsCompleted(false);
        setActiveStep(0);
        setCommittedList([MCCLELLAN_SAMPLES[0]]);
      }, 3500);
      return () => clearTimeout(timer);
    }

    // Advance to next image automatically every 850ms
    timer = setTimeout(() => {
      setActiveStep((prev) => {
        const next = (prev + 1) % MCCLELLAN_SAMPLES.length;
        if (next === 0) {
          setCommittedList([MCCLELLAN_SAMPLES[0]]);
          return 0;
        }

        const nextSample = MCCLELLAN_SAMPLES[next];
        setCommittedList((list) => {
          if (list.some((s) => s.step === nextSample.step)) return list;
          return [...list, nextSample];
        });

        if (next === MCCLELLAN_SAMPLES.length - 1) {
          setIsCompleted(true);
        }
        return next;
      });
    }, 850);

    return () => clearTimeout(timer);
  }, [isPlaying, activeStep, isCompleted]);

  const handleReplay = () => {
    setIsCompleted(false);
    setActiveStep(0);
    setCommittedList([MCCLELLAN_SAMPLES[0]]);
    setIsPlaying(true);
  };

  // Aggregate Evaluation Stats across all 6 sampled points
  const avgSafety = Math.round(
    MCCLELLAN_SAMPLES.reduce((acc, s) => acc + s.safety, 0) / MCCLELLAN_SAMPLES.length
  );
  const avgFlora = Math.round(
    MCCLELLAN_SAMPLES.reduce((acc, s) => acc + s.flora, 0) / MCCLELLAN_SAMPLES.length
  );
  const avgWaterQuiet = Math.round(
    MCCLELLAN_SAMPLES.reduce((acc, s) => acc + s.water, 0) / MCCLELLAN_SAMPLES.length
  );

  return (
    <div className="bs-scanner-wrapper bs-reveal" ref={containerRef}>
      {/* Console Header Bar */}
      <div className="bs-scanner-header">
        <div className="bs-scanner-badge">
          <Scan size={14} className="bs-scanner-icon-spin" />
          <span>Automated Street Vision Ingestion</span>
        </div>
        <div className="bs-scanner-target">
          <span className="bs-scanner-street-name">McClellan Road Corridor</span>
          <span className="bs-scanner-street-meta">Sample Stream · 629 km Graph Extraction</span>
        </div>
        <div className="bs-scanner-controls">
          <button
            type="button"
            className="bs-scanner-btn"
            onClick={handleReplay}
            title="Replay vision analysis"
          >
            <RotateCcw size={13} />
            <span>Re-Scan Street</span>
          </button>
          <button
            type="button"
            className="bs-scanner-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause shuffle" : "Resume shuffle"}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>
        </div>
      </div>

      {/* 3-Column Interactive Ingestion Grid */}
      <div className="bs-scanner-grid">
        {/* COLUMN 1: Rapid Card-Shuffle Streetview Window */}
        <div className="bs-scanner-photo-col">
          <div className="bs-scanner-frame">
            {/* Visual Card Stack in Background */}
            <div className="bs-scanner-deck-shadow bs-deck-2" />
            <div className="bs-scanner-deck-shadow bs-deck-1" />

            {/* Active Photograph with Laser Scan Effect */}
            <div className="bs-scanner-active-photo">
              <img
                src={currentSample.image}
                alt={`McClellan Road ${currentSample.station}`}
                className="bs-scanner-img"
              />

              {/* Sci-Fi HUD Crosshairs & Grid */}
              <div className="bs-scanner-reticle">
                <div className="bs-scanner-corner bs-corner-tl" />
                <div className="bs-scanner-corner bs-corner-tr" />
                <div className="bs-scanner-corner bs-corner-bl" />
                <div className="bs-scanner-corner bs-corner-br" />
                {isPlaying && <div className="bs-scanner-laser-line" />}
              </div>

              {/* Floating Vision Tags on Image */}
              <div className="bs-scanner-tag-top">
                <span className="bs-scanner-tag-pill">
                  {isPlaying ? "CV: ANALYZING PANO" : "FRAME LOCKED"} [{activeStep + 1}/6]
                </span>
                <span className="bs-scanner-tag-station">{currentSample.station}</span>
              </div>

              <div className="bs-scanner-tag-bottom">
                <span className="bs-scanner-tag-coords">GPS: {currentSample.latLng}</span>
                <span className="bs-scanner-tag-lts">LTS {currentSample.lts} EXPOSURE</span>
              </div>
            </div>

            {/* Sample Selector Thumbnails */}
            <div className="bs-scanner-thumbs">
              {MCCLELLAN_SAMPLES.map((sample, idx) => (
                <button
                  key={sample.step}
                  type="button"
                  className={`bs-scanner-thumb ${activeStep === idx ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveStep(idx);
                    setIsCompleted(idx === MCCLELLAN_SAMPLES.length - 1);
                    setCommittedList(MCCLELLAN_SAMPLES.slice(0, idx + 1));
                  }}
                  title={`Jump to ${sample.station}`}
                >
                  <img src={sample.image} alt="" />
                  <span className="bs-thumb-num">0{idx + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* COLUMN 2: Live Perception Telemetry (% Sliders) */}
        <div className="bs-scanner-telemetry-col">
          <div className="bs-telemetry-box">
            <div className="bs-telemetry-title">
              <Cpu size={15} style={{ color: "var(--bs-cyan)" }} />
              <span>Street Vision Metrics · Real-Time Output</span>
            </div>

            <div className="bs-metric-sliders">
              {/* 1. Safety Score */}
              <div className="bs-metric-item">
                <div className="bs-metric-header">
                  <span className="bs-metric-label">
                    <ShieldCheck size={14} style={{ color: "var(--bs-cyan)" }} />
                    Safety & Low Stress
                  </span>
                  <span className="bs-metric-val bs-val-cyan">{animatedSafety}%</span>
                </div>
                <div className="bs-slider-track">
                  <div
                    className="bs-slider-fill bs-fill-cyan"
                    style={{ width: `${animatedSafety}%` }}
                  />
                  <div
                    className="bs-slider-thumb bs-thumb-cyan"
                    style={{ left: `${animatedSafety}%` }}
                  />
                </div>
                <span className="bs-metric-sub">
                  Stress Threshold: LTS {currentSample.lts} · Shared Roadway Buffer
                </span>
              </div>

              {/* 2. Tree Canopy & Overhead Shade */}
              <div className="bs-metric-item">
                <div className="bs-metric-header">
                  <span className="bs-metric-label">
                    <TreePine size={14} style={{ color: "var(--bs-emerald)" }} />
                    Tree Canopy Shade
                  </span>
                  <span className="bs-metric-val bs-val-emerald">{animatedTrees}%</span>
                </div>
                <div className="bs-slider-track">
                  <div
                    className="bs-slider-fill bs-fill-emerald"
                    style={{ width: `${animatedTrees * 2}%` }}
                  />
                  <div
                    className="bs-slider-thumb bs-thumb-emerald"
                    style={{ left: `${animatedTrees * 2}%` }}
                  />
                </div>
                <span className="bs-metric-sub">
                  Sky Obscuration Ratio: {currentSample.trees}% foliage cover
                </span>
              </div>

              {/* 3. Living Flora & Greenery */}
              <div className="bs-metric-item">
                <div className="bs-metric-header">
                  <span className="bs-metric-label">
                    <Flower2 size={14} style={{ color: "#2e4a22" }} />
                    Living Plants & Flora
                  </span>
                  <span className="bs-metric-val bs-val-lime">{animatedFlora}%</span>
                </div>
                <div className="bs-slider-track">
                  <div
                    className="bs-slider-fill bs-fill-lime"
                    style={{ width: `${animatedFlora}%` }}
                  />
                  <div
                    className="bs-slider-thumb bs-thumb-lime"
                    style={{ left: `${animatedFlora}%` }}
                  />
                </div>
                <span className="bs-metric-sub">Ground vegetation, verges & shrubs</span>
              </div>

              {/* 4. Ambient Acoustic & Water Proximity */}
              <div className="bs-metric-item">
                <div className="bs-metric-header">
                  <span className="bs-metric-label">
                    <Waves size={14} style={{ color: "#2c5f8e" }} />
                    Quietness & Creek Water
                  </span>
                  <span className="bs-metric-val bs-val-blue">{animatedWater}%</span>
                </div>
                <div className="bs-slider-track">
                  <div
                    className="bs-slider-fill bs-fill-blue"
                    style={{ width: `${animatedWater}%` }}
                  />
                  <div
                    className="bs-slider-thumb bs-thumb-blue"
                    style={{ left: `${animatedWater}%` }}
                  />
                </div>
                <span className="bs-metric-sub">Stevens Creek buffer · Quiet sound floor</span>
              </div>
            </div>

            {/* Live Observation Micro-Log */}
            <div className="bs-metric-note">
              <span className="bs-note-indicator" />
              <p>
                <strong>AI Vision Note:</strong> {currentSample.note}
              </p>
            </div>
          </div>
        </div>

        {/* COLUMN 3: Ingesting into Routing Database */}
        <div className="bs-scanner-db-col">
          <div className="bs-db-box">
            <div className="bs-db-header">
              <div className="bs-db-status">
                <Database size={15} style={{ color: "var(--bs-cyan)" }} />
                <span>Edge Database Store</span>
              </div>
              <span className="bs-db-commit-count">
                {committedList.length}/6 COMMITTED
              </span>
            </div>

            {/* Matrix Data Stream Rows */}
            <div className="bs-db-rows-stream">
              <div className="bs-db-table-head">
                <span>Station</span>
                <span>Safety</span>
                <span>Tree</span>
                <span>Flora</span>
                <span>Status</span>
              </div>

              <div className="bs-db-table-body">
                {committedList.map((sample) => (
                  <div
                    key={sample.step}
                    className={`bs-db-row ${activeStep + 1 === sample.step ? "is-current" : ""}`}
                  >
                    <span className="bs-db-cell-st">P0{sample.step}</span>
                    <span className="bs-db-cell-val" style={{ color: "var(--bs-cyan)" }}>
                      {sample.safety}%
                    </span>
                    <span className="bs-db-cell-val" style={{ color: "var(--bs-emerald)" }}>
                      {sample.trees}%
                    </span>
                    <span className="bs-db-cell-val" style={{ color: "#2e4a22" }}>
                      {sample.flora}%
                    </span>
                    <span className="bs-db-cell-commit">
                      <CheckCircle2 size={11} style={{ color: "var(--bs-emerald)" }} />
                      <span>STORED</span>
                    </span>
                  </div>
                ))}

                {committedList.length < 6 && (
                  <div className="bs-db-row bs-row-pending">
                    <span className="bs-db-cell-st">P0{committedList.length + 1}</span>
                    <span className="bs-db-cell-val" style={{ opacity: 0.3 }}>--</span>
                    <span className="bs-db-cell-val" style={{ opacity: 0.3 }}>--</span>
                    <span className="bs-db-cell-val" style={{ opacity: 0.3 }}>--</span>
                    <span className="bs-db-cell-commit" style={{ color: "var(--bs-text-muted)" }}>
                      <span className="bs-pulse-dot" /> STREAMING
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Offline Graph Baking Notice */}
            <div className="bs-db-baking-note">
              <Layers size={13} style={{ color: "var(--bs-emerald)", flexShrink: 0 }} />
              <span>Bakes into Cupertino graph at 0 live API calls during rider route queries.</span>
            </div>
          </div>
        </div>
      </div>

      {/* OVERALL EVALUATION BANNER (Appears once all images are processed) */}
      <div className={`bs-evaluation-banner ${isCompleted ? "is-visible" : ""}`}>
        <div className="bs-eval-badge">
          <CheckCircle2 size={16} style={{ color: "var(--bs-emerald)" }} />
          <span>Street Evaluation Complete · Consensus Rating</span>
        </div>

        <div className="bs-eval-content">
          <div className="bs-eval-main">
            <h3>McClellan Road · Segment Synthesis</h3>
            <p>
              Calculated by pooling 6 Street View vision passes across 480 meters. Safe commuter
              priority with tranquil shaded foliage.
            </p>
          </div>

          <div className="bs-eval-metrics-grid">
            <div className="bs-eval-score-card">
              <span className="bs-eval-metric-name">Average Safety</span>
              <strong className="bs-eval-score bs-val-cyan">{avgSafety}%</strong>
              <small>LTS 1.4 · Low Stress</small>
            </div>

            <div className="bs-eval-score-card">
              <span className="bs-eval-metric-name">Green & Shade</span>
              <strong className="bs-eval-score bs-val-emerald">{avgFlora}%</strong>
              <small>Riparian Creek Buffer</small>
            </div>

            <div className="bs-eval-score-card">
              <span className="bs-eval-metric-name">Quietness Factor</span>
              <strong className="bs-eval-score bs-val-blue">{avgWaterQuiet}%</strong>
              <small>Acoustic Comfort</small>
            </div>

            <div className="bs-eval-score-card bs-card-dijkstra">
              <span className="bs-eval-metric-name">Dijkstra Cost Weight</span>
              <strong className="bs-eval-score" style={{ color: "#2e4a22" }}>
                1.14×
              </strong>
              <small>Recommended Route</small>
            </div>
          </div>
        </div>

        <div className="bs-eval-footer">
          <span className="bs-eval-tag">
            [EDGE ID: #8514-MCCLELLAN-SEG1] · COMMITTED TO OFFLINE DIJKSTRA GRAPH
          </span>
          <button type="button" className="bs-eval-replay-link" onClick={handleReplay}>
            Run Analysis Again <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
