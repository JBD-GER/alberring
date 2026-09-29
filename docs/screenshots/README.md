# Screenshotregister

Alle PNG-Dateien zeigen tatsächlich ausgeführte Oberflächen. Es wurden keine Mockups oder KI-Bilder erstellt. Die Browser-Abbildungen verwenden eine isolierte lokale Supabase-Testorganisation mit ausdrücklich künstlichen Prüfprofilen; keine Produktionsmitarbeiterdaten und keine simulierten API-Antworten.

| Datei | Tatsächlicher Inhalt / Umgebung |
| --- | --- |
| 01-vorher-web-login.png | Web-Anmeldung vor Implementierung, lokaler ursprünglicher Vite-Stand |
| 02-nachher-web-login.png | Web-Anmeldung nach Erweiterung, Desktop |
| 03-nachher-mobile-login.png | Gemeinsame Anmeldung bei 390 × 844 CSS-Pixeln |
| 04-mobile-dashboard.png | Authentifizierte mobile Hauptansicht, reales lokales Backend |
| 05-web-dashboard.png | Dieselbe Hauptansicht bei Desktopbreite |
| 06-mobile-navigation.png | Mehr-Bereich und mobile Navigation |
| 07-einstellungen-permissions.png | Gesamte Einstellungsseite, einschließlich Geräteberechtigungen/Pushstatus |
| 08-permission-status.png | Sichtbarer Abschnitt der Berechtigungsanzeige |
| 09-chat-geraetefunktionen.png | Geräteaktionen im vorhandenen Chat |
| 10-standort-abgelehnt.png | Tatsächlicher Fehlerzustand bei nicht freigegebener Browserortung |
| 11-mikrofon-fehlerzustand.png | Tatsächlicher Browserfehler bei nicht verfügbarem Mikrofon |
| 12-offline-zustand.png | Browsernetzwerk gezielt ausgeschaltet; sichtbarer Offlinehinweis |
| 13-photo-upload.png | Wirkliche Fotodatei aus System-Dateiauswahl, JPEG-Vorbereitung, Storage-Upload und angezeigter privater Anhang |
| 14-audio-recording.png | Laufende Audiofunktion; synthetischer Chromium-Mikrofoneingang, echter MediaRecorder/Anwendungsablauf |
| 15-location-draft.png | Tatsächlicher Chatentwurf mit synthetischen Browser-GPS-Testkoordinaten; keine automatische Übertragung |
| 12-android-login.png | Tatsächlich installiertes Android-Debug-APK im API-36-ARM-Emulator |
| 13-android-offline.png | Tatsächliche Android-App bei abgeschaltetem WLAN/Mobilfunk im Emulator |
| 14-android-keyboard.png | Tatsächliche Android-Tastatur; Back-Button schließt die Eingabe |
| 15-android-permissions.png | Echte Android-OS-App-Einstellungen, keine beim Start pauschal angefragten Berechtigungen |
| 16-android-camera-settings.png | Tatsächliche Android-Systemeinstellung für die Kameraberechtigung dieser App |

Die Nummern überschneiden sich bei unterschiedlichen Plattformnachweisen; die sprechenden Dateinamen sind eindeutig. Browser-Testkoordinaten/-Audio belegen den Softwareablauf, nicht die Sensorgenauigkeit oder Mikrofonqualität eines realen Geräts. Android-Screenshots enthalten keine eingegebenen Zugangsdaten.

## Noch fehlende Belege

- iOS-App/Simulator: Xcode und Simulator sind auf diesem Rechner nicht installiert. Später `npm run mobile:sync`, Projekt mit Xcode 26+ öffnen, im Simulator/auf physischem Gerät ausführen und über `xcrun simctl io booted screenshot` bzw. Geräteaufnahme dokumentieren.
- Xcode-/Android-Studio-Projektfenster: Diese IDEs sind nicht installiert. Die tatsächlichen Projektdateien, erfolgreiche CLI-Builds und deren Textnachweise liegen vor. Es wurden keine erfundenen IDE-Screenshots erzeugt.
- Physische Kamera, Fotoauswahl, Mikrofon und GPS samt sämtlicher OS-Permissions: später auf freigegebenen iOS-/Android-Geräten mit Prüfprofil aufnehmen, insbesondere Abbruch, dauerhafte Ablehnung und Rückkehr aus Systemeinstellungen.
- Push-Empfang in allen App-Zuständen: APNs-/Firebase-/Signing-Zugänge fehlen. Nach Betreiberkonfiguration nur generische Testbenachrichtigungen und keine vertraulichen Sperrbildschirminhalte aufnehmen.
- Build-Ergebnisse: tatsächliche Protokolle in `../evidence/`; kein künstliches Terminalbild. Das Architekturdiagramm wird aus der reproduzierbaren Quelle vektoriell in der Dokumentation dargestellt.

Reproduktion: `scripts/verify-mobile-local.mjs` und `scripts/verify-mobile-device-flows.mjs`; sie lesen lokale, nicht eingecheckte Prüfzugänge. Die JSON-Nachweise speichern nur Testmetadaten und keine Tokens oder Passwörter.
