import { useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router";
import { appConfig } from "@/app.config";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// Start/end are shared by both maps, so switching tabs keeps the same trip.
type Trip = {
  startId: string;
  endId: string;
  setStartId: (id: string) => void;
  setEndId: (id: string) => void;
};

export function useTrip() {
  return useOutletContext<Trip>();
}

const TABS = [
  { to: "/safe", label: "🛡️ Safe route" },
  { to: "/green", label: "🌳 Green route" },
];

export function BikeShell() {
  const [startId, setStartId] = useState("deanza");
  const [endId, setEndId] = useState("main-street");

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>{appConfig.logo}</span>
          {appConfig.name}
        </Link>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <span className="ml-auto hidden text-sm text-muted-foreground md:block">{appConfig.tagline}</span>
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1">
        <Outlet context={{ startId, endId, setStartId, setEndId } satisfies Trip} />
      </main>
    </div>
  );
}
