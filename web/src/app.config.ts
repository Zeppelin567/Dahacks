// The ONE file to edit first at a hackathon. Everything user-visible about
// the product (name, tagline, colors, which modules show up) reads from here.
import type { LucideIcon } from "lucide-react";
import { Boxes, KeyRound, LayoutDashboard, MessageSquare, Radio, Terminal } from "lucide-react";

export const appConfig = {
  name: "MVP Demo",
  tagline: "The boring parts are already done.",
  description:
    "Auth, database, typed API, realtime, LLM chat and a Python side-car, wired together so you can spend the 48 hours on the idea.",
  /** Emoji or short text shown as the logo. */
  logo: "⚡",
  /**
   * Optional brand color (any CSS color). Overrides the theme's primary
   * color at runtime; leave undefined to keep the neutral default.
   */
  brandColor: undefined as string | undefined,

  /** Flip a module off and its page + sidebar entry disappear. */
  modules: {
    items: true,
    chat: true,
    live: true,
    apiKeys: true,
    python: true,
  },
};

export type ModuleId = keyof typeof appConfig.modules;

export type NavItem = {
  id: ModuleId | "dashboard";
  label: string;
  path: string;
  icon: LucideIcon;
};

/** Sidebar entries, in display order. Filtered by `appConfig.modules`. */
export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/app", icon: LayoutDashboard },
  { id: "items", label: "Items", path: "/app/items", icon: Boxes },
  { id: "chat", label: "Chat", path: "/app/chat", icon: MessageSquare },
  { id: "live", label: "Live", path: "/app/live", icon: Radio },
  { id: "apiKeys", label: "API keys", path: "/app/api-keys", icon: KeyRound },
  { id: "python", label: "Python", path: "/app/python", icon: Terminal },
];

export function enabledNav(): NavItem[] {
  return navItems.filter((n) => n.id === "dashboard" || appConfig.modules[n.id]);
}
