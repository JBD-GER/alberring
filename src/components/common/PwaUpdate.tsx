import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
export function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <aside className="pwa-update" role="status">
      <div>
        <strong>Neue App-Version verfügbar</strong>
        <span>
          Aktualisieren Sie jetzt, um alle Verbesserungen zu erhalten.
        </span>
      </div>
      <button
        className="primary"
        onClick={() => void updateServiceWorker(true)}
      >
        <RefreshCw /> Aktualisieren
      </button>
      <button
        className="icon-button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Hinweis schließen"
      >
        <X />
      </button>
    </aside>
  );
}
