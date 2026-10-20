import React from "react";

/**
 * Neon City Wireframe SVG Component
 * Renders glowing wireframe skyscrapers, perspective grid streets,
 * architectural truss cross-bracing, antenna beacons, and cyber HUD labels.
 */
export function CityWireframe() {
  return (
    <svg
      className="bs-wireframe-svg bs-city-wireframe"
      viewBox="0 0 800 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id="neon-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur1" />
          <feGaussianBlur stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="cyan-fade-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c5f8e" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#2c5f8e" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2c5f8e" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="cyan-beam-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c5f8e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2c5f8e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Receding Perspective Street Grid */}
      <g stroke="#2c5f8e" strokeWidth="0.8" opacity="0.35">
        {/* Horizon line */}
        <line x1="0" y1="480" x2="800" y2="480" strokeDasharray="4 6" />
        
        {/* Perspective rays radiating from central vanishing point */}
        <line x1="380" y1="480" x2="-100" y2="720" />
        <line x1="380" y1="480" x2="60" y2="720" />
        <line x1="380" y1="480" x2="200" y2="720" />
        <line x1="380" y1="480" x2="330" y2="720" />
        <line x1="380" y1="480" x2="450" y2="720" />
        <line x1="380" y1="480" x2="580" y2="720" />
        <line x1="380" y1="480" x2="720" y2="720" />
        <line x1="380" y1="480" x2="880" y2="720" />

        {/* Receding cross-grid rungs */}
        <line x1="0" y1="500" x2="800" y2="500" />
        <line x1="0" y1="530" x2="800" y2="530" />
        <line x1="0" y1="570" x2="800" y2="570" />
        <line x1="0" y1="620" x2="800" y2="620" />
        <line x1="0" y1="680" x2="800" y2="680" />
      </g>

      {/* Animated Traffic Vector Pulse */}
      <g stroke="#2c5f8e" strokeWidth="1.5" opacity="0.65">
        <line
          x1="200"
          y1="720"
          x2="380"
          y2="480"
          strokeDasharray="16 24"
          className="bs-wireframe-dash-anim"
        />
        <line
          x1="60"
          y1="720"
          x2="380"
          y2="480"
          strokeDasharray="12 28"
          className="bs-wireframe-dash-anim-rev"
        />
      </g>

      {/* ========================================================
          SKYSCRAPER 1: Far Left Spire Skyscraper (Tower A)
          ======================================================== */}
      <g stroke="url(#cyan-fade-down)" strokeWidth="1.2" fill="none" filter="url(#neon-cyan-glow)">
        {/* Main Shaft Outline */}
        <polygon points="50,680 50,260 170,260 170,680" />
        
        {/* Upper Setback */}
        <polygon points="65,260 65,160 155,160 155,260" />
        
        {/* Pyramid Crown */}
        <polygon points="65,160 110,90 155,160" />

        {/* Antenna Spire & Beacon */}
        <line x1="110" y1="90" x2="110" y2="35" stroke="#2c5f8e" strokeWidth="1.6" />
        <circle cx="110" cy="35" r="3.5" fill="#2c5f8e" className="bs-beacon-pulse" />
        <circle cx="110" cy="35" r="8" stroke="#2c5f8e" strokeWidth="0.8" opacity="0.5" className="bs-beacon-ring" />
      </g>

      {/* Tower A Interior Wireframe Floors & Cross-Trusses */}
      <g stroke="#2c5f8e" strokeWidth="0.75" opacity="0.45" fill="none">
        {/* Setback floors */}
        <line x1="65" y1="230" x2="155" y2="230" />
        <line x1="65" y1="200" x2="155" y2="200" />
        <line x1="65" y1="180" x2="155" y2="180" />

        {/* Main shaft floor slabs */}
        <line x1="50" y1="300" x2="170" y2="300" />
        <line x1="50" y1="340" x2="170" y2="340" />
        <line x1="50" y1="380" x2="170" y2="380" />
        <line x1="50" y1="420" x2="170" y2="420" />
        <line x1="50" y1="460" x2="170" y2="460" />
        <line x1="50" y1="500" x2="170" y2="500" />
        <line x1="50" y1="540" x2="170" y2="540" />
        <line x1="50" y1="580" x2="170" y2="580" />
        <line x1="50" y1="620" x2="170" y2="620" />
        <line x1="50" y1="660" x2="170" y2="660" />

        {/* Structural X-Bracing on Tiers */}
        <line x1="50" y1="260" x2="170" y2="380" />
        <line x1="170" y1="260" x2="50" y2="380" />
        <line x1="50" y1="380" x2="170" y2="500" />
        <line x1="170" y1="380" x2="50" y2="500" />
        <line x1="50" y1="500" x2="170" y2="620" />
        <line x1="170" y1="500" x2="50" y2="620" />

        {/* Vertical Center Spine */}
        <line x1="110" y1="160" x2="110" y2="680" strokeDasharray="3 3" />
      </g>

      {/* ========================================================
          SKYSCRAPER 2: Center-Left Tall Corporate Tower (Tower B)
          ======================================================== */}
      <g stroke="url(#cyan-fade-down)" strokeWidth="1.4" fill="none" filter="url(#neon-cyan-glow)">
        {/* Main Tower Silhouette with 3D Isometric Facets */}
        <polygon points="195,680 195,150 295,100 340,140 340,680" />
        <line x1="295" y1="100" x2="295" y2="680" stroke="#2c5f8e" strokeWidth="1.2" />

        {/* Dual Antenna Mast */}
        <line x1="240" y1="125" x2="240" y2="60" stroke="#2c5f8e" strokeWidth="1.2" />
        <circle cx="240" cy="60" r="2.5" fill="#2c5f8e" />
        <line x1="315" y1="120" x2="315" y2="40" stroke="#2c5f8e" strokeWidth="1.5" />
        <circle cx="315" cy="40" r="3" fill="#2c5f8e" className="bs-beacon-pulse" />
      </g>

      {/* Tower B High-Density Wireframe Window Matrix */}
      <g stroke="#2c5f8e" strokeWidth="0.7" opacity="0.4" fill="none">
        {/* Front Facet Horizontal Floor Plates */}
        {[140, 175, 210, 245, 280, 315, 350, 385, 420, 455, 490, 525, 560, 595, 630, 665].map((y) => (
          <React.Fragment key={y}>
            <line x1="195" y1={y} x2="295" y2={y - 20} />
            <line x1="295" y1={y - 20} x2="340" y2={y - 5} />
          </React.Fragment>
        ))}

        {/* Vertical Mullion Guides */}
        <line x1="220" y1="138" x2="220" y2="680" />
        <line x1="245" y1="125" x2="245" y2="680" />
        <line x1="270" y1="112" x2="270" y2="680" />
        <line x1="318" y1="120" x2="318" y2="680" />
      </g>

      {/* ========================================================
          SKYSCRAPER 3: Angled Faceted Crystalline Tower (Tower C)
          ======================================================== */}
      <g stroke="url(#cyan-fade-down)" strokeWidth="1.3" fill="none" filter="url(#neon-cyan-glow)">
        {/* Angled Modern Crystalline Prism */}
        <polygon points="365,680 365,220 440,160 515,230 515,680" />
        
        {/* Angular Fold Ridge */}
        <line x1="440" y1="160" x2="440" y2="680" stroke="#2c5f8e" strokeWidth="1.2" />

        {/* Angled Roof Slices */}
        <line x1="365" y1="220" x2="440" y2="280" />
        <line x1="515" y1="230" x2="440" y2="280" />
      </g>

      {/* Tower C Faceted Wireframe Diagonals */}
      <g stroke="#2c5f8e" strokeWidth="0.8" opacity="0.38" fill="none">
        {[220, 270, 320, 370, 420, 470, 520, 570, 620].map((y) => (
          <React.Fragment key={y}>
            <line x1="365" y1={y} x2="440" y2={y - 25} />
            <line x1="440" y1={y - 25} x2="515" y2={y} />
            <line x1="365" y1={y} x2="440" y2={y + 25} strokeDasharray="2 3" opacity="0.6" />
          </React.Fragment>
        ))}
      </g>

      {/* ========================================================
          SKYSCRAPER 4: Mid-Ground Tech High-Rise (Tower D)
          ======================================================== */}
      <g stroke="#2c5f8e" strokeWidth="1.1" fill="none" opacity="0.75" filter="url(#neon-cyan-glow)">
        <polygon points="535,680 535,320 625,320 625,680" />
        <polygon points="550,320 550,270 610,270 610,320" />
        <line x1="580" y1="270" x2="580" y2="220" strokeWidth="1.4" />
        <circle cx="580" cy="220" r="2.5" fill="#2c5f8e" />
      </g>
      <g stroke="#2c5f8e" strokeWidth="0.65" opacity="0.35" fill="none">
        {[350, 385, 420, 455, 490, 525, 560, 595, 630, 665].map((y) => (
          <line key={y} x1="535" y1={y} x2="625" y2={y} />
        ))}
        <line x1="565" y1="320" x2="565" y2="680" />
        <line x1="595" y1="320" x2="595" y2="680" />
      </g>

      {/* Far Right Stepped Silhouette */}
      <g stroke="#2c5f8e" strokeWidth="0.9" fill="none" opacity="0.5">
        <polyline points="645,680 645,410 705,410 705,370 760,370 760,680" />
        {[440, 480, 520, 560, 600, 640].map((y) => (
          <line key={y} x1="645" y1={y} x2="760" y2={y} strokeDasharray="3 4" opacity="0.4" />
        ))}
      </g>

      {/* ========================================================
          CYBER HUD TELEMETRY LABELS & COORDINATE BRACKETS
          ======================================================== */}
      <g fontFamily="var(--bs-font-mono, monospace)" fontSize="9" fill="#2c5f8e" letterSpacing="0.1em">
        {/* HUD Target Brackets */}
        <g opacity="0.6" stroke="#2c5f8e" strokeWidth="1" fill="none">
          <path d="M 40,70 L 30,70 L 30,80" />
          <path d="M 180,70 L 190,70 L 190,80" />
          <path d="M 40,130 L 30,130 L 30,120" />
          <path d="M 180,130 L 190,130 L 190,120" />
        </g>
        <text x="42" y="88" opacity="0.85" fontWeight="bold">ZONE 01: URBAN CORE</text>
        <text x="42" y="103" opacity="0.55">37.3382° N, 122.0460° W</text>
        <text x="42" y="118" opacity="0.55">LTS-4 DENSITY INDEX</text>

        {/* Commute Corridor Annotation */}
        <g opacity="0.5">
          <line x1="335" y1="80" x2="390" y2="50" stroke="#2c5f8e" strokeWidth="0.8" />
          <line x1="390" y1="50" x2="480" y2="50" stroke="#2c5f8e" strokeWidth="0.8" />
          <text x="395" y="44">COMMUTE SECTOR // 50 MPH</text>
        </g>
      </g>
    </svg>
  );
}

/**
 * Neon Nature Wireframe SVG Component
 * Renders glowing wireframe topographic contour elevation curves,
 * 3D triangulated terrain hill meshes (TIN), low-poly geometric wireframe pine trees,
 * botanical fern leaf ribs, and green reserve HUD telemetry.
 */
export function NatureWireframe() {
  return (
    <svg
      className="bs-wireframe-svg bs-nature-wireframe"
      viewBox="0 0 800 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id="neon-emerald-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur1" />
          <feGaussianBlur stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="emerald-fade-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f7d2a" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#3f7d2a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3f7d2a" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* ========================================================
          TOPOGRAPHIC CONTOUR ELEVATION LINES (Undulating Landscape)
          ======================================================== */}
      <g fill="none" stroke="#3f7d2a" strokeWidth="1" opacity="0.45">
        {/* Ridge Contours */}
        <path d="M 0,220 C 180,180 320,260 520,200 C 640,160 740,220 800,210" strokeWidth="1.2" />
        <path d="M 0,265 C 160,230 300,310 490,250 C 610,210 720,270 800,255" />
        <path d="M 0,315 C 140,280 280,360 460,300 C 580,260 700,320 800,305" strokeDasharray="5 5" opacity="0.35" />
        <path d="M 0,370 C 170,340 310,410 480,350 C 610,310 710,370 800,360" strokeWidth="1.3" />
        <path d="M 0,430 C 150,390 290,465 470,410 C 600,370 700,430 800,420" />
        <path d="M 0,490 C 160,455 300,525 480,470 C 610,430 710,490 800,480" strokeDasharray="6 4" opacity="0.3" />
        <path d="M 0,555 C 170,520 310,590 490,535 C 620,495 720,555 800,545" strokeWidth="1.2" />
        <path d="M 0,625 C 180,590 320,655 510,600 C 640,560 730,620 800,610" />
      </g>

      {/* ========================================================
          TRIANGULATED TERRAIN MESH (Rolling Foothills & Creek Bed)
          ======================================================== */}
      <g stroke="#3f7d2a" strokeWidth="0.75" fill="none" opacity="0.32">
        {/* Foothill Slope Wireframe Triangles */}
        <polygon points="120,480 220,430 190,520" />
        <polygon points="220,430 320,470 190,520" />
        <polygon points="190,520 320,470 280,560" />
        <polygon points="220,430 360,400 320,470" />
        <polygon points="360,400 480,440 320,470" />
        <polygon points="320,470 480,440 430,530" />
        <polygon points="430,530 480,440 590,470" />
        <polygon points="430,530 590,470 540,560" />
        <polygon points="590,470 700,420 660,520" />
        <polygon points="540,560 590,470 660,520" />
        <polygon points="540,560 660,520 620,610" />
        <polygon points="430,530 540,560 480,630" />
        <polygon points="280,560 430,530 380,620" />
        <polygon points="280,560 380,620 240,640" />

        {/* Glowing Terrain Mesh Vertices */}
        {[
          [220, 430], [360, 400], [480, 440], [590, 470], [700, 420],
          [190, 520], [320, 470], [430, 530], [540, 560], [660, 520],
          [280, 560], [380, 620], [480, 630], [620, 610],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="#3f7d2a" opacity="0.6" />
        ))}
      </g>

      {/* ========================================================
          GEOMETRIC 3D LOW-POLY WIREFRAME PINE TREES
          ======================================================== */}
      {/* Tree 1: Prominent Large Foreground Pine (Center-Right) */}
      <g stroke="url(#emerald-fade-down)" strokeWidth="1.3" fill="none" filter="url(#neon-emerald-glow)">
        {/* Tier 1 (Apex) */}
        <polygon points="470,180 435,270 505,270" />
        <line x1="470" y1="180" x2="470" y2="270" strokeWidth="1" />
        
        {/* Tier 2 */}
        <polygon points="470,240 410,360 530,360" />
        <line x1="470" y1="240" x2="470" y2="360" strokeWidth="1" />

        {/* Tier 3 */}
        <polygon points="470,330 380,465 560,465" />
        <line x1="470" y1="330" x2="470" y2="465" strokeWidth="1" />

        {/* Tier 4 (Base Canopy) */}
        <polygon points="470,430 350,580 590,580" />
        <line x1="470" y1="430" x2="470" y2="580" strokeWidth="1" />

        {/* Tree Trunk */}
        <polygon points="455,580 455,670 485,670 485,580" strokeWidth="1.2" />

        {/* Apex Glowing Spore */}
        <circle cx="470" cy="180" r="3.5" fill="#3f7d2a" className="bs-beacon-pulse" />
      </g>

      {/* Tree 1 Faceted Wireframe Cross-Edges */}
      <g stroke="#3f7d2a" strokeWidth="0.8" opacity="0.5" fill="none">
        <line x1="470" y1="180" x2="470" y2="270" />
        <line x1="435" y1="270" x2="470" y2="240" />
        <line x1="505" y1="270" x2="470" y2="240" />

        <line x1="410" y1="360" x2="470" y2="330" />
        <line x1="530" y1="360" x2="470" y2="330" />

        <line x1="380" y1="465" x2="470" y2="430" />
        <line x1="560" y1="465" x2="470" y2="430" />

        <line x1="350" y1="580" x2="470" y2="580" />
        <line x1="590" y1="580" x2="470" y2="580" />

        {/* Triangular Facets on Tier 4 */}
        <line x1="410" y1="580" x2="470" y2="430" />
        <line x1="530" y1="580" x2="470" y2="430" />
      </g>

      {/* Tree 2: Midsize Pine (Center-Left near divider) */}
      <g stroke="url(#emerald-fade-down)" strokeWidth="1.2" fill="none" filter="url(#neon-emerald-glow)">
        <polygon points="210,270 180,350 240,350" />
        <polygon points="210,325 160,430 260,430" />
        <polygon points="210,400 135,530 285,530" />
        <polygon points="198,530 198,620 222,620 222,530" />
        <circle cx="210" cy="270" r="2.5" fill="#3f7d2a" />
      </g>
      <g stroke="#3f7d2a" strokeWidth="0.75" opacity="0.4" fill="none">
        <line x1="210" y1="270" x2="210" y2="530" />
        <line x1="180" y1="350" x2="210" y2="325" />
        <line x1="240" y1="350" x2="210" y2="325" />
        <line x1="160" y1="430" x2="210" y2="400" />
        <line x1="260" y1="430" x2="210" y2="400" />
      </g>

      {/* Tree 3: Distant Ridge Pine (Far Right) */}
      <g stroke="url(#emerald-fade-down)" strokeWidth="1.1" fill="none" opacity="0.75">
        <polygon points="680,240 655,315 705,315" />
        <polygon points="680,290 635,390 725,390" />
        <polygon points="680,360 615,480 745,480" />
        <line x1="680" y1="480" x2="680" y2="560" strokeWidth="1.5" stroke="#3f7d2a" />
        <circle cx="680" cy="240" r="2" fill="#3f7d2a" />
      </g>
      <g stroke="#3f7d2a" strokeWidth="0.7" opacity="0.35" fill="none">
        <line x1="680" y1="240" x2="680" y2="480" />
        <line x1="655" y1="315" x2="680" y2="290" />
        <line x1="705" y1="315" x2="680" y2="290" />
      </g>

      {/* ========================================================
          BOTANICAL WIREFRAME FERNS & SHRUB VEINS
          ======================================================== */}
      <g stroke="#3f7d2a" strokeWidth="1" fill="none" opacity="0.55">
        {/* Fern 1 (Bottom Left) */}
        <path d="M 90,660 Q 120,580 160,530" strokeWidth="1.4" />
        <line x1="105" y1="620" x2="80" y2="605" />
        <line x1="118" y1="595" x2="145" y2="585" />
        <line x1="132" y1="570" x2="105" y2="550" />
        <line x1="145" y1="550" x2="175" y2="540" />
        <circle cx="160" cy="530" r="2" fill="#3f7d2a" />

        {/* Fern 2 (Far Right Edge) */}
        <path d="M 750,650 Q 720,570 690,520" strokeWidth="1.3" />
        <line x1="735" y1="610" x2="760" y2="600" />
        <line x1="720" y1="580" x2="695" y2="570" />
        <line x1="705" y1="550" x2="730" y2="540" />
      </g>

      {/* ========================================================
          CYBER NATURE HUD LABELS & TOPOGRAPHIC ELEVATION TAGS
          ======================================================== */}
      <g fontFamily="var(--bs-font-mono, monospace)" fontSize="9" fill="#3f7d2a" letterSpacing="0.1em">
        {/* HUD Target Brackets */}
        <g opacity="0.6" stroke="#3f7d2a" strokeWidth="1" fill="none">
          <path d="M 760,70 L 770,70 L 770,80" />
          <path d="M 620,70 L 610,70 L 610,80" />
          <path d="M 760,130 L 770,130 L 770,120" />
          <path d="M 620,130 L 610,130 L 610,120" />
        </g>
        <text x="622" y="88" opacity="0.85" fontWeight="bold">RESERVE: CANOPY BIOME</text>
        <text x="622" y="103" opacity="0.55">SHADE COVER: 88.4%</text>
        <text x="622" y="118" opacity="0.55">MCCLELLAN RANCH SECTOR</text>

        {/* Topographic Contour Elevation Indicators */}
        <g opacity="0.6">
          <text x="60" y="215">CONTOUR +220m</text>
          <text x="530" y="195">CONTOUR +200m</text>
          <text x="70" y="365">CONTOUR +160m</text>
          <text x="70" y="550">VALLEY FLOOR +90m</text>
        </g>
      </g>
    </svg>
  );
}
