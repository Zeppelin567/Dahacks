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

// Created once, outside React (data routers must not live in state).
export const router = createBrowserRouter([
  // The product: one public map with a Modern ↔ Nature switch (?mode=nature). No sign-in.
  { path: "/", Component: BikeApp },
  // Old links from the two-tab version.
  { path: "/safe", element: <Navigate to="/" replace /> },
  { path: "/green", element: <Navigate to="/?mode=nature" replace /> },
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
