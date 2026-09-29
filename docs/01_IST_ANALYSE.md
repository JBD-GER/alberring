# 01 · Technische IST-Analyse

Analysezeitpunkt: 17.09.2026, vor Beginn der Implementierung der mobilen Erweiterung. Projekt: Alberring Connect. Ausgangs-Commit: `8a75225` (Fix repeated product tour audit tracking). Diese Beschreibung dokumentiert den übernommenen Arbeitsstand, einschließlich bereits vorhandener uncommitteter Änderungen.

## Vorgehen und Abgrenzung

Untersucht wurden Projekt-/Buildkonfiguration, alle Fachbereiche unter `src/features`, gemeinsame Komponenten/Styles/Services, Authentifizierung, sämtliche Migrations- und Function-Bereiche, vorhandene Tests, CI und Betriebsdokumentation. Drei parallele Prüfbereiche: Frontend/Gerätefunktionen, Backend/Sicherheit und native Toolchains. Bestehende Änderungen werden nicht zurückgesetzt. Ein SHA-256-Ausgangsmanifest der 196 versionierten bzw. nicht ignorierten Dateien und `git status` wurde vor Codeänderungen lokal erfasst. Die endgültige Dateiliste unterscheidet den übernommenen Stand vom mobilen Erweiterungsumfang.

Es wurden keine Produktionsdaten verändert, keine Nachrichten versandt und keine Developer-/Signing-Zugangsdaten angelegt. Bestehende historische Dokumentationen berichten frühere Produktionsprüfungen; diese werden nicht als neue Tests ausgegeben.

## Technologie und Struktur

| Bereich         | Übernommener Stand                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- |
| Framework       | React 19.2.7, React DOM 19.2.7, reine SPA; kein Next.js/SSR                               |
| Sprache         | TypeScript 5.9.3, strict, ES2022, Bundler-Auflösung                                       |
| Build           | Vite 8.1.4, React-Plugin 6.0.3; Ausgabe `dist`; npm 11.12.1, Node >=24                    |
| Routing         | React Router 8.3.0, BrowserRouter, Lazy Imports/Suspense; Vercel SPA-Rewrite              |
| Datenzugriff    | Supabase JS 2.110.2, TanStack Query 5.101.2                                               |
| Formulare       | React Hook Form 7.81.0, Zod 4.4.3 sowie modulbezogene React-Formulare                     |
| UI              | CSS, Lucide React, date-fns; keine native UI-Codebasis                                    |
| PWA             | vite-plugin-pwa 1.3.0, Workbox App-Shell-Precache, Updatehinweis                          |
| Backend         | Supabase Auth/PostgreSQL/RLS/Storage/Realtime/Edge Functions                              |
| Hosting         | Bestehendes Vercel-Projekt, statischer Build; keine Vercel Server Functions im Repository |
| Native Projekte | Keine `ios`-/`android`-Verzeichnisse, keine Capacitor-Abhängigkeiten                      |

`src/app`: Shell, Routing, Zugangs-/Rechteprüfungen. `src/features`: Auth, Onboarding, Dashboard, Messaging, News, Dienstplan, Urlaub, Krankheit, Dokumente, Fuhrpark, Material, Verzeichnis, Benachrichtigungen, Einstellungen und Administration. `src/lib`: Client, Typen, Validierungen, Fach-/Fehlerfunktionen. `src/components`: gemeinsame Form-/PWA-Komponenten. `src/services/platform`: bislang nur Interfaces und ein einfacher Web-Dateipicker. `src/services/integrations`: manueller Provider und ausdrücklich nicht konfigurierter Careville-Adapter. `supabase`: Migrationen, SQL-Setup-Bundles, Seed, pgTAP, Deno Functions. `.github/workflows`: Web-/Datenbank-CI.

## Routing und relevante Screens

Öffentlich: Login, Passwort vergessen/zurücksetzen, Einladung annehmen. Keine öffentliche Registrierung. Geschützt: Dashboard, Chats und Chatdetail, News/Detail, Dienstplan, Urlaub, Krankmeldungen, Dokumente/Detail, Fuhrpark, Material, Mitarbeiterverzeichnis, Benachrichtigungen, Profil, Einstellungen und Mehr. Administration enthält Benutzer/Details, Rollen, Teams, News, Dokumente, Planung, Abwesenheiten, Fuhrpark, Material, Audit, Integrationen und Systemeinstellungen. Das besondere Erst-Onboarding und die Produkttour werden serverseitig freigeschaltet.

`ProtectedRoute` prüft Sitzung, aktives Fachprofil und Onboarding. Permission-Gates begrenzen die Darstellung, ersetzen aber keine Backend-Autorisierung. Native Cold Starts, Android Back und Auth-Deep-Links werden noch nicht behandelt.

## Authentifizierung, Benutzer und Sessions

Supabase E-Mail-/Passwort-Login, Einladungsannahme, neutraler Reset und `PASSWORD_RECOVERY`-Status sind implementiert. OAuth und Magic-Link-Login werden nicht als Produktfunktion angeboten. Benutzeranlage/-änderung/-löschung erfolgen über privilegierte Edge Functions mit Fachberechtigungen. Drei aktive Rollen: Super Admin, Mitarbeiter, Teamleitung; historische Rollen bleiben erhalten. Organisations- und zeitgebundene Rollenzuordnung, effektive Berechtigungen über RPCs.

Supabase speichert Sessions standardmäßig im Browser-LocalStorage (`persistSession`, automatischer Token-Refresh, URL-Erkennung). Keine eigene native Keychain-/Keystore-Anbindung. `AuthProvider` lädt Profil/Rechte/Onboarding, leert Query-Cache beim Identitäts-/Rechtewechsel und aktualisiert Rechte bei Fokus/Sichtbarkeit sowie periodisch. Initiale Ladefehler werden bisher mit einem fehlenden Fachprofil gleichgesetzt. Logout ignoriert das zurückgegebene Fehlerobjekt. Passwort-Reset verwendet `location.origin`, was im nativen Container kein geeigneter externer Rücksprung ist. Keine eigene SessionStorage-/Cookie-Persistenz im Quellcode; Browser-SDK übernimmt seine Sessionpersistenz.

## Backend, Datenmodell und APIs

Supabase PostgREST/RPCs, Auth, Realtime und Edge-Function-Aufrufe bilden die gemeinsame API. Tabellen umfassen Organisationen/Settings/Profile/Teams/Rollen, Kommunikation, News, Benachrichtigungen, Planung, Abwesenheiten, Dokumente, Fahrzeuge und Material. Fachdatensätze tragen Organisationsbezüge. Mutierende Fachabläufe verwenden überwiegend transaktionale SQL-RPCs; Audit-Logs halten relevante Änderungen fest.

Edge Functions: administrative Benutzeroperationen, sichere Downloads, Careville-Verbindungstest sowie Geburtstags-, Kilometer-, News- und Benachrichtigungsjobs. Service Role und externe Serverkonfiguration bleiben serverseitig. E-Mail-/Push-Zustellung ist fachlich vorbereitet, bisher aber nicht als externer Transport aktiv. `user_devices`, `notification_preferences`, `notification_deliveries` und `feature_flags` existieren bereits. Geräteeinträge besitzen bisher keine belastbare native Registrierungs-/Abmeldelogik.

Careville ist ohne offizielle Zugangsdaten korrekt nicht konfiguriert. MediFox ist nicht implementiert. Es existieren keine OpenAI-/Stripe-Clientintegrationen und kein Bedarf für weitere Hosting-Infrastruktur.

## Storage, Uploads und Gerätefunktionen

Private Supabase-Buckets und autorisierte, kurzlebige Download-URLs. Chat akzeptiert JPEG/PNG/PDF bis 10 MB, Gruppenbilder bis 5 MB; Dokumente bis 20 MB; Atteste und Kilometerfotos bis 10 MB. Größen-/MIME-Prüfungen sowie Upload-Fehler-/Ladezustände bestehen. Dateiauswahl über HTML-Input; teilweise direkte neue Fenster für Downloads. Kein nativer Photo Picker, keine zentrale Bildkomprimierung/EXIF-Entfernung und kein echter Byte-Fortschritt. Der generische Web-Picker löst Abbruch nicht zuverlässig auf.

Keine Geolocation-/GPS-Funktion im übernommenen Code. Die Datenbanktabelle `locations` bezeichnet organisatorische Standorte, keine Bewegungsprofile. Deshalb besteht kein belegter Bedarf für Hintergrundortung. Kein Mikrofon, keine MediaRecorder-/Audioaufnahme. Keine native Permission-UX. Keine APNs-/FCM-Registrierung, Tokenrotation oder Notification-Tap-Behandlung.

## Webplattform, Offline und mobile Darstellung

PWA-Manifest mit Icons/Standalone, Service Worker für App-Shell, keine Runtime-Caches sensibler API-Antworten. PWA-Registrierung erfolgt bisher uneingeschränkt beim Start. TanStack Query wiederholt Leseabfragen einmal; einzelne Module zeigen Netzwerk-/Fehlerzustände. Kein globaler Offlinehinweis, keine zentrale Fetch-Zeitgrenze und keine vollständige Error Boundary. Keine Offline-Schreibqueue.

Responsive Sidebar/Bottom-Navigation, Safe-Area-CSS, 44px-Touchziele, 16px-Formularfelder, horizontale Tabellencontainer, Reduced Motion und erhöhte Kontraste sind vorhanden. Farbschema bewusst hell. Native Tastatur-/Statusleisten-/Lifecycle-Abstimmung fehlt. Browser-APIs: Clipboard, Dateieingaben, confirm/prompt, window.open/location, DOM-Fokus, Sichtbarkeit/Fokus und navigator.onLine.

## Environment und Sicherheit

Öffentliche Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; lokal zusätzlich `VITE_APP_URL`. Ein lokal vorhandenes Vercel-Authentifizierungs-Environment wird nicht in Dokumente übernommen. `.env*`, `.vercel` und Supabase-Temporärdaten sind ignoriert. Keine Secretwerte in dieser Analyse.

Vercel setzt CSP, no-referrer, nosniff, Frame-Verbot, COOP und Permissions-Policy. Letztere erlaubt Kamera, sperrt jedoch Mikrofon und Standort. CSP enthält bislang keine ausdrückliche Medienquelle für Blob-Audio. Der öffentliche Buildvalidator prüft notwendige Variablen/URL, blockiert aber noch keine versehentlich als VITE-Variable gesetzten privaten Schlüssel. Eine native CSP muss gesondert im eingebetteten HTML gelten, weil Vercel-Header dort nicht greifen.

RLS, private Buckets, explizite API-Grants, serverseitige Rechteprüfungen, gehärtete Search Paths und geringe Signed-URL-Laufzeiten bestehen. Lokale Quellprüfung fand keine privaten Schlüssel im Client. Verbleibende Detailbefunde/Behebungen folgen in `02_SECURITY_AUDIT.md`; diese Aussage ersetzt keinen Penetrationstest.

## Bestehende Qualitätssicherung und gemessener Ausgangszustand

Am 17.09.2026 vor Codeänderungen tatsächlich ausgeführt:

- `npm ci`: erfolgreich, 554 Pakete installiert.
- TypeScript und ESLint: erfolgreich.
- Vitest: 12 Testdateien, 93 erfolgreiche Tests.
- Produktions-Webbuild einschließlich PWA: erfolgreich.
- Browser: tatsächlicher lokaler Login lädt ohne gemeldeten JavaScript-Fehler; Vorher-Screenshot `screenshots/01-vorher-web-login.png`.
- npm Audit: 7 gemeldete Probleme (4 high, 3 moderate), in Vitest/Mocker und transitiven Buildwerkzeugen. Gezielte kompatible Updates erforderlich; keine pauschale Major-Aktualisierung.

Vorhandene Playwright-Suite: 6 öffentliche Szenarien jeweils Desktop/Pixel 7, inklusive axe-Loginprüfung. Vitest testet Fach-/Auth-/UI-Logik mit isolierten Mocks. Deno-Tests und pgTAP prüfen Serverlogik/Rechte. CI: Installation, Audit, TypeScript, Lint, Formatierung, Vitest, Deno, Browser sowie lokale Supabase-Tests. Native CI/Signing-/Store-Artefakte fehlen.

## Lokale Werkzeuggrenzen

Node 24.15.0/npm 11.12.1 vorhanden. Xcode und iOS-Simulator fehlen, nur Command Line Tools sind installiert. Android Studio, SDK/Emulator und Java fehlen im Ausgangszustand. Docker ist installiert, der Daemon war bei der Erstprüfung nicht erreichbar. Native Projekterzeugung/Sync sind davon getrennt prüfbar. Nicht ausführbare native Tests werden später ausdrücklich als offen ausgewiesen.

## Architekturentscheidung und Umsetzungsplan

1. Vorliegende React-SPA beibehalten; separater nativer Vite-Build in `dist-native`, ohne PWA-Service-Worker. Capacitor 8.5.2 als aktuell stabile, mit Node24 kompatible Version. Keine produktive Remote-WebView-URL.
2. Native Projekte für iOS/Android ergänzen, gemeinsame Typen/Komponenten/APIs weiterverwenden. Bundle-/Package-Struktur `de.alberring.connect` als technische Kennung; finale Kontoinhaberschaft vor Store-Registrierung bestätigen.
3. Kleine Plattformadapter für Secure Storage, Lifecycle/Links, Netzwerk, Kamera/Picker, Standort, Mikrofon und Push. Berechtigungen erst nach bewusster Aktion. Hintergrundortung bleibt aus.
4. Konkrete Integration in bestehende Chat-/Fuhrpark-/Einstellungsabläufe, keine isolierte zweite Anwendung. Keine kontinuierliche Mitarbeiterortung.
5. Bestehende Gerätetabelle und Benachrichtigungsarchitektur härten/erweitern; neue SQL-Migration statt Umbau vorhandener Fachmodelle. Credentials strikt extern.
6. Security- und Fehlerbehandlung, automatisierte Prüfungen, native Sync-/Build-Pipelines, Versionierung und Store-Checklisten ergänzen.
7. Tatsächliche Browser-Screenshots, überprüfbare Testnachweise, Vorher/Nachher-Dokumentation und daraus reproduzierbares A4-PDF erstellen.

Offizielle Quellen geprüft am 17.09.2026: [Capacitor-Dokumentation](https://capacitorjs.com/docs), [Capacitor 8.5 Migration](https://capacitorjs.com/docs/updating/8-5), [Supabase native Deep Links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Supabase Changelog](https://supabase.com/changelog), [Apple SDK-Anforderungen](https://developer.apple.com/news/upcoming-requirements/), [Google Play Target API](https://support.google.com/googleplay/android-developer/answer/11926878). Paketversionen zusätzlich aus npm-Metadaten ermittelt.
