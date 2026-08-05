# Implementierungsstatus

Stand: 05.08.2026. Repository, produktives Supabase-Projekt und Vercel-Deployment wurden gemeinsam geprüft. „Implementiert“ bedeutet weiterhin nicht, dass externe Dienste oder organisatorische Betriebsfreigaben ohne die dafür nötigen Zugangsdaten abgeschlossen sind.

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

| Prüfung                             | Ergebnis                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                 | erfolgreich                                                                                                                  |
| `npm run lint`                      | erfolgreich, 0 Warnungen erlaubt                                                                                             |
| `npm run format:check`              | erfolgreich                                                                                                                  |
| `npm audit --audit-level=high`      | 0 bekannte Schwachstellen                                                                                                    |
| `npm run test`                      | 14/14 Vitest-Tests erfolgreich                                                                                               |
| `npm run build`                     | erfolgreicher Produktionsbuild einschließlich PWA-Service-Worker                                                             |
| `npm run test:e2e`                  | 10/10 öffentliche Playwright-Läufe erfolgreich: 5 Szenarien auf Desktop und Mobil, einschließlich axe-Prüfung der Loginseite |
| Deno `check` aller 9 Edge Functions | erfolgreich                                                                                                                  |
| Deno-Tests der Shared Edge-Logik    | 7/7 erfolgreich                                                                                                              |
| Supabase DB-Lint `public,private`   | direkt gegen das verknüpfte Projekt erfolgreich, keine Schemafehler                                                          |
| pgTAP gegen das verknüpfte Projekt  | 141/141 Assertions in Rollback-Transaktionen erfolgreich: 54 RLS/Storage, 41 Workflows, 38 RPC-Invarianten, 8 Scheduler      |
| Produktions-CORS/Redirects          | Vercel-Origin, Invite- und Reset-Route live verifiziert                                                                      |

Die Playwright-Suite prüft derzeit ausschließlich öffentliche Auth-/Routing-/Responsive-/Accessibility-Pfade mit dem gebauten Frontend. Sie meldet sich nicht gegen ein echtes Supabase-Staging an und ersetzt keine Mehrrollen- oder RLS-Abnahme.

## Vor produktiver Freigabe noch erforderlich

- [ ] Eigene SMTP-Zugangsdaten in Supabase hinterlegen und die automatische Invite-/Recovery-Mailzustellung mit einer realen externen Mitarbeiteradresse vollständig abnehmen. Mitarbeiter können bis dahin über den geschützten manuellen Einmal-Link eingeladen werden; Site URL, Redirects, Sign-up-Sperre, Passwortregeln und Leak-Prüfung sind bereits produktiv gesetzt.
- [ ] Authentifizierte Mehrrollen-E2E-Szenarien für Mitarbeiter, Teamleitung, Disposition, HR, Fuhrpark, Administration und organisationsfremde Benutzer mit freigegebenen Testkonten automatisieren. Die Datenbankgrenzen selbst sind durch pgTAP abgedeckt.
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

Der technische Stand ist gebaut, migriert und gegen Produktion geprüft. Mitarbeiteranlage und Invite-Annahme funktionieren auch ohne externen SMTP-Dienst über einen geschützten manuellen Einmal-Link. Für den vollständig automatischen Mailversand fehlen weiterhin Betreiber-Zugangsdaten; die App meldet deshalb keinen falschen Versandserfolg und legt den sicheren Fallback offen.
