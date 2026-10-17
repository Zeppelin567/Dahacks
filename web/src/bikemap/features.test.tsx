import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./api";
import { FeatureTools } from "./feature-tools";
import { parseHazards } from "./hazard-store";
import { applyVoteDeltas, buildInstructions, clampPref, toPrefVector } from "./route-utils";
import { useRouteVoice } from "./use-voice";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const route: Route = {
  coords: [
    [37.3, -122],
    [37.301, -122],
  ],
  distance_m: 111,
  duration_min: 1,
  segments: [
    {
      coords: [
        [37.3, -122],
        [37.301, -122],
      ],
      score: 0.9,
      level: "good",
      reasons: ["Quiet street"],
    },
  ],
};

describe("personal ride settings", () => {
  it("applies Balanced and Max nature without losing their distinct preferences", () => {
    const onPreset = vi.fn();
    render(
      <FeatureTools
        ui="nature"
        rural={0.6}
        onRural={vi.fn()}
        onPreset={onPreset}
        hasVotes
        onResetVotes={vi.fn()}
        armed={false}
        onReport={vi.fn()}
        canListen
        voice={{ supported: true, speaking: false, toggle: vi.fn(), stop: vi.fn(), error: undefined }}
      />,
    );
    fireEvent.click(screen.getByText("Balanced"));
    expect(onPreset).toHaveBeenLastCalledWith(0.5, { green: true, quiet: true, shade: false });
    fireEvent.click(screen.getByText("Max nature"));
    expect(onPreset).toHaveBeenLastCalledWith(1, { green: true, quiet: true, shade: true });
    expect(screen.getByText("Reset stretch votes")).toBeDefined();
  });
  it("keeps the slider continuous and exposes hazard reporting in both modes", () => {
    const onRural = vi.fn(),
      onReport = vi.fn();
    render(
      <FeatureTools
        ui="nature"
        rural={0.6}
        onRural={onRural}
        onPreset={vi.fn()}
        hasVotes={false}
        onResetVotes={vi.fn()}
        armed={false}
        onReport={onReport}
        canListen={false}
        voice={{ supported: false, speaking: false, toggle: vi.fn(), stop: vi.fn(), error: undefined }}
      />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: ".85" } });
    expect(onRural).toHaveBeenCalledWith(0.85);
    fireEvent.click(screen.getByText("Report a hazard"));
    expect(onReport).toHaveBeenCalledOnce();
    expect((screen.getByText("Listen to route") as HTMLButtonElement).disabled).toBe(true);
  });
  it("makes likes favour good features, dislikes reverse them, and clamps repeated votes", () => {
    const features = { vegetation: 1, quiet: 0 };
    expect(applyVoteDeltas({}, features, true)).toEqual({ vegetation: -1, quiet: 1 });
    expect(applyVoteDeltas({}, features, false)).toEqual({ vegetation: 1, quiet: -1 });
    expect(applyVoteDeltas({ vegetation: -5 }, features, true).vegetation).toBe(-5);
    expect(clampPref(100)).toBe(5);
    expect(toPrefVector(0.5, { green: true, quiet: false, shade: true })).toEqual({
      vegetation: -2.5,
      quiet: 0,
      shade: -2.5,
    });
  });
  it("reads previous hazard records and rejects corrupt storage", () => {
    const hazard = { id: "old", lat: 37.3, lng: -122, category: "intersection", note: "Glass", ts: 1 };
    expect(
      parseHazards(JSON.stringify([hazard, { ...hazard, lat: 200 }, { ...hazard, category: "invalid" }])),
    ).toEqual([hazard]);
    expect(parseHazards("broken JSON")).toEqual([]);
    expect(parseHazards("{}")).toEqual([]);
  });
});

describe("spoken overview", () => {
  it("describes distance and reason without claiming GPS turn navigation", () => {
    expect(buildInstructions(route)[0]).toMatch(/Quiet street.*111 meters/);
  });
  it("cancels audio on a changed route and prevents old callbacks from resuming it", () => {
    const speak = vi.fn(),
      cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    function Voice({ value }: { value: Route }) {
      const voice = useRouteVoice(value);
      return (
        <button type="button" onClick={voice.toggle}>
          {voice.speaking ? "Stop" : "Listen"}
        </button>
      );
    }
    const view = render(<Voice value={route} />);
    fireEvent.click(screen.getByText("Listen"));
    expect(speak).toHaveBeenCalledOnce();
    const old = speak.mock.calls[0]?.[0] as SpeechSynthesisUtterance;
    view.rerender(<Voice value={{ ...route, distance_m: 222 }} />);
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByText("Listen")).toBeDefined();
    old.onend?.(new Event("end") as SpeechSynthesisEvent);
    expect(speak).toHaveBeenCalledOnce();
  });
});
