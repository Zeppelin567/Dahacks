// The v3 prototype's icon set (24px grid, 2.2 stroke, round caps), so the app matches the approved design.
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  building: (
    <>
      <path d="M4 21V8l6-4v17M10 21h10V11l-6-3" />
      <path d="M14 13h2M14 17h2M6.5 11h1M6.5 15h1" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" />
      <path d="M5 19l8-8" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v5h5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrow: <path d="M4 12h15M14 6l6 6-6 6" />,
  direct: <path d="M5 12h14M14 7l5 5-5 5" />,
  lanes: <path d="M4 4v16M20 4v16M12 5v2.5M12 10.75v2.5M12 16.5v2.5" />,
  speed: (
    <>
      <path d="M4.5 16a8 8 0 1 1 15 0" />
      <path d="M12 15l4-5" />
    </>
  ),
  island: (
    <>
      <path d="M3 12h4M17 12h4" />
      <rect x="8" y="9" width="8" height="6" rx="3" />
    </>
  ),
  nolane: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18L18 6" />
    </>
  ),
  bikelane: (
    <>
      <circle cx="6.5" cy="16" r="3.5" />
      <circle cx="17.5" cy="16" r="3.5" />
      <path d="M6.5 16l4-7h5l2 7M10.5 9l-1-2.5H8" />
    </>
  ),
  door: (
    <>
      <rect x="5" y="9" width="14" height="7" rx="2.5" />
      <path d="M7.5 16v2M16.5 16v2M7 9l1.5-3.5h7L17 9" />
    </>
  ),
  drive: (
    <>
      <path d="M4 20h16M6 20V10l6-5 6 5v10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  rough: <path d="M3 15l3-3 3 3 3-3 3 3 3-3 3 3" />,
  quiet: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  tree: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M12 14.5V21M9 21h6" />
    </>
  ),
  park: (
    <>
      <path d="M12 3l-5 7h3l-4 6h12l-4-6h3z" />
      <path d="M12 16v5" />
    </>
  ),
  shade: (
    <>
      <path d="M3 12a9 9 0 0 1 18 0z" />
      <path d="M12 12v7a2 2 0 0 0 4 0" />
    </>
  ),
  chevD: <path d="M6 9.5l6 6 6-6" />,
  chevR: <path d="M9.5 6l6 6-6 6" />,
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h12l-2.6 4 2.6 4h-12" />
    </>
  ),
  split: (
    <>
      <path d="M12 3v18" />
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </>
  ),
  spark: (
    <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" fill="currentColor" stroke="none" />
  ),
  cam: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3.5" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8.5 7l1.5-2.5h4L15.5 7" />
    </>
  ),
  scare: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.3" r=".5" fill="currentColor" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  listen: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  swap: <path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5" />,
  pin: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  ext: (
    <path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  ),
};

export type IconName = keyof typeof P;

/** One v3 icon. Size it with CSS (width/height) or the `size` prop. */
export function Ico({ n, size, className }: { n: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `bm-i ${className}` : "bm-i"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {P[n]}
    </svg>
  );
}

// "Who can ride it" pictograms (32px grid).
const RS: Record<string, ReactNode> = {
  kid: (
    <>
      <circle cx="16" cy="12" r="3" />
      <path d="M16 15.5v6M11.5 18l4.5-2 4.5 2M16 21.5l-3 5M16 21.5l3 5" />
    </>
  ),
  trailer: (
    <>
      <circle cx="8" cy="21" r="4" />
      <circle cx="19" cy="21" r="4" />
      <path d="M8 21l4-7h5l2 7M12 14l-1-3h-2" />
      <path d="M23 19h2.5" />
      <rect x="25.5" y="15" width="5" height="6" rx="1.5" />
    </>
  ),
  student: (
    <>
      <circle cx="15" cy="7" r="3" />
      <path d="M15 10.5v9M15 19.5l-4 7M15 19.5l4 7M10 15l5-3 5 3" />
      <rect x="18" y="11" width="5" height="7" rx="1.6" />
    </>
  ),
  commuter: (
    <>
      <circle cx="14" cy="7" r="3" />
      <path d="M14 10.5v9M14 19.5l-4 7M14 19.5l4 7M9 15l5-4 4 4" />
      <rect x="20" y="17" width="8" height="6" rx="1.2" />
      <path d="M22.5 17v-1.6h3V17" />
    </>
  ),
};

export function RiderIco({ k }: { k: "kid" | "trailer" | "student" | "commuter" }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {RS[k]}
    </svg>
  );
}
