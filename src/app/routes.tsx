import { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";
import { DashboardPage } from "../features/dashboard/components/DashboardPage";
import { HabitsPage } from "../features/habits/components/HabitsPage";
import { TodosPage } from "../features/todos/components/TodosPage";
import { AnalyticsPage } from "../features/analytics/components/AnalyticsPage";
import { SettingsPage } from "../features/settings/components/SettingsPage";
import { LockdownPage } from "../features/lockdown/components/LockdownPage";
import { LoginPage } from "../features/auth/components/LoginPage";
import { AuthGuard } from "../features/auth/components/AuthGuard";
import { StickyCanvas } from "../features/sticky-notes/components/StickyCanvas";
import { WidgetApp } from "../features/widget/components/WidgetApp";
import { LogbookPage } from "../features/logs/components/LogbookPage";
import { BlockOverlay } from "../features/lockdown/components/BlockOverlay";
import { TodoCreatorPage } from "../features/todos/components/TodoCreatorPage";
import { ManualPage } from "../features/manual";
import { TrayMenuPage } from "../features/tray/components/TrayMenuPage";
import { isTauri } from "../shared/utils/tauri";

/**
 * Prevents web/mobile browsers from navigating to desktop-only Tauri sub-window routes.
 */
function DesktopOnlyGuard({ children }: { children: ReactNode }) {
  if (!isTauri()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/oauth-complete",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/sticky-canvas",
    element: (
      <DesktopOnlyGuard>
        <AuthGuard>
          <StickyCanvas />
        </AuthGuard>
      </DesktopOnlyGuard>
    ),
  },
  {
    path: "/widget",
    element: (
      <DesktopOnlyGuard>
        <AuthGuard>
          <WidgetApp />
        </AuthGuard>
      </DesktopOnlyGuard>
    ),
  },
  {
    path: "/block-overlay",
    element: (
      <DesktopOnlyGuard>
        <BlockOverlay />
      </DesktopOnlyGuard>
    ),
  },
  {
    path: "/tray-menu",
    element: (
      <DesktopOnlyGuard>
        <TrayMenuPage />
      </DesktopOnlyGuard>
    ),
  },
  {
    path: "/todo-creator",
    element: (
      <DesktopOnlyGuard>
        <AuthGuard>
          <TodoCreatorPage />
        </AuthGuard>
      </DesktopOnlyGuard>
    ),
  },
  {
    path: "/",
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "habits",
        element: <HabitsPage />,
      },
      {
        path: "todos",
        element: <TodosPage />,
      },
      {
        path: "analytics",
        element: <AnalyticsPage />,
      },
      {
        path: "logbook",
        element: <LogbookPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "lockdown",
        element: <LockdownPage />,
      },
      {
        path: "manual",
        element: <ManualPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
