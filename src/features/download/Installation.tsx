import { Apple, Monitor, Smartphone } from "lucide-react";
import { Link } from "react-router";
import distribution from "../../../mobile-distribution.json";
import "./download.css";

export default function Installation() {
  return (
    <main className="android-download installation-page">
      <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
      <span className="eyebrow">Ihr Mitarbeiterzugang ist aktiv</span>
      <h1>Wie möchten Sie Alberring nutzen?</h1>
      <p>
        Ein Konto für alle Geräte: Melden Sie sich überall mit derselben
        E-Mail-Adresse und Ihrem festgelegten Passwort an. Dienstplan,
        Nachrichten und Dokumente gehören zu demselben Mitarbeiterkonto.
      </p>
      <div className="installation-options">
        <section>
          <Monitor aria-hidden="true" />
          <h2>Im Browser</h2>
          <p>Direkt loslegen, ohne etwas zu installieren.</p>
          <Link className="primary" to="/app/dashboard">
            Webanwendung öffnen
          </Link>
        </section>
        <section>
          <Smartphone aria-hidden="true" />
          <h2>Android</h2>
          <p>
            Die App aus dem geschützten Bereich installieren. Eine zusätzliche
            Google-Einladung ist nicht nötig.
          </p>
          <Link className="primary" to="/android">
            Android-App installieren
          </Link>
        </section>
        <section>
          <Apple aria-hidden="true" />
          <h2>iPhone und iPad</h2>
          {distribution.iosAppStoreUrl ? (
            <>
              <p>Die App über den freigegebenen App-Store-Link installieren.</p>
              <a className="primary" href={distribution.iosAppStoreUrl}>
                Im App Store öffnen
              </a>
            </>
          ) : (
            <p>
              Die App wartet noch auf Apples Freigabe. Bis dahin können Sie
              Alberring auch auf dem iPhone und iPad im Browser nutzen.
            </p>
          )}
        </section>
      </div>
      <p>
        Sie können später jederzeit zwischen den Geräten wechseln. Nach der
        Installation melden Sie sich in der App erneut mit demselben Konto an.
        Eine weitere Kontoerstellung ist nicht nötig.
      </p>
      <p>
        <Link to="/datenschutz">Datenschutz</Link>
      </p>
    </main>
  );
}
