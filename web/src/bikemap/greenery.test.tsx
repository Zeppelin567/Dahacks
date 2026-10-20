import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Route, RouteResponse } from "./api";
import { heroVals } from "./derive";
import { Sheet, type SheetProps } from "./sheet";

vi.mock("./panels", () => ({ TripFields: () => null }));
vi.mock("./theme-context", () => ({
  useBikeTheme: () => ({ pip: "/pip/pip_nature.png", reducedMotion: true }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const makeRoute = (vegetation: number): Route => ({
  coords: [
    [37.3, -122],
    [37.301, -122],
  ],
  distance_m: 111,
  duration_min: 0.4,
  segments: [
    {
      coords: [
        [37.3, -122],
        [37.301, -122],
      ],
      score: 0.9,
      level: "good",
      reasons: [],
      features: { vegetation, quiet: 1 },
    },
  ],
});

function response(fastest = 72.1, recommended = 72.4): RouteResponse {
  return {
    mode: "green",
    mock: false,
    fastest: makeRoute(fastest / 100),
    recommended: makeRoute(recommended / 100),
    compare: {
      extra_min: 0,
      risky_segments_fastest: null,
      risky_segments_recommended: null,
      greenery_pct_fastest: fastest,
      greenery_pct_recommended: recommended,
      noise_reduction_db: null,
    },
  };
}

const props: SheetProps = {
  ui: "nature",
  places: [],
  pins: [],
  loading: false,
  sel: "rec",
  scenic: true,
  prefs: { green: true, quiet: true, shade: false },
  onStart: vi.fn(),
  onEnd: vi.fn(),
  onSwap: vi.fn(),
  onSel: vi.fn(),
  onScenic: vi.fn(),
  onPrefs: vi.fn(),
};

describe("Greenery comparison", () => {
  it("keeps small improvements instead of rounding both values to 72", () => {
    expect(heroVals("nature", response())).toMatchObject({ label: "Greenery", them: 72.1, us: 72.4 });
    render(<Sheet {...props} route={response()} />);
    expect(screen.getByText("72.10")).toBeDefined();
    expect(screen.getByText("72.40")).toBeDefined();
    expect(screen.getByText("+0.3 pts greenery")).toBeDefined();
    expect(screen.queryByText("Under trees")).toBeNull();
  });

  it("updates values when preferences produce a new response with the same route length", () => {
    const { rerender } = render(<Sheet {...props} route={response()} />);
    rerender(<Sheet {...props} route={response(72.1, 74.6)} />);
    expect(screen.getByText("74.60")).toBeDefined();
    expect(screen.getByText("+2.5 pts greenery")).toBeDefined();
    rerender(<Sheet {...props} route={response(72.1, 72.1)} />);
    expect(screen.getByText("Same greenery")).toBeDefined();
    expect(screen.queryByText("+2.5 pts greenery")).toBeNull();
  });

  it("hides the old improvement while loading or drawing a new route", () => {
    const { rerender } = render(<Sheet {...props} loading route={response()} />);
    expect(screen.queryByText("+0.3 pts greenery")).toBeNull();
    rerender(<Sheet {...props} drawing route={response()} />);
    expect(screen.queryByText("+0.3 pts greenery")).toBeNull();
  });

  it("falls back to vegetation features when comparison fields are missing", () => {
    const r = response();
    r.compare.greenery_pct_fastest = null;
    r.compare.greenery_pct_recommended = null;
    expect(heroVals("nature", r)).toMatchObject({
      them: expect.closeTo(72.1, 5),
      us: expect.closeTo(72.4, 5),
    });
    r.fastest = makeRoute(0);
    expect(heroVals("nature", r)?.them).toBe(0);
  });

  it("keeps the Modern crossing count as an integer", () => {
    const r = response();
    r.compare.risky_segments_fastest = 3;
    r.compare.risky_segments_recommended = 1;
    render(<Sheet {...props} ui="modern" route={r} />);
    expect(screen.getByText("Risky crossings")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.queryByText("Same greenery")).toBeNull();
  });
});
