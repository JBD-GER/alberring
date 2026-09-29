import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  disablePush,
  enablePush,
  pushAvailable,
} from "../../services/platform/push";
export function PushSettings() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const receive = (event: Event) =>
      setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("alberring:push-status", receive);
    return () => window.removeEventListener("alberring:push-status", receive);
  }, []);
  const change = async (enable: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      if (enable) await enablePush();
      else {
        await disablePush();
        setMessage("Push ist für dieses Gerät deaktiviert.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Änderung konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <div className="settings-title">
        <Bell />
        <div>
          <h3>Push auf diesem Gerät</h3>
          <p>
            Neue Hinweise auch bei geschlossener App. Vertrauliche Inhalte
            werden nicht in der Push-Vorschau angezeigt.
          </p>
        </div>
      </div>
      {pushAvailable ? (
        <div className="form-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void change(true)}
          >
            {busy ? "Wird eingerichtet …" : "Push aktivieren"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void change(false)}
          >
            Auf diesem Gerät deaktivieren
          </button>
        </div>
      ) : (
        <p>
          Push wird nach der Betreiber-Einrichtung in der iOS- und Android-App
          verfügbar. In-App-Hinweise können Sie schon jetzt verwenden.
        </p>
      )}
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
    </section>
  );
}
