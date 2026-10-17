// Facts and media paths for the deck. Every number here is verified
// (docs/demo-script.md, docs/backend-story.md, Dahacks-design/build/TECH_STACK.md).
// Change a fact here and every slide picks it up.

/** Product name as the website shows it (web/index.html: "BikeMap Cupertino"). */
export const PRODUCT = "BikeMap";

/** The live website (the main app runs on 5173; this deck runs on 5174). */
export const LIVE_URL = "http://localhost:5173/";
export const LIVE_NATURE_URL = "http://localhost:5173/?mode=nature";

export const MEDIA = "/presentation-media/";

/** Pictures of the CURRENT website. A later step captures them into presentation/public/site/. */
export const SITE = "/site/";

export const FACTS = {
  photosCupertino: 8_931,
  photosExtended: 5_610,
  photosTotal: 8_931 + 5_610,
  scoringCost: "$2.38",
  model: "Claude Haiku 5.5",
  sampleEveryM: 80,
  routeMs: "~9 ms",
  feltStressMax: "3.4×",
  feltCrossingMax: "1 km",
  safe: {
    from: "Infinite Loop",
    to: "Cupertino Library",
    fast: 3,
    ours: 0,
    fastMin: "7.6",
    oursMin: "7.7",
    extra: "+0.1 min",
  },
  green: {
    from: "Cupertino Library",
    to: "Main Street",
    fast: 45,
    ours: 80,
    fastMin: "8.5",
    oursMin: "9.4",
    extra: "+0.9 min",
    via: "Regnart Creek Trail",
  },
} as const;

/** One scored photo spot, from public/presentation-media/manifest.json (real Claude outputs). */
export type PhotoSample = {
  src: string;
  right: string | null;
  name: string;
  at: [number, number];
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
  photos: PhotoSample[];
  junctionPhotos: string[];
};
