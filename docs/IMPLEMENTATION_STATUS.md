# Implementierungsstatus

Stand: 10.07.2026. „Implementiert“ bedeutet hier: Quellcode, Datenmodell und UI-Pfad sind im Repository vorhanden. Es bedeutet ausdrücklich nicht, dass die Komponenten bereits in einem produktiven Supabase-Projekt deployed, mit echten Rollen abgenommen oder organisatorisch freigegeben wurden.

## Im Repository implementiert

- [x] React 19, striktes TypeScript, Vite, React Router, TanStack Query, React Hook Form/Zod und date-fns
- [x] Responsives App-Shell mit Desktop-Sidebar, mobiler Bottom-Navigation, Permission-Gates, Safe-Area-/Touch-Optimierung und installierbarer PWA
- [x] Supabase Auth für Login, Session-Wiederherstellung, Logout, neutralen Passwort-Reset und Invite-Annahme; keine öffentliche Registrierung
- [x] Dashboard, Mitarbeiterverzeichnis, Benachrichtigungen, Profil und persönliche Einstellungen
- [x] Direkt- und Gruppenchats mit Suche/Filtern, ungelesenen Zählern, Realtime, Antworten, Reaktionen, Bearbeiten/Zurückziehen, Pins, Lesestatus sowie privaten Bild-/PDF-Anhängen
- [x] News-Feed und Detailansicht mit Zielgruppe Organisation/Team, Entwurf, Bearbeitung, geplanter oder direkter Veröffentlichung, Archivierung, Lesen und Bestätigen
- [x] Einsatzplanung mit Agenda-, Wochen- und Monatsansicht, Teamfiltern, Erstellen/Bearbeiten/Stornieren, Konfliktprüfung und Einsatzbestätigung
- [x] Urlaubsworkflow mit Antrag, Rücknahme, berechneten Arbeitstagen, Freigabe/Ablehnung und Verlauf
- [x] Krankmeldungsworkflow mit Verlängerung, Statusbearbeitung und besonders geschütztem Attest-Upload/-Download
- [x] Dokumente mit Kategorien, Zielgruppen, privatem Upload, Detailansicht, Versionen, Archivierung, Download und Bestätigung
- [x] Fuhrpark mit Fahrzeugen, Zuordnungen, Kilometerständen, Schäden, Wartungen und Admin-Prüfpfaden
- [x] Materialanforderungen mit Entwurf, Einreichung, Status-/Freigabeworkflow und Verlauf
- [x] Administration für Einladungen, Kontostatus, Benutzerrollen/-teams, Rollenrechte, Teams, Systemeinstellungen, Audit und Integrationen
- [x] Organisationsgebundenes Supabase-Schema, RLS-/Storage-Policies, maskierende Lese-RPCs, transaktionale Workflow-RPCs, Audit-Logs und private Buckets
- [x] Edge-Function-Quellen für Benutzeranlage/-status/erneute Einladung, sichere Downloads, Careville-Konfigurationstest, Geburtstags-/Kilometererinnerung, geplante News und Notification-Batches
- [x] Referenzdaten, Setup-Bundles für frische und bestehende Projekte, CI, PWA-Updatehinweis, Security-Header und Betriebsdokumentation

## In diesem Arbeitsstand erfolgreich ausgeführt

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` | erfolgreich |
| `npm run lint` | erfolgreich, 0 Warnungen erlaubt |
| `npm run test` | 9/9 Vitest-Tests erfolgreich |
| `npm run build` | erfolgreicher Produktionsbuild einschließlich PWA-Service-Worker |
| `npm run test:e2e` | 10/10 öffentliche Playwright-Läufe erfolgreich: 5 Szenarien auf Desktop und Mobil, einschließlich axe-Prüfung der Loginseite |
| Deno `check` aller 9 Edge Functions | erfolgreich |
| `npx supabase db reset` | nicht ausgeführt; Docker steht in dieser Arbeitsumgebung nicht zur Verfügung |
| `npx supabase test db` | nicht ausgeführt; die vorhandenen 22 pgTAP-Prüfungen sind daher noch kein bestätigter Laufnachweis |

Die Playwright-Suite prüft derzeit ausschließlich öffentliche Auth-/Routing-/Responsive-/Accessibility-Pfade mit dem gebauten Frontend. Sie meldet sich nicht gegen ein echtes Supabase-Staging an und ersetzt keine Mehrrollen- oder RLS-Abnahme.

## Vor produktiver Freigabe noch erforderlich

- [ ] Das passende SQL-Bundle auf das tatsächliche Zielprojekt anwenden und Migration, Bootstrap, Buckets, Realtime und RPCs dort verifizieren.
- [ ] Auth-Produktionskonfiguration abschließen: Sign-ups aus, Passwortregeln, Site-/Redirect-URLs, eigene SMTP-Zugangsdaten und reale Invite-/Recovery-Mailtests.
- [ ] Alle Edge Functions und Secrets deployen sowie die vier Automationsjobs als überwachte Cron-Aufrufe konfigurieren.
- [ ] Die pgTAP-Suite mit Docker ausführen und echte Supabase-E2E-Szenarien für Mitarbeiter, Teamleitung, Disposition, HR, Fuhrpark, Administration und organisationsfremde Benutzer ergänzen.
- [ ] E-Mail- und Push-Provider für fachliche Benachrichtigungen auswählen, datenschutzrechtlich freigeben und implementieren. Aktuell ist nur In-App-Zustellung aktiv; andere Kanäle werden bewusst übersprungen.
- [ ] Das echte Betreiber-Gebäudebild unter `src/assets/brand/building.jpg` bereitstellen und visuell abnehmen. Bis dahin bleibt die gestaltete Markenfläche ohne Stockfoto bestehen.
- [ ] Produktionsbetrieb absichern: Backup/PITR und Restore-Probe, Monitoring/Alarmierung, MFA für privilegierte Rollen, Rate Limits, Aufbewahrungs-/Löschkonzept, Datenschutzfreigabe und Incident-Verantwortlichkeiten.
- [ ] Careville erst nach Erhalt offizieller API-Dokumentation und Zugänge implementieren. Der Adapter bleibt korrekt im Zustand `NotConfigured`; MediFox ist bewusst nicht angebunden.
- [ ] Für echte App-Store-Auslieferung Capacitor-Projekte, native Push-/Deep-Link-/Secure-Storage-Adapter, Signing und Store-Pipelines ergänzen. Der aktuelle Stand ist eine installierbare PWA, keine native iOS-/Android-App.

## Weitere bekannte Ausbaupunkte

- Die PWA cached nur die unkritische App-Shell; eine belastbare Offline-Sendequeue für Fachaktionen oder Chatnachrichten ist noch nicht implementiert.
- Suchen und Filter sind in den Kernmodulen vorhanden; eine globale, modulübergreifende Suche und durchgängige Breadcrumb-Navigation fehlen noch.
- Last-, Restore-, Penetrations- und manuelle Accessibility-Tests mit realen Daten/Rollen stehen noch aus.
- Onboarding ist nur als deaktiviertes Feature-Flag und Datenmodell vorbereitet, wie für den ersten Release vorgesehen.

Damit ist der Entwicklungsstand umfangreich und lokal baubar, aber noch nicht ehrlich als „komplett produktionsfertig“ zu bezeichnen. Der letzte Schritt ist nicht weiteres Mock-up, sondern die reale Supabase-/SMTP-/Cron-Konfiguration und eine rollenbasierte Staging-Abnahme.
