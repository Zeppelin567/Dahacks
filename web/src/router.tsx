import { createBrowserRouter, Navigate } from "react-router";
import { BikeShell } from "@/bikemap/shell";
import { RequireAuth } from "@/components/require-auth";
import { AppShell } from "@/layouts/app-shell";
import { ApiKeysPage } from "@/pages/api-keys";
import { ChatPage } from "@/pages/chat";
import { DashboardPage } from "@/pages/dashboard";
import { GreenRoutePage } from "@/pages/green-route";
import { ItemsPage } from "@/pages/items";
import { LivePage } from "@/pages/live";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { PythonPage } from "@/pages/python";
import { SafeRoutePage } from "@/pages/safe-route";
import { SignupPage } from "@/pages/signup";

// Created once, outside React (data routers must not live in state).
export const router = createBrowserRouter([
  // The product: two public maps sharing one trip. No sign-in.
  {
    path: "/",
    Component: BikeShell,
    children: [
      { index: true, element: <Navigate to="/safe" replace /> },
      { path: "safe", Component: SafeRoutePage },
      { path: "green", Component: GreenRoutePage },
    ],
  },
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
