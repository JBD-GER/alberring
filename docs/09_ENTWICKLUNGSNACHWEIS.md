# 09 · Entwicklungsnachweis und Qualitätssicherung

Stand: 17.09.2026. Dieser Nachweis enthält beobachtbare technische Entscheidungen, Änderungen und Testergebnisse. Er enthält weder interne Denkprozesse noch private Zugangsdaten. Externe Account-/Storefreigaben werden nicht mit lokalen Tests gleichgesetzt.

## Ausgangssicherung und Analyse vor der Umsetzung

1. Eingefügte Aufgabenbeschreibung vollständig gelesen; Projektstruktur, Konfiguration, Fachmodule, Backend, Migrationen, Tests und vorhandene Betriebsdokumentation untersucht.
2. `git status`, letzten Commit und Dateiinventar erfasst. 196 vorhandene nicht ignorierte Dateien per SHA-256 dokumentiert. Bereits vorhandene Änderungen an Fachmodulen und SQL wurden beibehalten; keine Rücksetzung fremder Arbeit.
3. React 19/Vite 8/TypeScript/Supabase-Architektur bestätigt. Fehlende native Projekte und Geräteadapter, standardmäßiger LocalStorage und gesperrte Webrechte für Mikrofon/Standort identifiziert.
4. Offizielle Capacitor-/Store-/Supabase-Anforderungen und npm-Versionen geprüft. Capacitor 8.5.2 als aktuelle stabile Version gewählt; Node24-kompatibel. Quellen stehen in Analyse, Architektur und Releaseprozess.
5. Vor Codeänderungen `01_IST_ANALYSE.md` geschrieben und tatsächlichen Vorher-Screenshot aufgenommen. Baseline: Installation, TypeScript, ESLint, 93 Tests und Webbuild erfolgreich; npm meldete sieben Abhängigkeitsrisiken.

## Technische Entscheidungen und ausgeführte Entwicklung

- Gemeinsame React-SPA beibehalten, keinen Frameworkwechsel durchgeführt. Zusätzlicher Build nach `dist-native` statt separater Fachanwendungen. Kein produktiver Remote-WebView-Server und kein ausführbarer Remote-Updatekanal.
- Native iOS-/Android-Projekte aus stabiler Capacitor-Vorlage erzeugt und Plugins mit Swift Package Manager/Gradle integriert. Icons/Splash aus dem vorhandenen Markenasset reproduzierbar erzeugt.
- Keychain-/Keystore-Bridges mit kleiner API implementiert. Native Fehler bleiben sichtbar und führen nicht zu unsicherem Fallback. PKCE-/Deep-Link-Pfad, Lifecycle, Back/Keyboard und Netzwerkzustände ergänzt.
- Vordergrundstandort bewusst als Chatentwurf integriert; kein Nachweis für Hintergrundortung, daher keine solche Berechtigung/Funktion aktiviert.
- Native Kamera/Systempicker, JPEG-Normalisierung, EXIF-Entfernung für die neuen Fotoaktionen, Sprachnachrichten und echte Uploadfortschritte in vorhandene Fachabläufe integriert.
- Vorhandene `user_devices`-Tabelle statt neuer paralleler Geräteverwaltung erweitert. Tokenzugriff minimiert, Auth-Session gebunden, Rotation/Widerruf serialisiert. APNs-/FCM-Provider und Fehler-/Wiederholungsverhalten vorbereitet; ohne Credentials deaktiviert.
- SQL-Migration ausschließlich lokal angewendet und mit vollständigen RLS-/Fachtests geprüft. Setup-Bundles aus allen erhaltenen Migrationen neu erzeugt. Kein Produktionsschema oder produktiver Mitarbeiterdatensatz wurde verändert.
- Versionierung, native Kompatibilitätsbuilds, geschützte Signing-Artefakte und optionalen CI-geprüften Vercel-Release vorbereitet. Kontoeinstellungen und Signing-Secrets bleiben externe spätere Schritte.

## Gefundene Probleme und Behebung

| Beobachtung                                                   | Technische Behebung / Aussagegrenze                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm-Baseline meldet 7 Probleme                                | Vitest auf 4.1.11 sowie kompatible transitive Updates. Neues Capacitor-CLI-Xcode-Werkzeug brachte verwundbare UUID-Abhängigkeit; gezieltes `xcode → uuid 11.1.1`-Override. Tatsächliche Xcode-Projekt-UUID-Erzeugung, Sync und Android-Build geprüft; finale npm-Prüfung ohne Befund.                 |
| Verspäteter Push-Callback kann Logout überholen               | Gemeinsame Mutationswarteschlange sowie Benutzer-/Generationsprüfung vor und nach Serveraufruf. Adversarielle Tests zeigen Registrierung vor anschließendem Widerruf und keine veraltete Erfolgsmeldung.                                                                                              |
| Passwort-Reset ignorierte einen Fehler beim globalen Abmelden | Push-Widerruf vor globalem Sign-out ergänzt und SDK-Fehler ausgewertet. Nach erfolgreicher Passwortänderung wiederholt der eigene Abmelde-Retry nur das Aufräumen, nicht die Passwortänderung. Vier Regressionstests prüfen Reihenfolge und Fehlerfälle.                                              |
| Ein Auth-Fokustest fiel im vollständigen Paralleltestlauf aus | Fokuslistener war an den Ladezustand gebunden. Listener über die Provider-Lebensdauer stabil registriert; aktuelle Profil-/Benutzerrefs und Generation prüfen die Gültigkeit. Bestehender Test erhalten; gezielte und vollständige Wiederholung erfolgreich.                                          |
| Echter lokaler Fotoabruf scheitert nach erfolgreichem Upload  | Lokale Edge-Runtime erzeugte Docker-interne Signed-URL-Origin `kong:8000`. Optionaler serverseitiger, validierter `APP_SUPABASE_PUBLIC_URL` korrigiert nur die öffentliche Origin. Produktionsverhalten ohne Konfiguration unverändert; tatsächlicher Bildabruf danach HTTP 200.                      |
| Standortentwurf zeigte nur die erste Textzeile                | Bestehende Textarea reagierte nur auf DOM-Eingabe, nicht auf programmatische Standortergänzung. Höhenanpassung auch bei Änderung des Nachrichtenwerts ergänzt; Koordinaten/Genauigkeit/Zeitpunkt im Screenshot lesbar.                                                                                |
| Gradle-Inkrementalcache nach Ressourcenverschiebung           | Ein tatsächlicher Zwischenbuild meldete inkonsistente Ressourcen. App-Build bereinigt und neu gebaut; nachfolgende Builds erfolgreich. Keine Compilerfehler unterdrückt.                                                                                                                              |
| Android ADB-Verbindung auf macOS hängt                        | Native USB-Initialisierung diagnostiziert; separater ADB-Server mit libusb für die lokale Emulatorprüfung. Produktcode unverändert.                                                                                                                                                                   |
| Lint erfasst erzeugten Supabase-Tempcode                      | Ausschließlich generiertes `supabase/.temp` vom Frontend-Lint/Formatlauf ausgenommen; eigene Edge-Quellen werden weiterhin mit Deno geprüft. Browser-Testcallbacks verwenden explizite Browserglobals.                                                                                                |
| Ein Browserprüfstart fiel mit laufendem npm ci zusammen       | Abhängigkeiten wurden während des Starts ersetzt; danach enthielt der laufende Vite-Prozess veraltete voroptimierte Module. Entwicklungsserver mit frischer Optimierung gestartet und vollständigen Prüfablauf erfolgreich wiederholt. Fehlgeschlagene Zwischenläufe wurden nicht als Erfolg gezählt. |
| Kein Xcode installiert                                        | iOS-Syntax/Projekt-/Plistprüfung und Sync ausgeführt; tatsächliche Kompilierung offen. Es wird keine erfolgreiche iOS-Binärprüfung behauptet.                                                                                                                                                         |

## Abschließende automatisierte Prüfungen

Die folgenden Ergebnisse wurden tatsächlich lokal ausgeführt. Konkrete Belege liegen in `docs/evidence/`.

| Prüfung                                         | Ergebnis                                                    | Bedeutung und Grenze                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| npm ci                                          | erfolgreich                                                 | Installation aus aktualisiertem Lockfile                                                                   |
| TypeScript                                      | erfolgreich                                                 | Frontend-/Buildkonfiguration ohne ignorierte TS-Fehler                                                     |
| ESLint                                          | erfolgreich, 0 Warnungen erlaubt                            | Eigener Frontend-/Scriptcode; generierte Native-/Tempdateien separat                                       |
| Prettier                                        | erfolgreich im Abschlusslauf                                | Keine fachlichen Änderungen durch Formatierung                                                             |
| Vitest                                          | 22 Dateien, 166 Tests erfolgreich                           | Bestehende Regressionen plus Geräte-/Storage-/Netzwerk-/Link-/Upload-/Pushfälle                            |
| Web-Produktionsbuild                            | erfolgreich                                                 | React-Build einschließlich PWA/App-Shell                                                                   |
| Nativer Frontendbuild                           | erfolgreich                                                 | Lokale Assets, eigene CSP, kein Service Worker                                                             |
| Capacitor Sync iOS/Android                      | erfolgreich, je 9 Plugins                                   | Projekte erhalten aktuellen gemeinsamen Build; kein Beweis iOS-Kompilierung                                |
| npm Audit                                       | 0 bekannte Schwachstellen                                   | Zeitgebundener Registry-/Advisory-Stand, keine allgemeine Sicherheitsgarantie                              |
| Client-/Bundle-Secretmusterprüfung              | ohne Befund                                                 | Keine gefundenen privaten Schlüsseltypen/Service-Role-JWTs; Musterprüfung allein ist kein Penetrationstest |
| Öffentliche Playwright-Suite                    | 12 von 12 erfolgreich                                       | Login, Reset, ungültige Einladung, Routing, responsive Breite und axe auf Desktop/Mobil                    |
| Lokale authentifizierte Browserprüfung          | 25 Routen, Login/Restore/Logout/Offline erfolgreich         | Tatsächliche lokale Supabase-Organisation, keine simulierten API-Antworten                                 |
| Lokale Geräte-/Uploadflüsse                     | 3 von 3 erfolgreich                                         | Foto, Audio und Standortentwurf; Browser-Sensorwerte ausdrücklich synthetisch                              |
| PostgreSQL/pgTAP                                | 14 Dateien, 539 Assertions erfolgreich                      | Fachabläufe, RLS, Mandantengrenzen und neue Geräte-/Audio-/Queuegrenzen                                    |
| Supabase Security Advisors                      | 0 Befunde                                                   | Lokale Datenbank; keine Aussage über abweichende Produktionseinstellungen                                  |
| Datenbank-Lint                                  | keine Fehler; vorhandener ungenutzter Parameter als Warnung | Kein sicherheitsrelevanter Fund aus dieser Warnung                                                         |
| Deno Typecheck                                  | alle 13 Edge-Einstiegspunkte erfolgreich                    | Serverquellen einschließlich Push und Download-Origin                                                      |
| Deno Tests                                      | 29 erfolgreich                                              | Bestehende Funktionen, kryptographische Signatur-/Provider-/URL-Verträge                                   |
| Android assembleDebug, bundleRelease, lintDebug | erfolgreich                                                 | Tatsächliche APK/unsigniertes AAB und Lint; kein Signing-/Storeupload                                      |
| Android Keystore-Instrumentation                | 2 Tests auf Android-36-ARM-Emulator erfolgreich             | Roundtrip, keine Klartextwerte, neue GCM-Nonce, Löschung, ungültige Schlüssel, manipulierte Ciphertexte    |
| iOS Quell-/Projektprüfung                       | Swift-Syntax, Projekt/Plist und Sync erfolgreich            | Kein SDK-Typecheck, kein Simulator und kein echtes iOS-Gerät verfügbar                                     |
| Git diff --check                                | erfolgreich im Abschlusslauf                                | Keine Konfliktmarker-/Whitespacefehler                                                                     |

## Echte Browser- und Gerätebelege

Die lokale Testorganisation enthält ausschließlich eigens angelegte Prüfprofile, einen Prüfchat und ein Prüffahrzeug. Vorhandene lokale Organisationen und Produktionsdaten wurden nicht ersetzt. Temporäre Zugänge lagen außerhalb des Repositorys in einer Datei mit Modus 0600. Keine E-Mails oder Pushnachrichten an reale Mitarbeiter wurden versandt.

Die Fotoprüfung wählte das bestehende Repository-Icon durch den tatsächlichen Browser-Dateidialog, kodierte es als 4.057-Byte-JPEG neu, lud es signiert in privaten Storage hoch und zeigte es nach Autorisierung wieder an. Die Audioprüfung nahm synthetischen Chromium-Mikrofoneingang mit dem tatsächlichen MediaRecorder auf, speicherte 17.627 Bytes `audio/mp4` und prüfte die Wiedergabe über eine echte signierte URL. Die Standortprüfung verwendete ausdrücklich vorgegebene Browser-Testkoordinaten mit 15 m Genauigkeit; die Datenbank-Nachrichtenanzahl blieb bis zum Senden unverändert.

Zusätzlich wurden die tatsächliche Android-App im API-36-Emulator, Offlinezustand, Tastatur und OS-Berechtigungseinstellungen aufgenommen. Der OS-Berechtigungsscreenshot zeigt, dass keine Rechte pauschal beim Start angefragt wurden. Browser-Screenshots oder synthetische Sensorwerte werden nicht als physische Kamera-/GPS-/Mikrofonabnahme ausgegeben.

## Erforderliche spätere Abnahme

- iOS mit Xcode 26/iOS-26-SDK kompilieren, Simulator und physisches iPhone prüfen; Keychain, Wiederinstallation, gesperrtes Gerät und Restore testen.
- Physische Android-/iOS-Geräte: genaue/ungefähre Position, GPS aus, eingeschränkte/dauerhaft verweigerte Rechte, Kameraabbruch/Prozessneustart, Photo Picker, Audio-Unterbrechung und Codec-Kompatibilität.
- APNs/FCM mit echten Accounts in Vordergrund, Hintergrund und beendetem Zustand prüfen; Tokenrotation, mehrere Geräte, Opt-out, ungültige Tokens und Notification-Tap abnehmen.
- Native Auth-Redirects/SMTP und Kontowiederherstellung mit realen freigegebenen Testkonten prüfen. Universal/App Links erst nach echten Domain-/Zertifikats-/Teamnachweisen aktivieren.
- Signing, Store-Identität, Datenschutzerklärung, Aufbewahrung/Löschung, Reviewerzugang und Storeangaben finalisieren. Last-, Restore-, unabhängige Penetrations- und manuelle Barrierefreiheitsprüfung bleiben Betriebsfreigaben.

## Dokumentationsnachweis

IST-Analyse, Security Audit, Releaseprozess, Änderungs- und Dateidokumentation, Architektur, technische Datenschutzgrundlage und Store-Checklisten liegen als editierbare Markdown-Dateien vor. Screenshots und Prüfbelege sind strukturiert abgelegt. `scripts/build-mobile-documentation.py` erzeugt die zusammengeführte Markdown-Quelle und ein A4-PDF mit Inhaltsverzeichnis, Seitenzahlen, echten Bildern und vektoriellem Architekturdiagramm. Die PDF-Prüfung umfasst A4-Seitenmaße, extrahierbaren Text, vollständige Kapitel/Lesezeichen, fortlaufende Abbildungsnummern, Textgrenzen und die visuelle Kontrolle aller gerenderten Seiten. Das konkrete Ergebnis liegt in `docs/evidence/pdf-quality.json`. Zum erneuten Erzeugen benötigt das Python-Skript `reportlab` und `pillow`; die zusätzliche Renderprüfung verwendet PyMuPDF.
