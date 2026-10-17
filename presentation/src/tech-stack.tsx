import { Camera, Hammer, MonitorSmartphone, Route, Server, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

// Facts verified from the repo (branch demo): Dahacks-design/build/TECH_STACK.md.
type Layer = { n: string; icon: ReactNode; title: string; line: string; pills: string[]; tone: "navy" | "coral" | "forest" };

const LAYERS: Layer[] = [
  {
    n: "01",
    icon: <Camera size={18} />,
    title: "Data",
    line: "Street network, city bikeways and Street View photos every 80 m.",
    pills: ["OpenStreetMap · osmnx", "Cupertino GIS", "Google Street View API", "GeoPandas · Shapely"],
    tone: "navy",
  },
  {
    n: "02",
    icon: <Sparkles size={18} />,
    title: "AI Scoring",
    line: "Two Claude calls per spot: one for safety, one for greenery.",
    pills: ["Claude Haiku 5.5", "Anthropic API", "Structured JSON", "LTS 1–4 · 17 hazards"],
    tone: "coral",
  },
  {
    n: "03",
    icon: <Route size={18} />,
    title: "Routing Engine",
    line: "Dijkstra on perceived distance, about 9 ms per route.",
    pills: ["Python · FastAPI", "NetworkX", "NumPy", "Pydantic"],
    tone: "forest",
  },
  {
    n: "04",
    icon: <Server size={18} />,
    title: "App Server",
    line: "One typed API in front of the Python routing engine.",
    pills: ["TypeScript · Hono", "Zod · OpenAPI"],
    tone: "navy",
  },
  {
    n: "05",
    icon: <MonitorSmartphone size={18} />,
    title: "Frontend",
    line: "Our own calm map style, in 2D and 3D.",
    pills: ["React 19 · Vite", "Tailwind · shadcn/ui", "TanStack Query", "MapLibre GL · OpenFreeMap"],
    tone: "forest",
  },
  {
    n: "06",
    icon: <Hammer size={18} />,
    title: "How We Built It",
    line: "Claude Code with multi-agent workflows and visual checks.",
    pills: ["Claude Code", "Playwright", "Figma"],
    tone: "coral",
  },
];

export function TechStack() {
  return (
    <div className="bs-stack-wrapper bs-reveal">
      <div className="bs-section-subheading">
        <span className="bs-subheading-tag">Built With</span>
        <h3 className="bs-subheading-title">Our Tech Stack</h3>
      </div>
      <div className="bs-stack-grid bs-reveal-stagger">
        {LAYERS.map((l) => (
          <div className={`bs-flow-node bs-stack-node is-${l.tone}`} key={l.n}>
            <div>
              <div className="bs-stack-head">
                <span className="bs-stack-icon">{l.icon}</span>
                <span className="bs-step-badge">LAYER {l.n}</span>
              </div>
              <h4 className="bs-step-title">{l.title}</h4>
              <p className="bs-step-desc">{l.line}</p>
            </div>
            <div className="bs-tech-pills">
              {l.pills.map((p) => (
                <span className="bs-tech-pill" key={p}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
