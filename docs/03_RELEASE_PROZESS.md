# 03 – Release-Prozess für Web, iOS und Android

Stand: 17. September 2026. Diese Anleitung beschreibt die im Repository angelegte technische Vorbereitung. Ein Store-Upload oder eine Freigabe durch Apple/Google wurde nicht durchgeführt. Die Veröffentlichung vorhandener Web-Funktionen bleibt im bestehenden Vercel-Projekt.

## Identität und unterstützte Plattformen

| Eigenschaft                       | Konfiguration                                          |
| --------------------------------- | ------------------------------------------------------ |
| Produktname                       | Alberring                                              |
| Produktions-Bundle-ID / Package   | `de.alberring.connect`                                 |
| Entwicklungs-Bundle-ID / Package  | `de.alberring.connect.dev`                             |
| Version und laufende Build-Nummer | `mobile-version.json`: `1.0.0`, Build `1`              |
| Gemeinsamer Frontend-Build        | `dist-native`, erstellt aus demselben React-/Vite-Code |
| Capacitor                         | `8.5.2`, zum Umsetzungszeitpunkt stabile npm-Version   |
| Mindestversion iOS                | iOS 15.0                                               |
| Apple Build-Anforderung           | Xcode 26 oder neuer, iOS-26-SDK oder neuer             |
| Android                           | minSdk 24, compileSdk 36, targetSdk 36                 |
| Android Build                     | Java 21, AGP 8.13.0, Gradle 8.14.3                     |

Die vorgeschlagene Produktions-ID muss vor der ersten Store-Registrierung der Organisation zugeordnet und bestätigt werden. Nach Veröffentlichung kann ein Android-Package nicht für ein Update ausgetauscht werden; auch die Apple-Identität ist an die angelegte App gebunden. Änderungen der ID erfordern außerdem die Anpassung von nativen Projektdateien, Auth-Redirects, Firebase und Signing-Profilen. `CAPACITOR_ENV=development` ändert die synchronisierte Capacitor-Identität; Xcode Debug und Android Debug verwenden unabhängig davon den Suffix `.dev`.

Die App enthält ihre Frontend-Dateien im Paket. `capacitor.config.ts` enthält keine `server.url`, erlaubt keine beliebige Navigation und verwendet keine Remote-JavaScript-Updatepakete. Entwicklungsbuilds werden ebenfalls lokal paketiert. Der normale Vite-Entwicklungsserver bleibt für die Web-Entwicklung verfügbar.

Die bisherige helle Web-Gestaltung bleibt erhalten. iOS und Android sind ausdrücklich auf eine helle App-Oberfläche eingestellt, auch wenn das Betriebssystem den Dunkelmodus verwendet. Ein vollständiges zweites dunkles App-Theme wird nicht als umgesetzt behauptet.

## Verifizierte offizielle Anforderungen

- [Capacitor – Entwicklungsumgebung](https://capacitorjs.com/docs/getting-started/environment-setup): Node ab 22; Xcode ab 26; Android Studio ab 2025.2.1, alternativ SDK-Werkzeuge für CLI-Builds.
- [Capacitor – Version 8](https://capacitorjs.com/docs/updating/8-0): iOS 15, Android API 36, AGP 8.13.0 und Gradle 8.14.3. Die erzeugten Projektdateien wurden damit abgeglichen.
- [Capacitor – Version 8.5](https://capacitorjs.com/docs/updating/8-5): UIScene-Lifecycle. Das erzeugte iOS-Projekt enthält `SceneDelegate.swift`; die eigene Bridge wird dort eingebunden.
- [Apple – aktuelle Anforderungen](https://developer.apple.com/news/upcoming-requirements/): Seit 28. April 2026 müssen neue Uploads mit Xcode 26 und dem iOS-26-SDK oder neuer gebaut werden.
- [Google Play – Target-API-Anforderungen](https://support.google.com/googleplay/android-developer/answer/11926878): Seit 31. August 2026 benötigen neue Smartphone-Apps und Updates mindestens Target API 36.

Diese veränderlichen Anforderungen sind vor jedem tatsächlichen Store-Release erneut zu prüfen.

## Drei Update-Arten

**A – Server:** Änderungen an bestehenden Supabase-Daten, sicheren Edge Functions, Kategorien, serverseitig ausgewerteter Konfiguration und fachlichen Statuswerten gelten für alle Clients. Abwärtskompatibilität zu bereits installierten nativen Versionen muss erhalten bleiben. Eine neue API darf keine sofortige Installation eines Store-Updates voraussetzen.

**B – Frontend:** Komponenten, Validierungen, Routen und Business-Logik werden einmal im gemeinsamen `src/` geändert. Der Web-Build wird im bestehenden Vercel-Prozess bereitgestellt. Der gleiche geänderte Quellcode gelangt erst mit einem neuen nativen Paket auf iOS/Android. Ein Server-Deployment aktualisiert kein bereits installiertes JavaScript-App-Paket.

**C – Native:** Neue Berechtigungen, native Swift-/Java-Änderungen, SDKs oder Capacitor-Plugins benötigen einen neuen Store-Build. Es gibt keine Funktion zum Umgehen der Store-Prüfung durch nachgeladenen ausführbaren Anwendungscode.

## Lokaler Ablauf

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run mobile:sync
npx cap open ios
npx cap open android
```

`mobile:sync` baut den separaten nativen Frontend-Output, überträgt die Version nach Xcode und synchronisiert beide Plattformen. Android liest dieselbe `mobile-version.json` direkt. Temporäre CI-Overrides `APP_VERSION` und `BUILD_NUMBER` werden von beiden Plattformen berücksichtigt. Ein Release-Tag muss exakt `v` plus der Version in `mobile-version.json` entsprechen. Build-Nummern müssen global je Store-App monoton steigen; der CI-Laufzähler ist nur dann geeignet, wenn niemals höhere Nummern außerhalb dieser Pipeline vergeben wurden. Bei manuellen Releases ist die nächste zulässige Nummer explizit anzugeben.

```sh
# Ohne Android-Studio-Oberfläche möglich; JAVA_HOME und ANDROID_HOME setzen.
./android/gradlew --project-dir android --no-daemon assembleDebug bundleRelease lintDebug

# Ohne Signing für den Simulator; vollständiges Xcode erforderlich.
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Ein unsigniertes Release-AAB ist ein Build-Nachweis, kein hochladbares Store-Paket. Debug-APK und Simulator-App benötigen keine bezahlten Store-Konten. Für physische iOS-Testgeräte gelten Apples Signing-Voraussetzungen.

## CI/CD im Repository

- `.github/workflows/ci.yml` erhält die bestehende Web-/Datenbankprüfung einschließlich Lint, Typen, Tests und Browser-Tests.
- `.github/workflows/native.yml` ergänzt einen Android-Debug-/AAB-/Lint-Build sowie einen unsignierten iOS-Simulator-Build. Öffentliche synthetische CI-Konfiguration dient ausschließlich der Kompilierungsprüfung; diese Artefakte sind ausdrücklich `compatibility-only`.
- `.github/workflows/mobile-release.yml` reagiert auf Release-Tags oder manuellen Start. Die Jobs bleiben deaktiviert, bis `MOBILE_RELEASE_ENABLED=true` gesetzt ist. Ein geschütztes GitHub Environment `store-release` schützt echte Konfiguration und Signing-Material. Ein vorgeschalteter Quality-Job prüft npm-Audit, TypeScript, ESLint, Tests, Web-/Native-Build und Client-Secret-Muster. Die Pipeline validiert reale HTTPS-Backend-Konfiguration, stellt Signing-Dateien kurzzeitig her und erzeugt signierte `.aab`-/`.ipa`-Artefakte. Fehlende Credentials führen zu einem Fehler und werden nicht ersetzt.
- Store-Übermittlung und Store-Review sind separat durchzuführen. Automatisches Veröffentlichen im produktiven Store ist nicht aktiviert. Die signierten Artefakte können später in einen geschützten Upload-Schritt übernommen werden.

Die CI-Dateien wurden erstellt; ein tatsächlicher GitHub-Actions-Lauf erfordert Push/Repository-Einrichtung und wurde in dieser lokalen Arbeit nicht ausgelöst.

## Exakt benötigte spätere CI-Werte

Repository-Variable: `MOBILE_RELEASE_ENABLED=true` erst nach vollständiger Konto-/Signing-Einrichtung.

Im geschützten Environment `store-release`:

| Name                          | Art                      | Verwendung                                                        |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `VITE_SUPABASE_URL`           | öffentliche Variable     | Tatsächliche HTTPS-Backend-URL                                    |
| `VITE_SUPABASE_ANON_KEY`      | öffentlicher Client-Key  | Für Client-Zugriff vorgesehener Schlüssel; kein Service-Role-Key  |
| `VITE_PUSH_ENABLED`           | Variable                 | Nur `true`, wenn APNs/FCM und Token-Backend einsatzbereit sind    |
| `ANDROID_KEYSTORE_BASE64`     | Secret                   | Base64 der Upload-Keystore-Datei                                  |
| `ANDROID_KEYSTORE_PASSWORD`   | Secret                   | Keystore-Passwort                                                 |
| `ANDROID_KEY_ALIAS`           | Secret                   | Upload-Key-Alias                                                  |
| `ANDROID_KEY_PASSWORD`        | Secret                   | Passwort des Upload-Keys                                          |
| `GOOGLE_SERVICES_JSON_BASE64` | geschützte Konfiguration | Firebase-Datei für das Produktions-Package, bei Push erforderlich |
| `APPLE_TEAM_ID`               | Variable                 | Tatsächliche Organisation/Apple-Team-ID                           |
| `IOS_PROFILE_NAME`            | Variable                 | Tatsächlicher App-Store-Profilname                                |
| `IOS_CERTIFICATE_BASE64`      | Secret                   | Distribution-Zertifikat mit privatem Schlüssel als `.p12`         |
| `IOS_CERTIFICATE_PASSWORD`    | Secret                   | Passwort der `.p12`-Datei                                         |
| `IOS_PROFILE_BASE64`          | Secret                   | Passendes App-Store-Provisioning-Profil mit Push-Capability       |
| `IOS_KEYCHAIN_PASSWORD`       | Secret                   | Zufälliges Passwort für den temporären CI-Keychain                |

`ANDROID_KEYSTORE_PATH` wird zur Laufzeit durch `prepare-release-secrets.py` gesetzt; es gehört nicht als absoluter Entwicklerpfad ins Repository. Der Helfer prüft bei iOS Team, Profilname und App-Identität, gibt keine Secret-Werte aus und erstellt die ExportOptions-Datei aus den realen Werten. Nach dem Build werden temporäre Schlüsseldateien und der CI-Keychain entfernt. Ein Firebase-Server-Key oder APNs-Privatschlüssel gehört ausschließlich in den späteren Push-Sendedienst, niemals in `VITE_*`.

## Deep Links und Auth-Freigaben

Registriert sind `de.alberring.connect://auth/callback` beziehungsweise die `.dev`-Variante. Native Redirects verwenden PKCE und dieselben Supabase-Benutzer. Die exakten Redirect-URLs müssen später in Supabase zugelassen werden, einschließlich der benötigten Recovery-Weiterleitung. Custom Schemes können durch andere Apps beansprucht werden; PKCE bindet den Austausch an den ursprünglichen Client. Es werden keine beliebigen Bearer-Token-URLs als neue Session übernommen.

Universal Links/App Links sind bewusst nicht mit erfundenen Apple-Team-IDs oder Android-Zertifikat-Fingerprints aktiviert. Nach Einrichtung werden `apple-app-site-association` und `assetlinks.json` im vorhandenen Web-Hosting bereitgestellt; danach werden Associated Domains beziehungsweise verifizierte Android-Link-Filter ergänzt und auf Geräten getestet. Dafür ist keine neue Hosting-Plattform erforderlich.

## Release-Abnahme

Vor TestFlight/Internal Testing: reale Geräte für Kamera/System-Photo-Picker, Standortpräzision, verweigerte und permanente Permissions, Audio-Abbruch, Android Zurück, Tastatur/Safe Areas, Neustart/Session-Restore, Logout, Offline und Notification-Taps prüfen. Push muss für Vordergrund, Hintergrund und beendete App mit realen APNs-/FCM-Credentials geprüft werden. Anschließend Privacy-Angaben, technische Datengrundlage, Mitarbeiterzugang, Review-Zugang ohne personenbezogene Echtdaten und Store-Screenshots abnehmen. Reale Produktionsdaten gehören nicht in Build-Artefakte oder Screenshots.

## Geprüfter Web-Deployment-Workflow

`.github/workflows/web-release.yml` bereitet den Ablauf CI-Erfolg auf `main` → Build im bestehenden Vercel-Projekt → überprüftes `--prebuilt`-Deployment vor. Er ist durch `VERCEL_DEPLOY_ENABLED=true` ausdrücklich zu aktivieren und verwendet das geschützte GitHub-Environment `production`. `VERCEL_TOKEN` liegt als Secret, `VERCEL_ORG_ID` und `VERCEL_PROJECT_ID` als Environment-Variablen vor. Der Workflow checkt exakt den erfolgreich geprüften Commit aus und akzeptiert keine Pull-Request-/Fremdrepository-Trigger. Vercel CLI ist auf 59.20.0 festgelegt.

Vor Aktivierung die bisherige Vercel-Git-Integration so abstimmen, dass sie nicht parallel ungeprüfte Produktionsdeployments erstellt. Repo-Branchschutz, erforderliche CI-Checks und Environment-Regeln im Hosting-/GitHub-Konto ergänzen. Kein neues Vercel-Projekt anlegen. Die Pipeline-Datei allein richtet diese Kontoeinstellungen nicht ein. Während dieser Arbeit wurde sie nicht aktiviert und kein Produktionsdeployment ausgeführt.

Quelle: [Vercel GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel), [Vercel prebuilt Deployment](https://vercel.com/docs/cli/deploy), geprüft am 17.09.2026.

## Tatsächliche lokale native Prüfung

Ein JDK 21.0.12.1 und die offiziellen Android-CLI-Werkzeuge wurden unter einem temporären lokalen Toolchain-Pfad heruntergeladen; die Archive wurden anhand ihrer veröffentlichten SHA-256-Werte geprüft. SDK 36, Build Tools 36.0.0 und ein Android-36-ARM-Emulator wurden eingerichtet. Android Studio war dafür nicht erforderlich. `assembleDebug`, das unsignierte `bundleRelease`, Android Lint und das Instrumentation-Testpaket wurden erfolgreich kompiliert.

Zwei Instrumentation-Tests liefen erfolgreich gegen den echten AndroidKeyStore des Emulators. Sie prüfen verschlüsseltes Speichern/Lesen, keine Klartextablage, unterschiedliche GCM-Nonces bei wiederholten Schreibvorgängen, Löschen, ungültige Schlüssel und Fehler bei manipulierten Ciphertext-Daten. Die Tests verwenden einen eigenen temporären Testschlüssel und berühren keine Supabase-Benutzersession.

Im gestarteten Emulator wurden die echte Login-Oberfläche, das Verhalten mit Bildschirmtastatur sowie die Offline-Meldung nach Deaktivierung von WLAN/Mobilfunk betrachtet. Betriebssystem-Back schloss die Tastatur. Die Netzwerkeinstellungen wurden anschließend wiederhergestellt. Native Screenshots liegen unter `docs/screenshots/12-android-login.png` bis `15-android-permissions.png`. Die System-Permissions waren zu diesem Zeitpunkt noch nicht angefragt; dieses Bild ist kein Nachweis einer Kameranutzung.

Die Swift-Dateien wurden mit dem vorhandenen Swift-Parser syntaktisch geprüft, die Xcode-Projekt-/Plist-Dateien erfolgreich geparst. Das ersetzt keinen iOS-SDK-Build. Vollständiges Xcode und damit iOS-Simulator/App-Store-Build fehlen lokal weiterhin. Reale Anmeldung, APNs/FCM-Zustellung und Kamera-/Mikrofon-/Standort-Hardwareabnahme sind zusätzlich zu den aufgezeichneten Tests erforderlich. Ein kompakter Build-Nachweis befindet sich unter `docs/evidence/android-build.txt`.
