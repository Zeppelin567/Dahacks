import { createBrowserRouter, Navigate } from "react-router";
import { BikeApp } from "@/bikemap/app";
import { RequireAuth } from "@/components/require-auth";
import { AppShell } from "@/layouts/app-shell";
import { ApiKeysPage } from "@/pages/api-keys";
import { ChatPage } from "@/pages/chat";
import { DashboardPage } from "@/pages/dashboard";
import { ItemsPage } from "@/pages/items";
import { LivePage } from "@/pages/live";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { PythonPage } from "@/pages/python";
import { SignupPage } from "@/pages/signup";
import Presentation from "@/presentation";

// The phone preview and the "Live app" links open the real BikeScape website (web/, `npm run dev`),
// so the deck always shows the current app. ?mode=nature carries through.
const WEBSITE = import.meta.env.VITE_WEBSITE_URL ?? "http://localhost:5173/";
function Website() {
  window.location.replace(WEBSITE + window.location.search);
  return null;
}

export const router = createBrowserRouter([
  // Presentation showcase is the root presentation experience
  { path: "/", Component: Presentation },
  { path: "/presentation", Component: Presentation },
  { path: "/showcase", Component: Presentation },

  // Cloned live web application routes
  { path: "/bike-app", Component: Website },
  { path: "/map", Component: BikeApp },
  { path: "/safe", element: <Navigate to="/bike-app" replace /> },
  { path: "/green", element: <Navigate to="/bike-app?mode=nature" replace /> },
  { path: "/login", Component: LoginPage },
  { path: "/signup", Component: SignupPage },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, Component: DashboardPage },
      { path: "items", Component: ItemsPage },
      { path: "chat", Component: ChatPage },
      { path: "api-keys", Component: ApiKeysPage },
      { path: "live", Component: LivePage },
      { path: "python", Component: PythonPage },
    ],
  },
  { path: "*", Component: NotFoundPage },
]);
