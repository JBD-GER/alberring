# Alberring – zusätzliche App-Datenschutzerklärung

Stand: 29.09.2026. Die zusätzliche Erklärung ist veröffentlicht:

**https://app.alberring.de/datenschutz**

Die Seite ist ohne Konto erreichbar und auf der Loginseite sowie in den Einstellungen verlinkt. `/privacy` leitet auf die endgültige Adresse weiter. Sie basiert auf den Unternehmensangaben der bestehenden [Alberring-Datenschutzerklärung](https://www.alberring.de/datenschutz/) und ergänzt die tatsächlichen Verarbeitungen der Mitarbeiter-App.

Behandelt werden interne Nutzung mit Einladungspflicht, Mitarbeiter- und Gesundheitsdaten, Chatnachrichten, Dateien, Fotos, Audio und freiwillig geteilter Standort; Geräteberechtigungen, Sitzungsdaten und Betriebsprotokolle; Rechtsgrundlagen, Aufbewahrungskriterien und Betroffenenrechte. Native Push-Mitteilungen sind aktuell deaktiviert, Werbetracking wird nicht verwendet.

Die Dienstleister sind konkret beschrieben:

- **Supabase:** Anmeldung, Datenbank, Dateien und serverseitige Funktionen. Projektregion Frankfurt, ohne eine ausschließlich europäische Verarbeitung zu behaupten.
- **Vercel:** Hosting der Web-App. Die native Oberfläche liegt im installierten App-Paket.
- **Resend:** Einladungen und Konto-E-Mails; Öffnungs- und Klicktracking deaktiviert.

Vertrags-, Datenschutz- und DPA-Seiten der Anbieter sind verlinkt. Der Text bestätigt keine ungeprüften abgeschlossenen Verträge, konkreten Löschfristen oder ausschließlich europäischen Datenflüsse. Tatsächliche Dienstleistervereinbarungen und betriebliche Aufbewahrung müssen zur gelebten Praxis passen.

Technische Veröffentlichung: main-Commit `19aacfdf5e5adf225231fe1e1a0470d73b4b3fff`, Vercel READY. Öffentlicher Abruf, Loginverlinkung und Darstellung bei 390 px Breite geprüft; TypeScript, ESLint und Web-Build erfolgreich. Die URL ist bei Apple hinterlegt; die passenden 13 App-Privacy-Datentypen wurden mit ausdrücklicher Nutzerfreigabe veröffentlicht.

Der frühere Arbeitsentwurf ist durch diese Live-Seite ersetzt. Maßgebliche Textquelle im Projekt: `src/features/legal/Privacy.tsx`.
