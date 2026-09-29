import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AppErrorScreen } from "../components/common/AppErrorBoundary";
import { AppShell } from "./AppShell";
import { ProtectedRoute, RequirePermission } from "./ProtectedRoute";
const Login = lazy(() =>
  import("../features/auth/AuthScreens").then((m) => ({ default: m.Login })),
);
const ForgotPassword = lazy(() =>
  import("../features/auth/AuthScreens").then((m) => ({
    default: m.ForgotPassword,
  })),
);
const ResetPassword = lazy(() =>
  import("../features/auth/AuthScreens").then((m) => ({
    default: m.ResetPassword,
  })),
);
const AcceptInvite = lazy(() =>
  import("../features/auth/AuthScreens").then((m) => ({
    default: m.AcceptInvite,
  })),
);
const Dashboard = lazy(() =>
  import("../features/dashboard/Dashboard").then((m) => ({
    default: m.Dashboard,
  })),
);
const Onboarding = lazy(() =>
  import("../features/onboarding/Onboarding").then((m) => ({
    default: m.Onboarding,
  })),
);

const ConversationList = lazy(() =>
  import("../features/messaging/Messaging").then((m) => ({
    default: m.ConversationList,
  })),
);
const Chat = lazy(() =>
  import("../features/messaging/Messaging").then((m) => ({ default: m.Chat })),
);
const Directory = lazy(() =>
  import("../features/directory/Directory").then((m) => ({
    default: m.Directory,
  })),
);
const NewsFeed = lazy(() =>
  import("../features/news/News").then((m) => ({ default: m.NewsFeed })),
);
const NewsDetail = lazy(() =>
  import("../features/news/News").then((m) => ({ default: m.NewsDetail })),
);
const Notifications = lazy(() =>
  import("../features/notifications/Notifications").then((m) => ({
    default: m.Notifications,
  })),
);
const Documents = lazy(() =>
  import("../features/documents/Documents").then((m) => ({
    default: m.Documents,
  })),
);
const DocumentDetail = lazy(() =>
  import("../features/documents/Documents").then((m) => ({
    default: m.DocumentDetail,
  })),
);
const AdminHome = lazy(() =>
  import("../features/admin/Admin").then((m) => ({ default: m.AdminHome })),
);
const AdminUsers = lazy(() =>
  import("../features/admin/Admin").then((m) => ({ default: m.AdminUsers })),
);
const AdminUserDetail = lazy(() =>
  import("../features/admin/Admin").then((m) => ({
    default: m.AdminUserDetail,
  })),
);
const AdminRoles = lazy(() =>
  import("../features/admin/Admin").then((m) => ({ default: m.AdminRoles })),
);
const AdminTeams = lazy(() =>
  import("../features/admin/Admin").then((m) => ({ default: m.AdminTeams })),
);
const AdminSettings = lazy(() =>
  import("../features/admin/Admin").then((m) => ({ default: m.AdminSettings })),
);
const AuditLog = lazy(() =>
  import("../features/admin/Operations").then((m) => ({ default: m.AuditLog })),
);
const Integrations = lazy(() =>
  import("../features/admin/Operations").then((m) => ({
    default: m.Integrations,
  })),
);
const More = lazy(() =>
  import("../features/settings/Settings").then((m) => ({ default: m.More })),
);
const Profile = lazy(() =>
  import("../features/settings/Settings").then((m) => ({ default: m.Profile })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/Settings").then((m) => ({
    default: m.Settings,
  })),
);
const SchedulePage = lazy(() =>
  import("../features/scheduling").then((m) => ({ default: m.SchedulePage })),
);
const ScheduleAdminPage = lazy(() =>
  import("../features/scheduling").then((m) => ({
    default: m.ScheduleAdminPage,
  })),
);
const LeavePage = lazy(() =>
  import("../features/leave").then((m) => ({ default: m.LeavePage })),
);
const LeaveAdminPage = lazy(() =>
  import("../features/leave").then((m) => ({ default: m.LeaveAdminPage })),
);
const SickLeavePage = lazy(() =>
  import("../features/sick-leave").then((m) => ({ default: m.SickLeavePage })),
);
const SickLeaveAdminPage = lazy(() =>
  import("../features/sick-leave").then((m) => ({
    default: m.SickLeaveAdminPage,
  })),
);
const FleetPage = lazy(() =>
  import("../features/fleet").then((m) => ({ default: m.FleetPage })),
);
const FleetAdminPage = lazy(() =>
  import("../features/fleet").then((m) => ({ default: m.FleetAdminPage })),
);
const MaterialRequestsPage = lazy(() =>
  import("../features/materials").then((m) => ({
    default: m.MaterialRequestsPage,
  })),
);
const MaterialRequestsAdminPage = lazy(() =>
  import("../features/materials").then((m) => ({
    default: m.MaterialRequestsAdminPage,
  })),
);
const page = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="center">
        <div className="spinner" />
        <span>Bereich wird geladen …</span>
      </div>
    }
  >
    {node}
  </Suspense>
);
const permitted = (permission: string | string[], node: ReactNode) =>
  page(<RequirePermission permission={permission}>{node}</RequirePermission>);

export const router = createBrowserRouter([
  {
    errorElement: <AppErrorScreen />,
    children: [
      { path: "/", element: <Navigate to="/app/dashboard" replace /> },
      { path: "/login", element: page(<Login />) },
      { path: "/forgot-password", element: page(<ForgotPassword />) },
      { path: "/reset-password", element: page(<ResetPassword />) },
      { path: "/accept-invite", element: page(<AcceptInvite />) },
      {
        path: "/privacy",
        element: (
          <main className="legal">
            <h1>Datenschutz</h1>
            <p>
              Diese interne Anwendung verarbeitet ausschließlich
              betriebsnotwendige Mitarbeiterdaten. Die verbindlichen
              Betreiberinformationen werden vor Produktivbetrieb ergänzt.
            </p>
          </main>
        ),
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/onboarding", element: page(<Onboarding />) },
          {
            path: "/app",
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              {
                path: "dashboard",
                element: permitted("dashboard.view", <Dashboard />),
              },
              {
                path: "messages",
                element: permitted("messages.use", <ConversationList />),
              },
              {
                path: "messages/:conversationId",
                element: permitted("messages.use", <Chat />),
              },
              { path: "news", element: permitted("news.view", <NewsFeed />) },
              {
                path: "news/:id",
                element: permitted(
                  ["news.view", "news.create", "news.manage"],
                  <NewsDetail />,
                ),
              },
              {
                path: "schedule",
                element: permitted(
                  [
                    "schedule.view_own",
                    "schedule.view_team",
                    "schedule.manage",
                  ],
                  <SchedulePage />,
                ),
              },
              {
                path: "leave",
                element: permitted(
                  [
                    "leave.view_own",
                    "leave.create",
                    "leave.view_team",
                    "leave.approve",
                    "leave.manage",
                  ],
                  <LeavePage />,
                ),
              },
              {
                path: "sick-leave",
                element: permitted(
                  [
                    "sick_leave.view_own",
                    "sick_leave.create",
                    "sick_leave.view_status",
                    "sick_leave.manage",
                  ],
                  <SickLeavePage />,
                ),
              },
              {
                path: "documents",
                element: permitted(
                  [
                    "documents.view_own",
                    "documents.view_shared",
                    "documents.manage",
                  ],
                  <Documents />,
                ),
              },
              {
                path: "documents/:id",
                element: permitted(
                  [
                    "documents.view_own",
                    "documents.view_shared",
                    "documents.manage",
                  ],
                  <DocumentDetail />,
                ),
              },
              {
                path: "fleet",
                element: permitted(
                  ["fleet.view_own", "fleet.view_all", "fleet.manage"],
                  <FleetPage />,
                ),
              },
              {
                path: "material-requests",
                element: permitted(
                  [
                    "materials.create_own",
                    "materials.view_team",
                    "materials.approve",
                    "materials.manage",
                  ],
                  <MaterialRequestsPage />,
                ),
              },
              {
                path: "directory",
                element: permitted("directory.view", <Directory />),
              },
              { path: "notifications", element: page(<Notifications />) },
              { path: "profile", element: page(<Profile />) },
              { path: "settings", element: page(<SettingsPage />) },
              { path: "more", element: page(<More />) },
              { path: "admin", element: page(<AdminHome />) },
              { path: "admin/users", element: page(<AdminUsers />) },
              {
                path: "admin/users/:userId",
                element: page(<AdminUserDetail />),
              },
              { path: "admin/roles", element: page(<AdminRoles />) },
              { path: "admin/teams", element: page(<AdminTeams />) },
              {
                path: "admin/news",
                element: permitted("news.manage", <NewsFeed />),
              },
              {
                path: "admin/documents",
                element: permitted("documents.manage", <Documents />),
              },
              {
                path: "admin/schedule",
                element: permitted("schedule.manage", <ScheduleAdminPage />),
              },
              {
                path: "admin/leave",
                element: permitted(
                  ["leave.approve", "leave.manage"],
                  <LeaveAdminPage />,
                ),
              },
              {
                path: "admin/sick-leave",
                element: permitted("sick_leave.manage", <SickLeaveAdminPage />),
              },
              {
                path: "admin/fleet",
                element: permitted("fleet.manage", <FleetAdminPage />),
              },
              {
                path: "admin/material-requests",
                element: permitted(
                  ["materials.approve", "materials.manage"],
                  <MaterialRequestsAdminPage />,
                ),
              },
              { path: "admin/audit", element: page(<AuditLog />) },
              { path: "admin/integrations", element: page(<Integrations />) },
              { path: "admin/settings", element: page(<AdminSettings />) },
            ],
          },
        ],
      },
      { path: "*", element: <Navigate to="/app/dashboard" replace /> },
    ],
  },
]);
