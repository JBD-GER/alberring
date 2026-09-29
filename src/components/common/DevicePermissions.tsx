import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { ShieldCheck } from "lucide-react";
import {
  getPermissionStatus,
  openAppSettings,
  permissionLabels,
  type DevicePermission,
  type DevicePermissionStatus,
} from "../../services/platform/permissions";
import "./device-actions.css";

const permissions: { key: DevicePermission; label: string; purpose: string }[] =
  [
    {
      key: "location",
      label: "Standort",
      purpose:
        "Einmalig zum bewussten Teilen im Chat; kein Hintergrundstandort.",
    },
    {
      key: "camera",
      label: "Kamera",
      purpose: "Fotos für Chat und Kilometerstand aufnehmen.",
    },
    {
      key: "microphone",
      label: "Mikrofon",
      purpose: "Sprachnachrichten nach aktivem Start aufnehmen.",
    },
    {
      key: "notifications",
      label: "Mitteilungen",
      purpose: "Benachrichtigungen auf diesem Gerät empfangen.",
    },
  ];

export function DevicePermissions() {
  const [states, setStates] = useState<
    Partial<Record<DevicePermission, DevicePermissionStatus>>
  >({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const results = await Promise.allSettled(
        permissions.map(({ key }) => getPermissionStatus(key)),
      );
      if (!alive) return;
      const next: Partial<Record<DevicePermission, DevicePermissionStatus>> =
        {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled")
          next[permissions[index].key] = result.value;
      });
      setStates(next);
      setError(
        results.some((result) => result.status === "rejected")
          ? "Einige Berechtigungen konnten nicht abgefragt werden. Bitte aktualisieren Sie die Ansicht."
          : "",
      );
      setLoading(false);
    };
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    const handle = Capacitor.isNativePlatform()
      ? App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void load();
        }).catch(() => null)
      : null;
    return () => {
      alive = false;
      window.removeEventListener("focus", focus);
      if (handle)
        void handle
          .then((listener) => listener?.remove())
          .catch(() => undefined);
    };
  }, [refresh]);
  return (
    <section className="settings-card">
      <div className="settings-title">
        <ShieldCheck />
        <div>
          <h3>Geräteberechtigungen</h3>
          <p>
            Berechtigungen werden erst angefragt, wenn Sie die jeweilige
            Funktion verwenden.
          </p>
        </div>
      </div>
      <div className="device-permission-list">
        {permissions.map(({ key, label, purpose }) => (
          <div className="device-permission-row" key={key}>
            <div>
              <strong>{label}</strong>
              <small>{purpose}</small>
            </div>
            <span>
              {loading
                ? "Wird geprüft …"
                : !states[key]
                  ? "Nicht abrufbar"
                  : states[key].canCheck === false
                    ? "Beim Verwenden prüfen"
                    : permissionLabels[states[key].status]}
              {key === "location" &&
              states[key]?.status === "granted" &&
              states[key]?.precise === false
                ? " · ungefähr"
                : ""}
              {key === "location" &&
              states[key]?.locationServicesEnabled === false
                ? " · Ortungsdienste aus"
                : ""}
            </span>
          </div>
        ))}
      </div>
      <p>
        Für die Fotoauswahl verwenden wir die Systemauswahl einzelner Bilder.
        Ein vollständiger Zugriff auf die Fotobibliothek wird nicht angefordert.
      </p>
      <div className="device-action-buttons">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setLoading(true);
            setRefresh((value) => value + 1);
          }}
        >
          Status aktualisieren
        </button>
        {Capacitor.isNativePlatform() ? (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void openAppSettings().catch(() =>
                setError(
                  "Die App-Einstellungen konnten nicht geöffnet werden. Öffnen Sie die Systemeinstellungen manuell.",
                ),
              )
            }
          >
            App-Einstellungen öffnen
          </button>
        ) : (
          <p>
            Website-Berechtigungen verwalten Sie im Browser neben der
            Adresszeile.
          </p>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
