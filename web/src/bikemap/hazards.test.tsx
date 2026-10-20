import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { HazardDialog, useHazards } from "./hazards";

vi.mock("./map", () => ({
  useMapLayers: vi.fn(),
  MapPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("maplibre-gl", () => ({ default: {} }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("saves a categorized hazard with coordinates and an optional note", () => {
  const onSave = vi.fn(),
    onClose = vi.fn();
  render(<HazardDialog at={[37.31, -122.01]} onSave={onSave} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "road_surface" } });
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "  Broken glass  " } });
  fireEvent.click(screen.getByText("Save hazard"));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ lat: 37.31, lng: -122.01, category: "road_surface", note: "Broken glass" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it("cancel never saves a report", () => {
  const onSave = vi.fn(),
    onClose = vi.fn();
  render(<HazardDialog at={[37.31, -122.01]} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByText("Cancel"));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it("loads existing hazards, persists deletion, and tolerates blocked storage", () => {
  localStorage.setItem(
    "bikemap-hazards-v1",
    JSON.stringify([{ id: "old", lat: 37.31, lng: -122.01, category: "intersection", note: "", ts: 1 }]),
  );
  function Reports() {
    const { hazards, setHazards } = useHazards();
    return (
      <button type="button" onClick={() => setHazards([])}>
        {hazards.length} hazards
      </button>
    );
  }
  const first = render(<Reports />);
  fireEvent.click(screen.getByText("1 hazards"));
  expect(localStorage.getItem("bikemap-hazards-v1")).toBe("[]");
  first.unmount();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage blocked");
  });
  render(<Reports />);
  expect(screen.getByText("0 hazards")).toBeDefined();
});
