import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { DashboardPage } from "../features/dashboard/components/DashboardPage";
import { HabitsPage } from "../features/habits/components/HabitsPage";
import { TodosPage } from "../features/todos/components/TodosPage";
import { ClockPage } from "../features/clock/components/ClockPage";
import { AnalyticsPage } from "../features/analytics/components/AnalyticsPage";
import { SettingsPage } from "../features/settings/components/SettingsPage";
import { LoginPage } from "../features/auth/components/LoginPage";
import { AuthGuard } from "../features/auth/components/AuthGuard";
import { StickyCanvas } from "../features/sticky-notes/components/StickyCanvas";
import { AlarmPopup } from "../features/clock/components/AlarmPopup/AlarmPopup";
import { WidgetApp } from "../features/widget/components/WidgetApp";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/sticky-canvas",
    element: (
      <AuthGuard>
        <StickyCanvas />
      </AuthGuard>
    ),
  },
  {
    path: "/alarm-popup",
    element: <AlarmPopup />,
  },
  {
    path: "/widget",
    element: (
      <AuthGuard>
        <WidgetApp />
      </AuthGuard>
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
        path: "clock",
        element: <ClockPage />,
      },
      {
        path: "analytics",
        element: <AnalyticsPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);

