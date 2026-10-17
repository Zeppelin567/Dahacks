import { FACTS } from "../data";

/** How a street "feels" to the router: same 100 m, different felt length. */
export function FeltBars() {
  return (
    <div className="felt card rv" style={{ ["--i" as string]: 2 }}>
      <div className="felt-row">
        <span className="felt-name">
          <i className="dot" style={{ background: "var(--calm)" }} />
          Calm street
        </span>
        <div className="felt-track">
          <span className="felt-bar calm" style={{ ["--w" as string]: "17%" }} />
        </div>
        <span className="felt-val">100 m</span>
      </div>
      <div className="felt-row">
        <span className="felt-name">
          <i className="dot" style={{ background: "var(--busy)" }} />
          Stressful street
        </span>
        <div className="felt-track">
          <span className="felt-bar busy" style={{ ["--w" as string]: "58%" }} />
        </div>
        <span className="felt-val">
          up to {FACTS.feltStressMax}
        </span>
      </div>
      <div className="felt-row">
        <span className="felt-name">
          <i className="dot" style={{ background: "var(--risky)" }} />
          Risky crossing
        </span>
        <div className="felt-track">
          <span className="felt-bar risky" style={{ ["--w" as string]: "100%" }} />
        </div>
        <span className="felt-val">+ up to {FACTS.feltCrossingMax}</span>
      </div>
      <p className="felt-foot">Every street is 100 m long. Only how it feels changes.</p>
    </div>
  );
}

/** The demo trip drawn as a tiny map: the fast way crosses 3 risky spots (FACTS.safe.fast), ours crosses none. */
export function MiniRoute() {
  const s = FACTS.safe;
  // One bead per risky crossing on the fast way (FACTS.safe.fast = 3 since the counting fix).
  const beads = [
    [190, 70],
    [190, 150],
    [190, 300],
  ] as const;
  return (
    <div className="mini card rv" style={{ ["--i" as string]: 3 }}>
      <svg viewBox="0 0 400 380" role="img" aria-label={`Fast way with ${s.fast} risky crossings, our way with ${s.ours}`}>
        {/* quiet street grid */}
        <g stroke="var(--grid)" strokeWidth="6" strokeLinecap="round" fill="none">
          <path d="M60 30 V350 M130 30 V350 M250 30 V350 M320 30 V350" />
          <path d="M30 70 H370 M30 150 H370 M30 230 H370 M30 300 H370" />
        </g>
        {/* the fast way, straight down the arterial */}
        <path d="M190 34 V336" stroke="#fff" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path className="draw" d="M190 34 V336" stroke="var(--ghost)" strokeWidth="5" strokeLinecap="round" fill="none" />
        {/* our way, on parallel side streets */}
        <path
          className="draw late"
          d="M190 34 H250 V150 Q250 160 260 160 H312 Q320 160 320 170 V300 Q320 336 284 336 H190"
          stroke="#fff"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="draw late"
          d="M190 34 H250 V150 Q250 160 260 160 H312 Q320 160 320 170 V300 Q320 336 284 336 H190"
          stroke="var(--accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {beads.map(([x, y], i) => (
          <g key={y} className="bead" style={{ ["--i" as string]: i }}>
            <circle cx={x} cy={y} r="13" fill="var(--risky)" stroke="#fff" strokeWidth="3" />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
              {i + 1}
            </text>
          </g>
        ))}
        <circle cx="190" cy="34" r="9" fill="#fff" stroke="var(--ink)" strokeWidth="4" />
        <circle cx="190" cy="336" r="10" fill="var(--ink)" />
      </svg>
      <div className="mini-legend">
        <span>
          <i className="line ghost" /> Fast way · {s.fastMin} min · <b className="t-risky">{s.fast} risky</b>
        </span>
        <span>
          <i className="line ours" /> Our way · {s.oursMin} min · <b className="t-ours">{s.ours} risky</b>
        </span>
      </div>
    </div>
  );
}
