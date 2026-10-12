import { useState } from "react";
import { Link } from "react-router";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { androidRelease } from "./release";
import "./download.css";

export default function AndroidDownload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      // Storage RLS also checks active employee and organization status.
      // Fetch with the employee session; never generate a shareable signed URL.
      const result = await supabase.storage
        .from("app-releases")
        .download(`android/${androidRelease.filename}`);
      if (result.error || !result.data) throw result.error;
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = androidRelease.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Allow the browser to start the download before releasing the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(
        "Der Download konnte nicht gestartet werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="android-download">
      <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
      <span className="eyebrow">Nur für Mitarbeitende</span>
      <h1>Alberring für Android</h1>
      <p>
        Installieren Sie die Mitarbeiter-App direkt auf Ihrem Android-Handy.
        Eine Anmeldung bei Google oder eine Tester-Einladung ist nicht nötig.
      </p>
      <p className="muted">
        Version {androidRelease.version} ({androidRelease.build}) · Android 7.0
        oder neuer
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />{" "}
        {busy ? "Download wird vorbereitet …" : "Android-App herunterladen"}
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <section>
        <h2>So installieren Sie die App</h2>
        <ol>
          <li>
            Öffnen Sie diese Seite auf Ihrem Android-Handy und laden Sie die
            Datei herunter.
          </li>
          <li>
            Öffnen Sie die heruntergeladene Datei. Erlauben Sie Ihrem Browser
            die Installation dieser App, wenn Android danach fragt.
          </li>
          <li>
            Tippen Sie auf „Installieren“. Öffnen Sie danach Alberring und
            melden Sie sich mit Ihren bestehenden Zugangsdaten an.
          </li>
        </ol>
        <p>
          Sie können die Installationsberechtigung des Browsers anschließend
          wieder ausschalten.
        </p>
      </section>
      <section>
        <h2>Spätere Updates</h2>
        <p>
          Ab Version 1.0.4 informiert Sie die Android-App automatisch über
          verfügbare Updates. Tippen Sie im Hinweis auf „Update herunterladen“.
        </p>
        <p>
          Öffnen Sie wieder <strong>app.alberring.de/android</strong> und
          installieren Sie die neue Datei über die vorhandene App. Updates
          werden nicht automatisch über Google Play installiert. Ihre
          gespeicherten Daten bleiben beim Aktualisieren erhalten.
        </p>
      </section>
      <details>
        <summary>Bereits die Google-Play-Testversion installiert?</summary>
        <p>
          Entfernen Sie einmalig die bisherige Play-Testversion, bevor Sie diese
          Direktversion installieren. Die beiden Vertriebswege verwenden
          unterschiedliche Signaturen. Ihre Daten auf dem Server bleiben
          erhalten; lokale, noch nicht gesendete Entwürfe gehen beim Entfernen
          verloren. Danach melden Sie sich erneut an.
        </p>
      </details>
      <p>
        <Link to="/installation">Zur Geräteauswahl</Link> ·{" "}
        <Link to="/app/dashboard">Alberring im Browser öffnen</Link> ·{" "}
        <Link to="/datenschutz">Datenschutz</Link>
      </p>
    </main>
  );
}
