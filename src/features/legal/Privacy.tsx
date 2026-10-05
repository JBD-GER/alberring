import { Link } from "react-router";
import "./privacy.css";

export default function Privacy() {
  return (
    <main className="app-privacy">
      <header>
        <Link
          to="/login"
          className="privacy-brand"
          aria-label="Zur Alberring-App"
        >
          <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
        </Link>
        <p className="eyebrow">Mitarbeiter-App · Stand 4. Oktober 2026</p>
        <h1>Datenschutzerklärung</h1>
        <p className="privacy-intro">
          Diese Hinweise erläutern die Verarbeitung personenbezogener Daten in
          der Alberring-Mitarbeiter-App und ihrer Webversion unter
          app.alberring.de. Die App ist ausschließlich für eingeladene,
          berechtigte Mitarbeitende bestimmt. Es gibt keine öffentliche
          Registrierung.
        </p>
      </header>

      <section aria-labelledby="verantwortlicher">
        <h2 id="verantwortlicher">
          1. Verantwortlicher und Datenschutzkontakt
        </h2>
        <address>
          Alberring – Ambulante Pflege GmbH &amp; Co. KG
          <br />
          Werkstraße 4<br />
          28844 Weyhe, Deutschland
          <br />
          Telefon: <a href="tel:+4942038048429">04203 8048429</a>
          <br />
          E-Mail: <a href="mailto:info@alberring.de">info@alberring.de</a>
        </address>
        <p>
          Für Fragen zum Datenschutz können Sie sich an Walter Alberring unter
          den genannten Kontaktdaten wenden. Die Kontaktdaten und die
          allgemeinen Hinweise zu unserer Unternehmenswebsite finden Sie auch in
          der{" "}
          <a href="https://www.alberring.de/datenschutz/">
            Datenschutzerklärung von Alberring
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="zwecke">
        <h2 id="zwecke">2. Zwecke, Daten und Herkunft</h2>
        <p>
          Die App unterstützt die betriebliche Kommunikation, Dienstplanung und
          Personalorganisation. Wir erhalten Daten von Ihnen, von berechtigten
          Kolleginnen und Kollegen sowie aus der betrieblichen Verwaltung.
          Welche Funktionen und Angaben Ihnen angezeigt werden, richtet sich
          nach Ihrer Rolle und Teamzuordnung.
        </p>
        <ul>
          <li>
            <strong>Konto und Mitarbeiterprofil:</strong> Name, E-Mail-Adresse,
            dienstliche Telefonnummer, Profilbild, Benutzerkennung, Rolle, Team,
            Beschäftigungsangaben und gegebenenfalls Geburtsdatum.
          </li>
          <li>
            <strong>Arbeitsorganisation:</strong> Dienstpläne, Urlaubs- und
            Abwesenheitsdaten, Anträge, Freigaben, Dokumente, Lesebestätigungen,
            Fuhrparkmeldungen, Kilometerstände und Materialanforderungen.
          </li>
          <li>
            <strong>Krankmeldungen:</strong> Angaben zur Arbeitsunfähigkeit und
            gegebenenfalls zugehörige Nachweise. Diese können Gesundheitsdaten
            enthalten und werden nur entsprechend der dafür vergebenen
            Berechtigungen zugänglich gemacht. Bitte übermitteln Sie keine
            unnötigen Diagnosen oder Patientendaten.
          </li>
          <li>
            <strong>Kommunikation:</strong> Nachrichten, ausgewählte Fotos,
            Dateien und Sprachnachrichten sowie freiwillig gesendete
            Standortangaben einschließlich genauer Koordinaten.
          </li>
          <li>
            <strong>Schutz und Löschanträge:</strong> Blockierungen, gemeldete
            Nachrichten einschließlich ihrer Anhänge, Meldegründe und
            Bearbeitungsvermerke. Nur die konkret gemeldeten Inhalte werden der
            Administration Ihrer Organisation zur Prüfung zugänglich gemacht;
            dies gibt keinen allgemeinen Zugriff auf private Chats. Bei
            Löschanträgen speichern wir Eingang, Frist, Kontaktadresse und den
            Bearbeitungsnachweis.
          </li>
          <li>
            <strong>Technischer Betrieb:</strong> Anmelde- und
            Sitzungsinformationen, IP-Adresse, Geräte- bzw.
            Browserinformationen, Zeitpunkte, Fehler- und Sicherheitsprotokolle
            sowie Protokolle betrieblicher Aktionen.
          </li>
        </ul>
        <p>
          Die App dient nicht der Patientendokumentation, Diagnose oder
          medizinischen Beratung. Wir setzen in der App keine Werbung und kein
          Werbetracking ein. Es findet keine ausschließlich automatisierte
          Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung statt.
        </p>
      </section>

      <section aria-labelledby="grundlagen">
        <h2 id="grundlagen">3. Rechtsgrundlagen und erforderliche Angaben</h2>
        <p>
          Soweit die Verarbeitung für die Durchführung des
          Beschäftigungsverhältnisses erforderlich ist, erfolgt sie auf
          Grundlage von § 26 Abs. 1 BDSG. Gesetzliche Pflichten können eine
          Verarbeitung nach Art. 6 Abs. 1 Buchst. c DSGVO erforderlich machen.
          Gesundheitsdaten zur Erfüllung arbeits- und sozialrechtlicher
          Pflichten unterliegen insbesondere Art. 9 Abs. 2 Buchst. b DSGVO in
          Verbindung mit § 26 Abs. 3 BDSG. Maßgeblich sind jeweils der konkrete
          Zweck und die gesetzlichen Voraussetzungen.
        </p>
        <p>
          Technische Sicherheits- und Betriebsmaßnahmen dienen unserem
          berechtigten Interesse an einer verlässlichen, gegen Missbrauch
          geschützten Anwendung (Art. 6 Abs. 1 Buchst. f DSGVO). Soweit eine
          Verarbeitung auf Ihrer gesonderten Einwilligung beruht, ist Art. 6
          Abs. 1 Buchst. a DSGVO maßgeblich; Sie können diese mit Wirkung für
          die Zukunft widerrufen. Geräteberechtigungen sind keine pauschale
          Einwilligung in sämtliche Datenverarbeitungen.
        </p>
        <p>
          Ohne die für Konto und Berechtigungen erforderlichen Angaben können
          wir keinen App-Zugang bereitstellen. Welche Beschäftigtendaten Sie
          gesetzlich oder vertraglich bereitstellen müssen und welche
          alternativen Meldewege bestehen, erläutert Ihnen die Verwaltung.
          Optionale Kamera-, Mikrofon- und Standortfunktionen können Sie
          ablehnen.
        </p>
      </section>

      <section aria-labelledby="berechtigungen">
        <h2 id="berechtigungen">4. Gerätefunktionen und lokale Speicherung</h2>
        <p>
          Kamera, Mikrofon und Standort werden erst im Zusammenhang mit einer
          von Ihnen gewählten Funktion angefragt. Fotos, Dateien und
          Sprachaufnahmen werden nach Ihrer Sendeaktion übertragen.
          Standortdaten werden nur beim aktiven Teilen erfasst; die App führt
          keine Hintergrundortung durch. Empfänger einer gesendeten Nachricht
          können die darin enthaltenen Informationen sehen. Beim Öffnen eines
          externen Kartenlinks gelten zusätzlich die Hinweise des
          Kartenanbieters.
        </p>
        <p>
          Sie können Geräteberechtigungen in den Einstellungen Ihres Geräts
          ändern. Die Ablehnung beschränkt die jeweilige Funktion. Die App
          speichert technisch erforderliche Sitzungsinformationen und
          Einstellungen auf Ihrem Gerät, damit Anmeldung und Bedienung
          funktionieren. Die Webversion kann Programmdateien lokal
          zwischenspeichern. Für erforderliche Speicherung und Zugriffe gilt §
          25 Abs. 2 TDDDG. Abmelden beendet die App-Sitzung; ein Löschen der App
          entfernt nicht automatisch die betrieblichen Daten auf dem Server.
        </p>
        <p>
          Native Push-Mitteilungen sind in der aktuellen iOS-Version
          deaktiviert.
        </p>
      </section>

      <section aria-labelledby="dienstleister">
        <h2 id="dienstleister">5. Empfänger und technische Dienstleister</h2>
        <p>
          Betriebsdaten sind innerhalb von Alberring für die jeweils
          berechtigten Empfänger, Teams und Verwaltungsrollen zugänglich. Für
          die technische Bereitstellung verwenden wir folgende Dienste:
        </p>
        <h3>Supabase: Anmeldung, Datenbank und Dateiablage</h3>
        <p>
          Supabase stellt die Benutzeranmeldung, die Datenbank, Dateiablage und
          serverseitige Funktionen bereit. Dort werden die für die jeweiligen
          App-Funktionen benötigten Konto- und Inhaltsdaten verarbeitet. Das
          App-Projekt nutzt die Region Frankfurt (eu-central-1). Support,
          Verwaltung und Unterauftragnehmer können weitere Verarbeitungsorte
          einschließen. Informationen:{" "}
          <a href="https://supabase.com/privacy">Supabase Datenschutz</a>
          {" · "}
          <a href="https://supabase.com/legal/dpa">
            Datenverarbeitungsbedingungen
          </a>
          .
        </p>
        <h3>Vercel: Bereitstellung der Web-App</h3>
        <p>
          Vercel stellt die Web-App unter app.alberring.de bereit. Bei deren
          Abruf werden insbesondere IP-Adresse, angeforderte Adresse, Zeitpunkt
          und technische Verbindungsinformationen verarbeitet. Die native
          iOS-Oberfläche ist Bestandteil des installierten App-Pakets;
          Betriebsdaten werden über Supabase geladen. Informationen:{" "}
          <a href="https://vercel.com/legal/privacy-notice">
            Vercel Datenschutz
          </a>
          {" · "}
          <a href="https://vercel.com/legal/dpa">
            Datenverarbeitungsbedingungen
          </a>
          .
        </p>
        <h3>Resend: Einladungen und Konto-E-Mails</h3>
        <p>
          Über Resend (Plus Five Five, Inc.) versenden wir in Verbindung mit
          Supabase Auth Einladungen und E-Mails zum Zurücksetzen des Passworts.
          Dabei werden E-Mail-Adresse, erforderliche Nachrichteninhalte
          einschließlich des jeweiligen Bestätigungslinks sowie Zustell- und
          Fehlerdaten verarbeitet. Öffnungs- und Klicktracking sind für diese
          Nachrichten deaktiviert. Informationen:{" "}
          <a href="https://resend.com/legal/privacy-policy">
            Resend Datenschutz
          </a>
          {" · "}
          <a href="https://resend.com/legal/dpa">
            Datenverarbeitungsbedingungen
          </a>
          .
        </p>
        <p>
          Bei den genannten Anbietern und ihren Unterauftragnehmern können
          Verarbeitungen außerhalb des Europäischen Wirtschaftsraums,
          insbesondere in den USA, stattfinden. Eine gewählte EU-Serverregion
          schließt dies nicht für alle Dienste aus. Solche Übermittlungen
          benötigen die Voraussetzungen der Art. 44 ff. DSGVO, etwa einen
          anwendbaren Angemessenheitsbeschluss oder geeignete Garantien wie
          EU-Standardvertragsklauseln. Angaben zu den für Ihre Daten
          eingesetzten Empfängern und Garantien sowie Kopien der maßgeblichen
          Garantien erhalten Sie über unseren Datenschutzkontakt.
        </p>
        <p>
          Für den Download über den App Store verarbeitet Apple Daten in eigener
          Verantwortung nach den dort geltenden Datenschutzhinweisen. Der
          Installationslink allein ermöglicht keinen Zugriff auf interne
          Inhalte.
        </p>
      </section>

      <section aria-labelledby="speicherdauer">
        <h2 id="speicherdauer">6. Speicherdauer und Löschung</h2>
        <p>
          Die Speicherdauer richtet sich nach dem jeweiligen betrieblichen Zweck
          und gesetzlichen Aufbewahrungspflichten. Maßgeblich sind bei
          Kontodaten die Dauer der Zugangsberechtigung, bei Personal- und
          Abwesenheitsunterlagen die Bearbeitung und erforderliche Nachweise,
          bei Nachrichten und Dateien deren betrieblicher Zweck und bei
          technischen Protokollen die Betriebs- und Sicherheitsanforderungen.
          Erforderliche Aufbewahrung zur Geltendmachung oder Abwehr von
          Rechtsansprüchen kann hinzukommen.
        </p>
        <p>
          Entfällt der Zweck und besteht keine Aufbewahrungspflicht mehr, werden
          Daten gelöscht oder ihre Verarbeitung eingeschränkt. Kontosperrung und
          Löschung sämtlicher verknüpfter Betriebsdaten sind unterschiedliche
          Vorgänge. Auch Sicherungskopien und die Aufbewahrungszyklen der
          Dienstleister sind zu berücksichtigen. Die Kontolöschung können Sie
          unter „Einstellungen → Konto löschen“ direkt in der App beantragen.
          Die Administration bearbeitet den Antrag innerhalb von 7 Tagen und
          bestätigt den Abschluss an Ihre hinterlegte E-Mail-Adresse. Konto und
          zugehörige personenbezogene Daten werden gelöscht; gesetzlich
          erforderliche Aufbewahrung wird auf die nötigen Daten beschränkt und
          in der Bestätigung erläutert. Auskunft zur Speicherdauer Ihrer
          konkreten Daten erhalten Sie über den Datenschutzkontakt.
        </p>
      </section>

      <section aria-labelledby="rechte">
        <h2 id="rechte">7. Ihre Rechte</h2>
        <p>
          Sie haben nach Maßgabe der gesetzlichen Voraussetzungen Rechte auf
          Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und
          Datenübertragbarkeit. Bei einer Verarbeitung auf Grundlage
          berechtigter Interessen können Sie aus Gründen Ihrer besonderen
          Situation Widerspruch einlegen. Eine erteilte Einwilligung können Sie
          jederzeit für die Zukunft widerrufen; die vorherige Verarbeitung
          bleibt davon unberührt.
        </p>
        <p>
          Wenden Sie sich dafür an{" "}
          <a href="mailto:info@alberring.de">info@alberring.de</a> oder an die
          oben genannte Postanschrift. Außerdem können Sie sich bei einer
          Datenschutzaufsichtsbehörde beschweren, insbesondere beim{" "}
          <a href="https://www.lfd.niedersachsen.de/">
            Landesbeauftragten für den Datenschutz Niedersachsen
          </a>
          .
        </p>
      </section>
      <footer>
        <Link to="/login">Zur App</Link>
        <a href="https://www.alberring.de/pflegedienst_weyhe_impressum/">
          Impressum
        </a>
        <a href="https://www.alberring.de/datenschutz/">
          Datenschutz der Unternehmenswebsite
        </a>
      </footer>
    </main>
  );
}
