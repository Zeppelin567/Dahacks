import React from "react";
import { Cpu } from "lucide-react";

export function PathfindingDecisionDiagram() {
  return (
    <div className="bs-pathfinding-section">
      {/* Main Unified Visual Decision Diagram */}
      <div className="bs-diagram-card bs-reveal">
        <div className="bs-diagram-header">
          <div className="bs-diagram-header-left">
            <Cpu size={17} style={{ color: "var(--bs-cyan)" }} />
            <span className="bs-diagram-header-title">
              Dijkstra Multi-Branch Evaluation · Cupertino Graph (8,514 Junctions)
            </span>
          </div>
          <div className="bs-diagram-badge">
            <span className="bs-badge-dot" />
            <span>
              All 3 Routing Paradigms Evaluated Concurrently
            </span>
          </div>
        </div>

        {/* SVG Network Visualizer */}
        <div className="bs-svg-wrapper">
          <svg
            viewBox="0 0 1060 410"
            className="bs-routing-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Gradients */}
              <linearGradient id="gradDanger" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d9653b" stopOpacity="0.85" />
                <stop offset="50%" stopColor="#d9653b" stopOpacity="1" />
                <stop offset="100%" stopColor="#d9653b" stopOpacity="0.85" />
              </linearGradient>

              <linearGradient id="gradSafe" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2c5f8e" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#2c5f8e" stopOpacity="1" />
                <stop offset="100%" stopColor="#2c5f8e" stopOpacity="0.9" />
              </linearGradient>

              <linearGradient id="gradNature" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3f7d2a" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#3f7d2a" stopOpacity="1" />
                <stop offset="100%" stopColor="#3f7d2a" stopOpacity="0.9" />
              </linearGradient>

              {/* Glowing Filters */}
              <filter id="glowCyan" filterUnits="userSpaceOnUse" x="0" y="0" width="1060" height="410">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glowEmerald" filterUnits="userSpaceOnUse" x="0" y="0" width="1060" height="410">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glowRed" filterUnits="userSpaceOnUse" x="0" y="0" width="1060" height="410">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.75" />
              </filter>
            </defs>

            {/* Subtle Grid Background */}
            <pattern id="diagramGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(29, 43, 58, 0.04)"
                strokeWidth="1"
              />
            </pattern>
            <rect width="1060" height="410" fill="url(#diagramGrid)" />

            {/* Path 1: Lawrence Expressway (Top Branch - Google Maps Recommendation) */}
            <path
              d="M 160 205 C 280 205, 340 75, 530 75 C 720 75, 780 205, 900 205"
              fill="none"
              stroke="rgba(217, 101, 59, 0.3)"
              strokeWidth="11"
            />
            <path
              d="M 160 205 C 280 205, 340 75, 530 75 C 720 75, 780 205, 900 205"
              fill="none"
              stroke="#d9653b"
              strokeWidth="4.5"
              strokeDasharray="8 6"
              className="bs-anim-pulse-red"
            />

            {/* Path 2: McClellan Protected Lane (Middle Branch - BikeScape Fast Mode Recommendation) */}
            <path
              d="M 160 205 L 900 205"
              fill="none"
              stroke="rgba(44, 95, 142, 0.35)"
              strokeWidth="12"
            />
            <path
              d="M 160 205 L 900 205"
              fill="none"
              stroke="#2c5f8e"
              strokeWidth="5"
              strokeDasharray="8 6"
              className="bs-anim-pulse-cyan"
            />

            {/* Path 3: Stevens Creek Nature Trail (Bottom Branch - BikeScape Nature Mode Recommendation) */}
            <path
              d="M 160 205 C 280 205, 340 335, 530 335 C 720 335, 780 205, 900 205"
              fill="none"
              stroke="rgba(63, 125, 42, 0.3)"
              strokeWidth="11"
            />
            <path
              d="M 160 205 C 280 205, 340 335, 530 335 C 720 335, 780 205, 900 205"
              fill="none"
              stroke="#3f7d2a"
              strokeWidth="4.5"
              strokeDasharray="8 6"
              className="bs-anim-pulse-emerald"
            />

            {/* Callout Card 1: Google Maps Recommendation on Lawrence Expressway */}
            <g transform="translate(530, 75)" filter="url(#dropShadow)">
              <rect
                x="-245"
                y="-36"
                width="490"
                height="72"
                rx="10"
                fill="rgba(255, 255, 255, 0.94)"
                stroke="rgba(217, 101, 59, 0.75)"
                strokeWidth="1.5"
              />
              {/* Badge Pill */}
              <rect
                x="-230"
                y="-27"
                width="195"
                height="18"
                rx="4"
                fill="rgba(217, 101, 59, 0.22)"
                stroke="rgba(217, 101, 59, 0.55)"
              />
              <text
                x="-132"
                y="-15"
                textAnchor="middle"
                fill="#d9653b"
                fontSize="9"
                fontWeight="800"
                letterSpacing="0.06em"
                fontFamily="monospace"
              >
                GOOGLE MAPS RECOMMENDATION
              </text>
              <text
                x="-230"
                y="8"
                fill="#1d2b3a"
                fontSize="13"
                fontWeight="700"
              >
                1. Lawrence Expressway · 4.2 km
              </text>
              <text
                x="230"
                y="8"
                textAnchor="end"
                fill="#d9653b"
                fontSize="10.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                SHORTEST DISTANCE
              </text>
              <text
                x="-230"
                y="25"
                fill="#d9653b"
                fontSize="10"
                fontFamily="monospace"
              >
                LTS 4 Extreme Stress · 50 mph Traffic · Disqualified by BikeScape
              </text>
            </g>

            {/* Callout Card 2: BikeScape Fast Mode Recommendation on McClellan */}
            <g transform="translate(530, 205)" filter="url(#dropShadow)">
              <rect
                x="-250"
                y="-36"
                width="500"
                height="72"
                rx="10"
                fill="rgba(255, 255, 255, 0.94)"
                stroke="rgba(44, 95, 142, 0.85)"
                strokeWidth="1.8"
              />
              {/* Badge Pill */}
              <rect
                x="-235"
                y="-27"
                width="240"
                height="18"
                rx="4"
                fill="rgba(44, 95, 142, 0.22)"
                stroke="rgba(44, 95, 142, 0.65)"
              />
              <text
                x="-115"
                y="-15"
                textAnchor="middle"
                fill="#2c5f8e"
                fontSize="9"
                fontWeight="800"
                letterSpacing="0.06em"
                fontFamily="monospace"
              >
                BIKESCAPE FAST MODE RECOMMENDATION
              </text>
              <text
                x="-235"
                y="8"
                fill="#1d2b3a"
                fontSize="13"
                fontWeight="700"
              >
                2. McClellan Protected Bikeway · 4.7 km
              </text>
              <text
                x="235"
                y="8"
                textAnchor="end"
                fill="#2c5f8e"
                fontSize="10.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                +500M (+11% DETOUR)
              </text>
              <text
                x="-235"
                y="25"
                fill="#2c5f8e"
                fontSize="10"
                fontFamily="monospace"
              >
                Class IV Protected Buffer · 94% Safety Score · Low Stress Commuter
              </text>
            </g>

            {/* Callout Card 3: BikeScape Nature Mode Recommendation on Stevens Creek */}
            <g transform="translate(530, 335)" filter="url(#dropShadow)">
              <rect
                x="-250"
                y="-36"
                width="500"
                height="72"
                rx="10"
                fill="rgba(255, 255, 255, 0.94)"
                stroke="rgba(63, 125, 42, 0.85)"
                strokeWidth="1.8"
              />
              {/* Badge Pill */}
              <rect
                x="-235"
                y="-27"
                width="255"
                height="18"
                rx="4"
                fill="rgba(63, 125, 42, 0.22)"
                stroke="rgba(63, 125, 42, 0.65)"
              />
              <text
                x="-107"
                y="-15"
                textAnchor="middle"
                fill="#3f7d2a"
                fontSize="9"
                fontWeight="800"
                letterSpacing="0.06em"
                fontFamily="monospace"
              >
                BIKESCAPE NATURE MODE RECOMMENDATION
              </text>
              <text
                x="-235"
                y="8"
                fill="#1d2b3a"
                fontSize="13"
                fontWeight="700"
              >
                3. Stevens Creek Trail &amp; Canopy · 5.1 km
              </text>
              <text
                x="235"
                y="8"
                textAnchor="end"
                fill="#3f7d2a"
                fontSize="10.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                +900M (&lt;1.5× CAP)
              </text>
              <text
                x="-235"
                y="25"
                fill="#3f7d2a"
                fontSize="10"
                fontFamily="monospace"
              >
                Car-Free Riparian Greenway · 88% Tree Shade · Maximum Tranquility
              </text>
            </g>

            {/* Origin Node A */}
            <g transform="translate(130, 205)">
              <circle r="34" fill="rgba(44, 95, 142, 0.1)" stroke="var(--bs-cyan)" strokeWidth="2" />
              <circle r="8" fill="var(--bs-cyan)" />
              <text x="0" y="-44" textAnchor="middle" fill="#1d2b3a" fontSize="13" fontWeight="800">
                [NODE A] START
              </text>
              <text x="0" y="52" textAnchor="middle" fill="#4b5a6a" fontSize="11" fontFamily="monospace">
                4199 Hamilton Ave
              </text>
            </g>

            {/* Destination Node B */}
            <g transform="translate(930, 205)">
              <circle r="34" fill="rgba(63, 125, 42, 0.1)" stroke="var(--bs-emerald)" strokeWidth="2" />
              <circle r="8" fill="var(--bs-emerald)" />
              <text x="0" y="-44" textAnchor="middle" fill="#1d2b3a" fontSize="13" fontWeight="800">
                [NODE B] END
              </text>
              <text x="0" y="52" textAnchor="middle" fill="#4b5a6a" fontSize="11" fontFamily="monospace">
                De Anza College
              </text>
            </g>
          </svg>
        </div>

        {/* Compact 3-Column Comparative Logic Strip */}
        <div className="bs-path-strip-grid">
          <div className="bs-path-strip-col is-google">
            <div className="bs-path-strip-top">
              <span className="bs-strip-dot bs-dot-red" />
              <span className="bs-strip-title">Google Maps Logic</span>
              <span className="bs-strip-stat">4.2 km (Shortest)</span>
            </div>
            <p className="bs-strip-desc">
              Minimizes raw mileage only. Directs cyclists into lethal 50 mph stroads with zero bike infrastructure.
            </p>
          </div>

          <div className="bs-path-strip-col is-safe">
            <div className="bs-path-strip-top">
              <span className="bs-strip-dot bs-dot-cyan" />
              <span className="bs-strip-title">BikeScape Fast &amp; Safe (λ = 3.0)</span>
              <span className="bs-strip-stat">4.7 km (+500m)</span>
            </div>
            <p className="bs-strip-desc">
              Multi-angle Vision AI scores traffic stress (s = 0.94). Adds +500m detour to route 100% on Class IV protected lanes.
            </p>
          </div>

          <div className="bs-path-strip-col is-nature">
            <div className="bs-path-strip-top">
              <span className="bs-strip-dot bs-dot-emerald" />
              <span className="bs-strip-title">BikeScape Nature Mode (α = 5.0)</span>
              <span className="bs-strip-stat">5.1 km (+900m)</span>
            </div>
            <p className="bs-strip-desc">
              Maximizes tree canopy (88%) and creek paths. Soft-capped at 1.5× shortest physical distance for practical journeys.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
