import { Component, type ReactNode } from "react";
export function AppErrorScreen() {
  return (
    <main className="center blocked-access" role="alert">
      <h1>Dieser Bereich konnte nicht geladen werden</h1>
      <p>
        Prüfen Sie Ihre Verbindung und versuchen Sie es erneut. Nicht
        gespeicherte Eingaben können beim Neuladen verloren gehen.
      </p>
      <button className="primary" onClick={() => window.location.reload()}>
        Erneut laden
      </button>
      <a className="text-link" href="/app/dashboard">
        Zur Hauptansicht
      </a>
    </main>
  );
}
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <AppErrorScreen /> : this.props.children;
  }
}
