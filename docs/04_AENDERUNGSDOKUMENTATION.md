# 04 · Änderungsdokumentation

Bezugsstand: Arbeitskopie vom 17.09.2026 vor mobiler Erweiterung, nicht allein der letzte Git-Commit. Bereits vorhandene Änderungen bleiben im Ausgangsmanifest als übernommen gekennzeichnet. Die folgende Dokumentation beschreibt ausschließlich die neue Entwicklungsleistung. Verbindliche Testzahlen und Aussagegrenzen stehen in `09_ENTWICKLUNGSNACHWEIS.md`.

## 1. Gemeinsame native Auslieferung

**Änderung:** Capacitor und vollständige Plattformprojekte ergänzt.

**Ausgangszustand:** React-SPA/PWA; Dokument `CAPACITOR_MIGRATION.md` beschrieb lediglich spätere Möglichkeiten.

**Ziel:** Ein React-Quellstand für Web, iOS und Android mit lokalem Frontend im App-Paket.

**Umsetzung:** Stabile Capacitor-Version 8.5.2, `capacitor.config.ts`, separates Vite-Native-Buildziel, eigene CSP, Ausschluss des PWA-Service-Workers, Swift-Package-/Gradle-Projekte. Konfiguration verbietet produktive Remote-URL und unsicheren Mixed Content. Native Ressourcen stammen aus vorhandenen Markenassets.

**Betroffene Dateien:** `package.json`, `package-lock.json`, `vite.config.ts`, `capacitor.config.ts`, `src/main.tsx`, `scripts/verify-native-bundle.mjs`, `ios/`, `android/`, `scripts/generate-mobile-assets.mjs`.

**Technologien:** Capacitor, Vite, TypeScript, Swift, Java, Swift Package Manager, Gradle.

**Ergebnis:** Webbuild bleibt eigenständig; native Plattformen verpacken denselben Frontend-Code. Kein Framework-Wechsel.

**Test:** Web-/Native-Build, Bundleprüfung, Capacitor Sync und tatsächlicher Android-Build. iOS-Kompilierung benötigt weiterhin Xcode.

**Screenshot:** Native Android-Nachweis soweit im Screenshot-Verzeichnis vorhanden; fehlende Simulatorbelege werden im Screenshotregister begründet.

## 2. Sichere native Sitzung und Auth-Rücksprünge

**Änderung:** Plattformabhängige Auth-Persistenz, PKCE-Callback, Lifecycle und bessere Fehlerzustände.

**Ausgangszustand:** SDK-LocalStorage auf allen Plattformen, Web-URL beim Reset, uneinheitliche Fehler-/Logoutbehandlung.

**Ziel:** Gemeinsame Konten ohne unnötige Klartextpersistenz im nativen Container.

**Umsetzung:** `AlberringSecureStorage` nutzt gerätegebundene Keychain bzw. AES-GCM mit Android-Keystore-Schlüssel. Kein nativer Fallback auf LocalStorage. Auth-Callback akzeptiert nur registrierte Schemes, erlaubte Routen und einmaligen PKCE-Code. Session Restore/Refresh und Fachprofilfehler sind getrennt sichtbar. Logout widerruft Gerätebindung vor lokaler Abmeldung und meldet Verbindungsfehler offen.

**Betroffene Dateien:** `src/services/platform/storage.ts`, `links.ts`, `push.ts`, `src/lib/supabase.ts`, `src/features/auth/AuthProvider.tsx`, `AuthScreens.tsx`, `src/app/ProtectedRoute.tsx`, native Bridge-Dateien.

**Technologien:** Supabase Auth, PKCE, Keychain, Android Keystore, Capacitor App.

**Ergebnis:** Bestehende Benutzerkonten funktionieren gemeinsam; mobile Auth-Tokens werden verschlüsselt bzw. im Keychain gespeichert. Web-Einladungsabläufe bleiben erhalten.

**Test:** Storage-Fail-Closed-Tests, URL-/Redirect-Tests, Auth-Regressionen und echte lokale Browseranmeldung mit Neuladen/Logout. Keychain-Verhalten auf iOS-Hardware bleibt Geräteabnahme.

**Screenshot:** `02-nachher-web-login.png`, `03-nachher-mobile-login.png`.

## 3. Standort und kontextuelle Berechtigungen

**Änderung:** Vordergrundortung und eine gemeinsame Berechtigungsanzeige ergänzt.

**Ausgangszustand:** Keine Standortfunktion; organisatorische Standorttabelle ohne GPS-Bezug.

**Ziel:** Explizites Teilen einer aktuellen Position ohne Mitarbeiter-Tracking.

**Umsetzung:** Capacitor Geolocation bzw. Browser-Geolocation; präzise Abfrage, ungefähre Freigabe als Alternative, Genauigkeit/Zeitpunkt, Timeout-/Disabled-/Denied-/Restricted-Fehler. Ergebnis wird zunächst Chatentwurf. Native Settings-Bridge ermittelt Berechtigungszustände und öffnet Systemeinstellungen. Keine Startabfrage aller Permissions.

**Betroffene Dateien:** `src/services/platform/location.ts`, `permissions.ts`, `src/components/common/DeviceActions.tsx`, `DevicePermissions.tsx`, `src/features/messaging/Messaging.tsx`, native Manifest-/Info.plist-/Settings-Dateien.

**Technologien:** Capacitor Geolocation, Core Location, Android Location/Permissions, Web Permissions API.

**Ergebnis:** Nutzer entscheiden über Ermittlung und Versand separat. Keine Hintergrundortung, kein Verlauf außerhalb bewusst versendeter Nachrichten.

**Test:** Adapter-/Fehlerklassentests, UI-Test ohne Anfrage beim Mount, Browser-Denial und positive Browserprüfung mit explizit synthetischen GPS-Testkoordinaten.

**Screenshot:** `10-standort-abgelehnt.png`; positive Geräteprüfung wird im Screenshotregister gekennzeichnet.

## 4. Kamera, Fotos und Uploadfortschritt

**Änderung:** Native Kamera/Systempicker und gemeinsame Bildvorbereitung in Chat/Fuhrpark.

**Ausgangszustand:** HTML-Dateieingaben ohne zentrale Komprimierung/Metadatenentfernung; nur Upload-Ladezustand.

**Ziel:** Mobile Aufnahme/Auswahl, begrenzte Dateien, datensparsame Bilder und nachvollziehbarer Transfer.

**Umsetzung:** Capacitor Camera 8 verwendet Aufnahme und einzelne Systemauswahl. Web behält Dateiauswahl/Capture. Bilder werden größen-/pixelbegrenzt und als JPEG neu encodiert; EXIF wird nicht übernommen. Abbruch löst den Picker zuverlässig auf. XHR über geprüfte signierte URLs zeigt echten Bytefortschritt, erlaubt Abbruch und behandelt Timeout/HTTP-Fehler. Bestehende fachliche Upload-/Kompensationslogik bleibt bestehen.

**Betroffene Dateien:** `src/services/platform/media.ts`, `uploads.ts`, `src/components/common/DeviceActions.tsx`, `UploadProgress.tsx`, `src/features/messaging/Messaging.tsx`, `src/features/fleet/FleetPage.tsx`.

**Technologien:** Capacitor Camera, nativer Photo Picker, Canvas, Supabase Storage, XMLHttpRequest.

**Ergebnis:** Foto erst als Vorschau/Dateientwurf, Speicherung erst bei fachlichem Senden. Kein pauschaler Zugriff auf die gesamte Fotobibliothek.

**Test:** Bild-/MIME-/Größenprüfungen, Abbruch-/Uploadtests, bestehende Chat-/Fuhrpark-Regressionen und tatsächliche lokale Storage-Übertragung.

**Screenshot:** `09-chat-geraetefunktionen.png` und Foto-Upload-Nachweis aus der lokalen Geräteprüfung.

## 5. Sprachnachrichten

**Änderung:** Explizite Audioaufnahme, Vorschau und Audioanhang im vorhandenen Chat.

**Ausgangszustand:** Kein Mikrofon; Chat erlaubte ausschließlich Bild/PDF.

**Ziel:** Aufnahme im Vordergrund mit widerrufbarer Nutzerentscheidung.

**Umsetzung:** Nativer Capacitor-Audiorecorder und Web-MediaRecorder; maximal 120 Sekunden, Start/Stop/Verwerfen, Preview, Cleanup, Abbruch bei Hintergrund/Unmount/Unterbrechung. Bestehende Attachment-Tabelle und privater Bucket akzeptieren die begrenzten Audio-MIMEs. Dateien bleiben bis zur Sendeaktion lokal; native Temporärdateien werden bereinigt.

**Betroffene Dateien:** `src/services/platform/audio.ts`, `DeviceActions.tsx`, `Messaging.tsx`, neue SQL-Migration, native Mikrofon-Permissions.

**Technologien:** Capgo Audio Recorder, MediaRecorder, Filesystem, Supabase Storage.

**Ergebnis:** Sprachnachrichten verwenden dasselbe Mitglieder-/RLS-Modell wie bestehende Chat-Anhänge.

**Test:** Codec-/Größen-/Lifecycle-/Abbruchtests, Browserfehler ohne Mikrofon und Audio-Transportprüfung mit synthetischem Browser-Mikrofon. Reale Hardwarequalität bleibt gesonderter Test.

**Screenshot:** `11-mikrofon-fehlerzustand.png`; Aufnahme-/Vorschaunachweis laut Screenshotregister.

## 6. Push und Backend-Härtung

**Änderung:** Gerätetokenregistrierung, Sitzungsschutz und APNs-/FCM-Transport vorbereitet.

**Ausgangszustand:** Gerätetabelle und Präferenzen vorhanden, kein aktiver nativer Registrierungs-/Transportpfad.

**Ziel:** Mehrere Geräte und zuverlässige Lebenszyklen ohne Tokens im öffentlichen Client-Lesezugriff.

**Umsetzung:** Bestehende Gerätetabelle erhält Installation/Sitzungsbindung und sichere RPCs; Clientrechte werden auf erforderliche Metadaten beschränkt. Rotation, Logout und verspätete Callbacks werden serialisiert. Dispatcher verarbeitet aktuelle Präferenzen, generische Payloads, Providerfehler, ungültige Tokens, Wiederholungen und bereits erfolgreiche Einzelzustellungen. Provider-Secrets bleiben in Supabase Functions.

**Betroffene Dateien:** `src/services/platform/push.ts`, `PushSettings.tsx`, neue Migration und pgTAP-Datei, `supabase/functions/_shared/push.ts`, `send-notification-batch/index.ts` sowie zugehörige Tests.

**Technologien:** Capacitor Push, APNs, FCM HTTP v1, JWT/OAuth, PostgreSQL, Deno.

**Ergebnis:** Technische Ende-zu-Ende-Struktur vorhanden; tatsächlicher Versand bleibt ohne Accountkonfiguration deaktiviert. Keine fingierten Zustellerfolge.

**Test:** SQL-Isolation/Sitzungsschutz, kryptographische Signaturtests, Providervertrag und Race-/Logouttests. Keine reale APNs-/FCM-Zustellung behauptet.

**Screenshot:** `07-einstellungen-permissions.png` zeigt den tatsächlichen nicht konfigurierten Pushzustand.

## 7. Netzwerk, Sicherheit und mobile Shell

**Änderung:** Globale Fehler-/Offlineansichten, Zeitgrenzen, native Navigation und Buildhärtung.

**Ausgangszustand:** Modulfehler vorhanden, aber kein globaler Offlinehinweis/Error Boundary; Mikrofon/Standort in Web-Headern gesperrt.

**Ziel:** Verständliche Fehler statt leerer Bildschirme oder unklarer, endloser Ladezustände.

**Umsetzung:** Network-Plugin, Error Boundary/Router-Fallback, begrenzter Fetch, expliziter Retry, native Back-/Keyboard-/Lifecycle-Listener, Kamera-Restore-Hinweis. Public-Env-Allowlist blockiert Service-Role-/Privatschlüssel; Client-/Bundle-Scan ergänzt die Prüfung. Dependencies gezielt aktualisiert; kompatibles UUID-Override für Capacitor-Xcode-Werkzeug geprüft.

**Betroffene Dateien:** `src/components/common/NetworkStatus.tsx`, `AppErrorBoundary.tsx`, `PlatformRuntime.tsx`, `src/services/platform/network.ts`, `src/styles/platform.css`, `vercel.json`, `scripts/public-env.mjs`, `check-client-security.mjs`, Lockfile.

**Ergebnis:** Bestehende mobile Darstellung bleibt erhalten, neue Gerätefunktionen passen in die gemeinsame Shell. Keine automatische Wiederholung fachlicher Schreibvorgänge.

**Test:** Timeout-/Abbruchtests, Secret-Negativtests, Web-/Native-Build, 25 lokale mobile Routen ohne Horizontalüberlauf/Renderfehler, echte Offline-Umschaltung.

**Screenshot:** `04-mobile-dashboard.png`, `06-mobile-navigation.png`, `08-permission-status.png`, `12-offline-zustand.png`.

## 8. Versionierung, CI/CD und prüfbare Dokumentation

**Änderung:** Version 1.0.0/Build 1, native Kompatibilitäts-/Release-Pipelines, vorbereiteter verifizierter Vercel-Deploy und vollständige Nachweisdokumente.

**Ausgangszustand:** Web-/Datenbank-CI, keine nativen Artefakte oder Storeprozesse.

**Ziel:** Wiederholbare Prüfung/Release aus derselben Codebasis und sachlicher Förderungsnachweis.

**Umsetzung:** Zentrale Versionierung, überprüfte Buildnummern, geschützte Secrets/Environments, Artefaktausgabe, dokumentierte spätere Store-Einrichtung. Vorher-Manifest, echte Browserbelege, Architekturdiagramm, Dateien-/Dependencylisten, Markdown und reproduzierbarer A4-PDF-Generator.

**Betroffene Dateien:** `.github/workflows/`, `mobile-version.json`, Version-/Release-/Asset-/Dokumentationsskripte, `.gitignore`, `.prettierignore`, `docs/01` bis `09`, Förderdokumentation und Screenshots.

**Technologien:** GitHub Actions, Vercel CLI, Gradle, Xcode-Konfiguration, Playwright, ReportLab, SHA-256.

**Ergebnis:** Nachvollziehbare Vorbereitung ohne erfundene Credentials, Testresultate oder Storefreigabe.

**Test:** Lokale Befehle/Artefakte dokumentiert, PDF visuell und strukturell geprüft. Cloud-CI und signierte Storeuploads benötigen spätere Kontoeinrichtung.
