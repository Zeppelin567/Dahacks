import { Camera, ChevronRight, Hammer, MonitorSmartphone, Route, Server, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { FACTS } from "../data";

// Only facts from Dahacks-design/build/TECH_STACK.md (verified from the repo, branch demo).
type Layer = { n: number; icon: ReactNode; title: string; line: string; chips: string[]; tone: "city" | "green" | "coral" };

export const STACK_A: Layer[] = [
  {
    n: 1,
    icon: <Camera size={22} />,
    title: "Data",
    line: `Streets, bikeways and ${FACTS.photosTotal.toLocaleString("en-US")} photos`,
    chips: [
      "OpenStreetMap · osmnx 2.1",
      "Cupertino GIS bikeways",
      "Street View Static + Metadata API",
      `Every ${FACTS.sampleEveryM} m + junctions`,
      "geopandas · shapely · pyproj",
    ],
    tone: "city",
  },
  {
    n: 2,
    icon: <Sparkles size={22} />,
    title: "AI scoring",
    line: "Two calls per spot: safety and greenery",
    chips: [
      FACTS.model,
      "Anthropic API · Python SDK",
      "Structured JSON outputs",
      "Traffic stress (LTS) · 17 hazards",
      "Tree canopy + shade",
      `${FACTS.scoringCost} for all of Cupertino`,
    ],
    tone: "coral",
  },
  {
    n: 3,
    icon: <Route size={22} />,
    title: "Routing backend",
    line: "Dijkstra on felt distance",
    chips: ["Python + FastAPI (uvicorn)", "networkx Dijkstra", `numpy edge costs · ${FACTS.routeMs}/route`, "pydantic API contract"],
    tone: "green",
  },
];

export const STACK_B: Layer[] = [
  {
    n: 4,
    icon: <Server size={22} />,
    title: "App server",
    line: "One typed API in front of Python",
    chips: ["TypeScript + Hono", "Zod / OpenAPI", "Proxies /api/py → Python side-car"],
    tone: "city",
  },
  {
    n: 5,
    icon: <MonitorSmartphone size={22} />,
    title: "Frontend",
    line: "Our own calm map, in 2D and 3D",
    chips: [
      "React 19 · Vite · TypeScript",
      "Tailwind CSS · shadcn/ui (Radix)",
      "TanStack Query",
      "MapLibre GL JS",
      "OpenFreeMap vector tiles",
      "M PLUS Rounded 1c · Pip",
    ],
    tone: "green",
  },
  {
    n: 6,
    icon: <Hammer size={22} />,
    title: "How we built it",
    line: "Claude Code with multi-agent workflows",
    chips: ["Research agents", "Design judging", "Adversarial review", "Playwright visual checks", "Figma references"],
    tone: "coral",
  },
];

export function StackRow({ layers }: { layers: Layer[] }) {
  return (
    <div className="stack">
      {layers.map((l, i) => (
        <div className="stack-cell" key={l.title}>
          <article className={`stack-card card rv tone-${l.tone}`} style={{ ["--i" as string]: i + 2 }}>
            <header>
              <span className="stack-icon">{l.icon}</span>
              <span className="stack-n">{l.n}</span>
            </header>
            <h3>{l.title}</h3>
            <p>{l.line}</p>
            <ul>
              {l.chips.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </article>
          {i < layers.length - 1 && (
            <span className="stack-arrow rv" style={{ ["--i" as string]: i + 2.5 }} aria-hidden>
              <ChevronRight size={22} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
