import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
export function ProtectedRoute() {
  const { session, appSession, loading, signOut } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <main className="center">
        <div className="spinner" />
        <span>Bereich wird sicher geladen …</span>
      </main>
    );
  if (!session)
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!appSession || appSession.profile.status !== "active")
    return (
      <main className="center blocked-access">
        <h1>Zugang nicht verfügbar</h1>
        <p>Ihr Konto ist noch nicht aktiv oder wurde gesperrt.</p>
        {appSession?.profile.status === "invited" && (
          <a className="primary" href="/accept-invite">
            Einladung abschließen
          </a>
        )}
        <button className="secondary" onClick={() => void signOut()}>
          Abmelden und anderes Konto verwenden
        </button>
      </main>
    );
  return <Outlet />;
}
export function PermissionRoute({ permission }: { permission: string }) {
  const { has } = useAuth();
  return has(permission) ? (
    <Outlet />
  ) : (
    <main className="empty">
      <h1>Kein Zugriff</h1>
      <p>Für diesen Bereich fehlt Ihnen die erforderliche Berechtigung.</p>
    </main>
  );
}
export function RequirePermission({
  permission,
  children,
}: {
  permission: string | string[];
  children: React.ReactNode;
}) {
  const { has } = useAuth();
  const keys = Array.isArray(permission) ? permission : [permission];
  return keys.some(has) ? (
    <>{children}</>
  ) : (
    <section className="empty">
      <h2>Kein Zugriff</h2>
      <p>Für diesen Bereich fehlt Ihnen die erforderliche Berechtigung.</p>
    </section>
  );
}
