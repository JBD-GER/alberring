# Implementierungsstatus

Letzte Veröffentlichung und Produktionsprüfung: 16.09.2026. Die erste Feedbackrunde zur Urlaubsfreigabe und Benutzerverwaltung ist auf der regulären Live-Adresse veröffentlicht; auch die anschließende Telefonat-Ergänzung ist nach ausdrücklicher Freigabe veröffentlicht. Frühere Prüfstände bleiben unten als historischer Nachweis erhalten. „Implementiert“ bedeutet weiterhin nicht, dass externe Dienste oder organisatorische Betriebsfreigaben ohne die dafür nötigen Zugangsdaten abgeschlossen sind.

## Telefonat-Ergänzung vom 16.09.2026 - veröffentlicht

Die Veröffentlichung erfolgte nach der ausdrücklichen Freigabe „okay launch es jetzt“. Datenbank, fünf betroffene Edge Functions und das Frontend sind produktiv bereitgestellt. Deployment `dpl_Dfj4GBtsZ6j8cKsgNR5QoCwowdUW` ist READY. Details und Aussagegrenzen: [Veröffentlichungsnachweis](VEROEFFENTLICHUNG_2026-09-16.md).

- Super Admins bearbeiten Mitarbeiter-Stammdaten und die Anmelde-E-Mail getrennt. Die E-Mail-Änderung sendet keine Nachricht, invalidiert vorherige Auth-Links und behandelt Fehler zwischen Auth-API und Fachprofil mit Zustandsprüfung und Kompensation.
- Allgemeine Benutzerlöschung entfernt die Auth-Identität und den Zugang, behält jedoch Profil-ID und sämtliche Fachverweise. Nachrichten bleiben unter „Gelöschter Benutzer“ sichtbar. Auch der frühere Einladungs-Löschendpunkt verwendet jetzt diese datenerhaltende Semantik. Die darunter dokumentierte frühere Regel gilt nur für den historischen Live-Stand.
- Nur Super Admin, Mitarbeiter und Teamleitung bleiben aktiv und zuweisbar. Frühere Rollen bleiben als deaktivierte historische Datensätze bestehen; keine stillschweigende Rollenumbuchung.
- Neue Super-Admin-Korrekturen für Urlaub, Krankheit, Material, Dokumentangaben/Ordnernamen sowie Wartungen, Schäden und Kilometerstände. Vorher/Nachher-Audit; Korrekturgründe bei Fachdaten-RPCs. Bestehende Identitäten, Workflowentscheidungen und Dateien werden nicht stillschweigend ersetzt.
- Neue Migrationen: `20260916080044`, `20260916080136`, `20260916080152`, `20260916080340` sowie `20260916101245` zum Abgleich dreier technischer Ausführungsrechte. Neue Edge Functions: `admin-update-employee`, `admin-update-employee-email`, `admin-delete-user`; angepasste Kompatibilitäts-/Resend-Funktionen.

Historische lokale Abnahmedokumentation: [KUNDENFEEDBACK_2026-09-16.md](KUNDENFEEDBACK_2026-09-16.md) und `output/pdf/Alberring_Projektdokumentation_Kundenfeedback_2026-09-16.pdf`. Testbelege und Quellprüfsummen werden in `output/pdf/Alberring_Quellnachweis_2026-09-16.json` festgehalten. Keine echten Mitarbeiter wurden geändert/gelöscht oder angeschrieben. Nach dem Rechteabgleich sind 506 SQL-Prüfungen grün; live stimmen 39 Funktionen einschließlich Rechten und alle 68 statischen Dateien mit dem geprüften Stand überein. Öffentliche Live-Seiten sind mobil und am Desktop geprüft.

## Feedback vom 16.09.2026 – veröffentlicht

- Eine Urlaubsfreigabe genügt. Admins/Super Admins mit `leave.manage` können eigene und fremde Anträge entscheiden. Gewöhnliche Freigaberollen behalten die Sperre eigener Entscheidungen.
- Bestehende offene Anträge benötigen keine zweite Person mehr, werden aber nicht automatisch genehmigt. Bereits erteilte Entscheidungen bleiben erhalten; ein weiterer ausdrücklicher Klick auf „Genehmigen“ schließt den Antrag ab. Die optionalen zwei Stufen gelten bei einer späteren Umstellung für neu erfasste Anträge.
- „Einladung erneut senden“ ist in der Benutzerliste beschriftet und erklärt. Automatischer E-Mail-Versand und geschützter manueller Einmal-Link bleiben als bestehende Zustellwege erhalten.
- „Fehleintrag löschen“ entfernt ausschließlich unbestätigte, nie genutzte Einladungen ohne Fachhistorie oder Dateien. Mandant, Rechte, eigene Identität, Super-Admin-Schutz und laufender Einladungsversand werden serverseitig geprüft. Profil und Auth-Konto werden atomar gelöscht; der Audit-Eintrag bleibt bestehen. Genutzte Konten werden archiviert.

Veröffentlicht unter [alberringapp.vercel.app](https://alberringapp.vercel.app), Deployment `dpl_9VmfwR3ZymFcHmZefJCEtgXSuP2H` (READY, Produktion). Die drei Migrationen `20260916073726`, `20260916073729` und `20260916074424` sowie `admin-delete-invited-user` sind produktiv bereitgestellt. Vorher wurden Schema und öffentliche Anwendungsdaten privat gesichert.

Erfolgreich geprüft: 72 Vitest-Tests, insgesamt 381 pgTAP-Prüfungen im finalen Testbestand (vollständiger Lauf mit 380 Prüfungen und gezielter Wiederholung der auf 27 erweiterten Löschsuite), 11 Deno-Tests, Typprüfung, ESLint, Formatierung der geänderten Dateien, Produktionsbuild und 12 öffentliche Browserprüfungen. Zusätzlich 8 transaktionale Prüfungen der Urlaubs-Datenmigration. Lokale Browserprüfungen mit vollständig simulierten Backend-Antworten bei 390 und 1440 Pixeln prüfen erneute Einladung, manuellen Link, Löschabbruch/-bestätigung und finale Einzelfreigabe ohne Überlauf oder JavaScript-Fehler. Sie ersetzen keine echte externe E-Mail-Zustellprüfung.

Live stimmen HTML, Service Worker, Admin-/Urlaubsmodul und CSS mit dem geprüften Build überein; die vier geänderten Datenbankfunktionen wurden per Definitions-Hash mit der getesteten lokalen Version abgeglichen. Die Organisation steht auf einer Freigabe; die zwei zuvor offenen Anträge sind weiterhin offen und besitzen keinen weiteren ausstehenden zweiten Schritt. Es wurden keine echten Mitarbeiterkonten gelöscht, Einladungen verschickt oder Urlaubsanträge genehmigt. Der neue Löschendpunkt verweigert unauthentifizierte Anfragen; der Vercel-Fehlerlog-Scan war leer.

Datenbank-Lint und Security-Advisors melden keine Fehler. Ein neuer Hinweis zum Suchpfad der Lösch-RPC wurde behoben. Die bestehenden Hinweise auf [bewusst authentifiziert aufrufbare Definer-RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) und die [ohne Client-Policies gesperrte Job-Log-Tabelle](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) bleiben dokumentiert; die Fachberechtigungen werden innerhalb der RPCs geprüft.

Die Admin-Anleitung liegt unter `output/pdf/Alberring_Aenderungen_Adminanleitung_2026-09-16.pdf`. Bereits geöffnete App-Sitzungen bitte über „Aktualisieren“ übernehmen oder vollständig neu öffnen.

## Feedback vom 08.09.2026 – veröffentlicht

- Teams mit Mitgliederauswahl erstellen und bestehende Mitgliedschaften bearbeiten.
- Rollen direkt aus der Benutzerliste ändern und die gesamte Auswahl in einer Transaktion speichern; Super Admins mit vollständigen effektiven Rechten.
- Urlaub und Krankmeldungen ausschließlich durch Admins oder Super Admins für ausgewählte Mitarbeitende erfassen. Mitarbeitende behalten ihre lesende eigene Übersicht.
- Chatdetails mit nachträglicher Mitgliederverwaltung und privaten, änderbaren Gruppenbildern wie bei WhatsApp.
- Berechtigungen in laufenden Sitzungen beim Fokuswechsel und regelmäßig aktualisieren.

Veröffentlicht unter [alberringapp.vercel.app](https://alberringapp.vercel.app), Vercel-Deployment `dpl_2kp2yuN8nMfMDTyUyP5NLuPznzPa` (READY, Produktion). Deployment-URL: `https://alberringapp-9icebcvm7-flaaq-holding-gmb-h.vercel.app`.

Die Datenbankmigration `20260908090936_simplify_roles_teams_and_communication.sql` war bereits manuell live eingespielt. Alle 30 betroffenen Funktionsdefinitionen einschließlich Ausführungsrechten, drei Storage-Policies, die Bildspalte und der private Bucket wurden mit der getesteten Version abgeglichen. Nach einem privaten Schema-/Datenbackup wurde ausschließlich der fehlende Eintrag in der Migrationshistorie ergänzt; die Migration wurde nicht erneut auf Anwendungsdaten angewendet.

Der Build mit den verifizierten Produktionsvariablen wurde zunächst bereitgestellt und anschließend auf die reguläre Live-Adresse umgeschaltet. HTML, Service Worker sowie die vier geänderten Fachmodule stimmen mit dem gebauten Artefakt überein. Öffentliche Login-/Reset-Seiten wurden live auf Desktop und Mobil ohne Browserfehler geprüft; der Fehlerlog-Scan für dieses Deployment lieferte keine Einträge. Authentifizierte Fachabläufe wurden zuvor lokal geprüft, ohne Produktions-Testkonten oder Testdatensätze anzulegen. Bereits geöffnete PWA-Sitzungen müssen die angebotene Aktualisierung übernehmen oder vollständig neu geöffnet werden.

Lokal am 08.09.2026 erfolgreich geprüft:

- Typprüfung, ESLint, Prettier, Produktionsbuild und `git diff --check`.
- 36/36 Vitest-Tests, darunter Rollen-/Teamauswahl, Admin-Erfassung, Rechteaktualisierung, Chatmitglieder und Gruppenbilder.
- 316/316 pgTAP-Prüfungen in acht Dateien, davon 53 neue Prüfungen für dieses Feedback; Datenbank-Lint und Sicherheits-Advisors ohne Befund.
- 12/12 öffentliche Playwright-Läufe auf Desktop und Mobil.
- Authentifizierte Browserprüfung mit ausschließlich lokalen Testkonten: Teams erstellen und Mitglieder ändern, Rollenwechsel einschließlich Super Admin, Abwesenheiten für andere Personen erfassen und die Mitarbeiteransicht ohne Erfassungsaktionen. Gruppenchats und Teamkanäle wurden mit nachträglichem Hinzufügen/Entfernen von Mitgliedern, teamfremden Vertretungen sowie Gruppenbild-Upload/-Anzeige/-Entfernung geprüft; normale Chatmitglieder erhalten keine Verwaltungsaktionen. Gespeicherte Daten wurden nach Neuladen geprüft; die geprüften mobilen Ansichten passen in 390 Pixel Breite.

Die SQL-Setup-Bundles sind neu erzeugt; Frontend und Migrationshistorie sind veröffentlicht. Bei der mobilen Gesamtansicht meldete die Accessibility-Prüfung bestehende Kontrastprobleme an fünf Beschriftungen der gemeinsamen unteren Navigation; die neuen Verwaltungsformulare hatten keinen automatisierten Befund.

## Im Repository implementiert

- [x] React 19, striktes TypeScript, Vite, React Router, TanStack Query, React Hook Form/Zod und date-fns
- [x] Responsives App-Shell mit Desktop-Sidebar, mobiler Bottom-Navigation, Permission-Gates, Safe-Area-/Touch-Optimierung und installierbarer PWA
- [x] Supabase Auth für Login, Session-Wiederherstellung, Logout, neutralen Passwort-Reset und Invite-Annahme; keine öffentliche Registrierung
- [x] Siebenstufiges Erst-Onboarding ausschließlich für das serverseitig doppelt geprüfte Konto `info@alberring.de`, einschließlich Organisation, Admin-Profil, mehrerer Teams, erster Mitarbeiter-Einladungen, sicherer Wiederaufnahme, Workflow-Regeln und Benachrichtigungsvorgaben
- [x] Interaktive, routenbezogene „Mission Control“-Produkttour nach dem Onboarding mit Spotlight, echtem Einrichtungsstatus, mobilem Bottom-Sheet, serverseitigem Fortschritt/Aufschub und dauerhaftem manuellen Tourzugang nur für `info@alberring.de`
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

## Bei der Produktionsprüfung am 05.08.2026 erfolgreich ausgeführt

| Prüfung                             | Ergebnis                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                 | erfolgreich                                                                                                                                                                      |
| `npm run lint`                      | erfolgreich, 0 Warnungen erlaubt                                                                                                                                                 |
| `npm run format:check`              | erfolgreich                                                                                                                                                                      |
| `npm audit --audit-level=high`      | 0 bekannte Schwachstellen                                                                                                                                                        |
| `npm run test`                      | 19/19 Vitest-Tests erfolgreich                                                                                                                                                   |
| `npm run build`                     | erfolgreicher Produktionsbuild einschließlich PWA-Service-Worker                                                                                                                 |
| `npm run test:e2e`                  | 12/12 öffentliche Playwright-Läufe erfolgreich: 6 Szenarien auf Desktop und Mobil, einschließlich axe-Prüfung der Loginseite                                                     |
| Deno `check` aller 9 Edge Functions | erfolgreich                                                                                                                                                                      |
| Deno-Tests der Shared Edge-Logik    | 7/7 erfolgreich                                                                                                                                                                  |
| Supabase DB-Lint `public,private`   | direkt gegen das verknüpfte Projekt erfolgreich, keine Schemafehler                                                                                                              |
| pgTAP gegen das verknüpfte Projekt  | 263/263 Assertions in Rollback-Transaktionen erfolgreich: 54 RLS/Storage, 41 Workflows, 38 RPC-Invarianten, 34 Data-API-Rechte, 8 Scheduler, 51 Onboarding, 37 Exklusivität/Tour |
| Produktions-CORS/Redirects          | Vercel-Origin, Invite- und Reset-Route live verifiziert                                                                                                                          |

Die Playwright-Suite prüft derzeit ausschließlich öffentliche Auth-/Routing-/Responsive-/Accessibility-Pfade mit dem gebauten Frontend. Sie meldet sich nicht gegen ein echtes Supabase-Staging an und ersetzt keine Mehrrollen- oder RLS-Abnahme.

## Vor produktiver Freigabe noch erforderlich

- [ ] Eigene SMTP-Zugangsdaten in Supabase hinterlegen und die automatische Invite-/Recovery-Mailzustellung mit einer realen externen Mitarbeiteradresse vollständig abnehmen. Mitarbeiter können bis dahin über den geschützten manuellen Einmal-Link eingeladen werden; Site URL, Redirects, Sign-up-Sperre, Passwortregeln und Leak-Prüfung sind bereits produktiv gesetzt.
- [ ] Authentifizierte Mehrrollen-E2E-Szenarien für Mitarbeiter, Teamleitung, Super Admin und organisationsfremde Benutzer mit freigegebenen Testkonten automatisieren. Die Datenbankgrenzen selbst sind durch pgTAP abgedeckt.
- [ ] E-Mail- und Push-Provider für fachliche Benachrichtigungen auswählen, datenschutzrechtlich freigeben und implementieren. Aktuell ist nur In-App-Zustellung aktiv; andere Kanäle werden bewusst übersprungen.
- [ ] Das echte Betreiber-Gebäudebild unter `src/assets/brand/building.jpg` bereitstellen und visuell abnehmen. Bis dahin bleibt die gestaltete Markenfläche ohne Stockfoto bestehen.
- [ ] Produktionsbetrieb absichern: Backup/PITR und Restore-Probe, Monitoring/Alarmierung, MFA für privilegierte Rollen, Rate Limits, Aufbewahrungs-/Löschkonzept, Datenschutzfreigabe und Incident-Verantwortlichkeiten.
- [ ] Careville erst nach Erhalt offizieller API-Dokumentation und Zugänge implementieren. Der Adapter bleibt korrekt im Zustand `NotConfigured`; MediFox ist bewusst nicht angebunden.
- [ ] Für echte App-Store-Auslieferung Capacitor-Projekte, native Push-/Deep-Link-/Secure-Storage-Adapter, Signing und Store-Pipelines ergänzen. Der aktuelle Stand ist eine installierbare PWA, keine native iOS-/Android-App.

## Weitere bekannte Ausbaupunkte

- Die PWA cached nur die unkritische App-Shell; eine belastbare Offline-Sendequeue für Fachaktionen oder Chatnachrichten ist noch nicht implementiert.
- Suchen und Filter sind in den Kernmodulen vorhanden; eine globale, modulübergreifende Suche und durchgängige Breadcrumb-Navigation fehlen noch.
- Last-, Restore-, Penetrations- und manuelle Accessibility-Tests mit realen Daten/Rollen stehen noch aus.
- Das Erst-Onboarding ist bewusst nur für `info@alberring.de` aktiv. Weitere Benutzer erhalten unabhängig von ihrer Rolle kein Onboarding und gelangen nach der Anmeldung direkt in die App.

Der Stand vom 05.08.2026 wurde gebaut, migriert und gegen Produktion geprüft. Die Änderungen vom 08.09.2026 wurden mit dem oben dokumentierten Verfahren separat veröffentlicht. Mitarbeiteranlage und Invite-Annahme funktionieren auch ohne externen SMTP-Dienst über einen geschützten manuellen Einmal-Link. Für den vollständig automatischen Mailversand fehlen weiterhin Betreiber-Zugangsdaten; die App meldet deshalb keinen falschen Versandserfolg und legt den sicheren Fallback offen.
