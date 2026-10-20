import type { GreenLayers, LatLng, NetworkResponse, Place, RoutePhoto, RouteResponse } from "@/bikemap/api";

export const MEDIA = "/presentation-media/";
// Full dataset total confirmed by the team; this laptop's supplied archive contains 8,931.
export const FULL_DATASET_PHOTOS = 13_000;

export type PhotoSample = {
  src: string;
  right: string | null;
  name: string;
  at: LatLng;
  safety: number;
  greenery: number;
  shade: number;
  safeNote: string;
  greenNote: string;
  hazards: string[];
  lts: number;
  date: string | null;
};
export type Manifest = {
  photoCount: number;
  nodeCount: number;
  edgeCount: number;
  safetySamples: number;
  greenSamples: number;
  sampleCount: number;
  photos: PhotoSample[];
  junctionPhotos: string[];
};
export type DemoTrip = {
  id: string;
  start: Place;
  end: Place;
  routes: Record<string, RouteResponse>;
  photos: Record<string, RoutePhoto[]>;
  details: RoutePhoto[];
};
export type DemoData = { places: Place[]; trips: DemoTrip[]; network: NetworkResponse; layers: GreenLayers };

export const chapters = [
  {
    title: "RideScape",
    tag: "Introduction",
    note: "Introduce the team and RideScape. A bicycle can be a way to get somewhere, or a reason to go somewhere.",
  },
  {
    title: "One bicycle. Two ways to ride.",
    tag: "The rider",
    note: "A bicycle serves two different needs: everyday transport and riding for pleasure. Most navigation starts with a destination.",
  },
  {
    title: "A difficult crossing.",
    tag: "The commute",
    note: "Blar: Every day on my way to school, I have to cross Lawrence Expressway. Explain what makes this crossing stressful. Press Replay crossing for the illustrative simulation.",
  },
  {
    title: "A better view.",
    tag: "The escape",
    note: "Hong Zhe: I enjoy nature. I would happily take a small detour for a beautiful view. That preference should be part of choosing a route.",
  },
  {
    title: "Your ride. Your rules.",
    tag: "Fast & Safe",
    note: "Show Fast & Safe. Click a street to reveal its score and the photo behind it. Scroll once to reveal Nature mode. The demo uses saved outputs from our actual engine.",
  },
  {
    title: "Take the scenic way.",
    tag: "Nature",
    note: "Show Nature mode. Adjust the scenic preference and select a route photo. The selected Cupertino journey stays in place between the two product slides. Open the live app for unrestricted use.",
  },
  {
    title: "A street. Every angle.",
    tag: "The intelligence",
    note: "We sample every 80 metres. Roads use forward and curb-side views when available; intersections use up to four directions. Claude Haiku 5.5 evaluates map facts and photos in separate safety and greenery calls. Safety uses LTS; greenery measures vegetation and canopy.",
  },
  {
    title: "13,000 perspectives.",
    tag: "The scale",
    note: "Across the full dataset, 13,000 Street View images help us understand the city. The attached local archive contains 8,931; the team confirmed another batch. Scores are precomputed and baked into the graph, so routing makes no live AI call.",
  },
  {
    title: "A different way through.",
    tag: "The route",
    note: "Dijkstra runs on 8,514 nodes. Safety changes perceived distance: the worst roads cost ten times their physical length. Nature gives greener streets lower relative cost. A detour cap keeps the result practical. The map on this slide is the actual Cupertino graph.",
  },
  {
    title: "Choose your way.",
    tag: "Your next ride",
    note: "With RideScape, choose a ride that feels right for you. Invite the audience to try the app. Thank the judges.",
  },
];
