import { createBrowserRouter } from "react-router";
import { RequireAuth } from "@/components/require-auth";
import { AppShell } from "@/layouts/app-shell";
import { ApiKeysPage } from "@/pages/api-keys";
import { ChatPage } from "@/pages/chat";
import { DashboardPage } from "@/pages/dashboard";
import { ItemsPage } from "@/pages/items";
import { LandingPage } from "@/pages/landing";
import { LivePage } from "@/pages/live";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { PythonPage } from "@/pages/python";
import { SignupPage } from "@/pages/signup";

// Created once, outside React (data routers must not live in state).
export const router = createBrowserRouter([
  { path: "/", Component: LandingPage },
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
