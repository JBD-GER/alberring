# 05 · Dateiänderungen

Stand: 17.09.2026. Vergleich gegen den vor Beginn aufgenommenen SHA-256-Arbeitsstand; bereits vorhandene uncommittete Änderungen sind darin enthalten und werden nicht pauschal der mobilen Erweiterung zugeschrieben. Generierte/ignorierte Build-Artefakte sind gesondert genannt. Keine Quelldateien wurden absichtlich entfernt.

Ausgangs-Commit: `8a7522565b371db96e946ad252a79be662398dce`. Manifest: `docs/evidence/arbeitsstand-vorher.json`. Ermittlung: `node scripts/document-changes.mjs`.

## Neu angelegte Dateien

- `.github/workflows/mobile-release.yml`
- `.github/workflows/native.yml`
- `.github/workflows/web-release.yml`
- `.prettierignore`
- `android/.gitignore`
- `android/app/.gitignore`
- `android/app/build.gradle`
- `android/app/capacitor.build.gradle`
- `android/app/proguard-rules.pro`
- `android/app/src/androidTest/java/de/alberring/connect/SecureStorageInstrumentedTest.java`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/de/alberring/connect/AlberringSecureStoragePlugin.java`
- `android/app/src/main/java/de/alberring/connect/AlberringSettingsPlugin.java`
- `android/app/src/main/java/de/alberring/connect/MainActivity.java`
- `android/app/src/main/res/drawable/alberring_logo.xml`
- `android/app/src/main/res/drawable/ic_launcher_foreground.xml`
- `android/app/src/main/res/drawable/splash.xml`
- `android/app/src/main/res/layout/activity_main.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/values/ic_launcher_background.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/values/styles.xml`
- `android/app/src/main/res/xml/data_extraction_rules.xml`
- `android/app/src/main/res/xml/file_paths.xml`
- `android/app/src/main/res/xml/network_security_config.xml`
- `android/build.gradle`
- `android/capacitor.settings.gradle`
- `android/gradle.properties`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/gradlew`
- `android/gradlew.bat`
- `android/settings.gradle`
- `android/variables.gradle`
- `capacitor.config.ts`
- `docs/01_IST_ANALYSE.md`
- `docs/02_SECURITY_AUDIT.md`
- `docs/03_RELEASE_PROZESS.md`
- `docs/04_AENDERUNGSDOKUMENTATION.md`
- `docs/05_DATEIAENDERUNGEN.md`
- `docs/06_ARCHITEKTUR.md`
- `docs/07_DATENSCHUTZ_STORE.md`
- `docs/08_STORE_SETUP_CHECKLISTE.md`
- `docs/09_ENTWICKLUNGSNACHWEIS.md`
- `docs/Foerderungsdokumentation_Mobile_App.md`
- `docs/Foerderungsdokumentation_Mobile_App.pdf`
- `docs/diagrams/gesamtarchitektur.mmd`
- `docs/evidence/ABSCHLUSSBERICHT.txt`
- `docs/evidence/NATIVE_NOTES.md`
- `docs/evidence/android-build.txt`
- `docs/evidence/arbeitsstand-vorher.json`
- `docs/evidence/backend-tests.txt`
- `docs/evidence/frontend-tests.md`
- `docs/evidence/mobile-device-flows.json`
- `docs/evidence/pdf-quality.json`
- `docs/screenshots/01-vorher-web-login.png`
- `docs/screenshots/02-nachher-web-login.png`
- `docs/screenshots/03-nachher-mobile-login.png`
- `docs/screenshots/04-mobile-dashboard.png`
- `docs/screenshots/05-web-dashboard.png`
- `docs/screenshots/06-mobile-navigation.png`
- `docs/screenshots/07-einstellungen-permissions.png`
- `docs/screenshots/08-permission-status.png`
- `docs/screenshots/09-chat-geraetefunktionen.png`
- `docs/screenshots/10-standort-abgelehnt.png`
- `docs/screenshots/11-mikrofon-fehlerzustand.png`
- `docs/screenshots/12-android-login.png`
- `docs/screenshots/12-offline-zustand.png`
- `docs/screenshots/13-android-offline.png`
- `docs/screenshots/13-photo-upload.png`
- `docs/screenshots/14-android-keyboard.png`
- `docs/screenshots/14-audio-recording.png`
- `docs/screenshots/15-android-permissions.png`
- `docs/screenshots/15-location-draft.png`
- `docs/screenshots/16-android-camera-settings.png`
- `docs/screenshots/NACHWEIS.json`
- `docs/screenshots/README.md`
- `ios/.gitignore`
- `ios/App/App.xcodeproj/project.pbxproj`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist`
- `ios/App/App/AlberringBridgeViewController.swift`
- `ios/App/App/AlberringSecureStoragePlugin.swift`
- `ios/App/App/AlberringSettingsPlugin.swift`
- `ios/App/App/App.entitlements`
- `ios/App/App/AppDelegate.swift`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json`
- `ios/App/App/Assets.xcassets/Contents.json`
- `ios/App/App/Assets.xcassets/Splash.imageset/Contents.json`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`
- `ios/App/App/Base.lproj/LaunchScreen.storyboard`
- `ios/App/App/Base.lproj/Main.storyboard`
- `ios/App/App/Info.plist`
- `ios/App/App/PrivacyInfo.xcprivacy`
- `ios/App/App/SceneDelegate.swift`
- `ios/App/CapApp-SPM/.gitignore`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/App/CapApp-SPM/README.md`
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift`
- `ios/debug.xcconfig`
- `mobile-version.json`
- `scripts/build-mobile-documentation.py`
- `scripts/check-client-security.mjs`
- `scripts/document-changes.mjs`
- `scripts/generate-mobile-assets.mjs`
- `scripts/prepare-release-secrets.py`
- `scripts/public-env.mjs`
- `scripts/public-env.test.mjs`
- `scripts/sync-mobile-version.mjs`
- `scripts/validate-release.mjs`
- `scripts/verify-mobile-device-flows.mjs`
- `scripts/verify-mobile-local.mjs`
- `scripts/verify-native-bundle.mjs`
- `src/components/common/AppErrorBoundary.tsx`
- `src/components/common/DeviceActions.test.tsx`
- `src/components/common/DeviceActions.tsx`
- `src/components/common/DevicePermissions.test.tsx`
- `src/components/common/DevicePermissions.tsx`
- `src/components/common/NetworkStatus.tsx`
- `src/components/common/PlatformRuntime.tsx`
- `src/components/common/PushSettings.tsx`
- `src/components/common/UploadProgress.tsx`
- `src/components/common/device-actions.css`
- `src/features/auth/AuthScreens.test.tsx`
- `src/services/platform/audio.ts`
- `src/services/platform/device-services.test.ts`
- `src/services/platform/links.test.ts`
- `src/services/platform/links.ts`
- `src/services/platform/location.ts`
- `src/services/platform/media.ts`
- `src/services/platform/network.test.ts`
- `src/services/platform/network.ts`
- `src/services/platform/permissions.ts`
- `src/services/platform/push.test.ts`
- `src/services/platform/push.ts`
- `src/services/platform/storage.test.ts`
- `src/services/platform/storage.ts`
- `src/services/platform/uploads.test.ts`
- `src/services/platform/uploads.ts`
- `src/styles/platform.css`
- `supabase/functions/_shared/download-url.test.ts`
- `supabase/functions/_shared/download-url.ts`
- `supabase/functions/_shared/push.test.ts`
- `supabase/functions/_shared/push.ts`
- `supabase/migrations/20260917073037_native_push_devices_and_audio.sql`
- `supabase/tests/native_push.test.sql`

## Gegenüber dem übernommenen Arbeitsstand geändert

- `.env.example`
- `.gitignore`
- `README.md`
- `docs/CAPACITOR_MIGRATION.md`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `scripts/validate-env.mjs`
- `src/app/ProtectedRoute.tsx`
- `src/app/router.tsx`
- `src/features/auth/AuthProvider.tsx`
- `src/features/auth/AuthScreens.tsx`
- `src/features/fleet/FleetPage.tsx`
- `src/features/messaging/Messaging.tsx`
- `src/features/settings/Settings.tsx`
- `src/lib/supabase.ts`
- `src/main.tsx`
- `src/services/platform/index.ts`
- `supabase/SETUP_FRESH.sql`
- `supabase/SETUP_UPGRADE_20260710.sql`
- `supabase/functions/create-secure-download/index.ts`
- `supabase/functions/send-notification-batch/index.ts`
- `vercel.json`
- `vite.config.ts`

## Entfernte Dateien

Keine.

## Dependencies

### dependencies

| Paket                           | Vorher          | Nachher |
| ------------------------------- | --------------- | ------- |
| @capacitor/android              | nicht vorhanden | 8.5.2   |
| @capacitor/app                  | nicht vorhanden | 8.1.1   |
| @capacitor/camera               | nicht vorhanden | 8.2.4   |
| @capacitor/core                 | nicht vorhanden | 8.5.2   |
| @capacitor/filesystem           | nicht vorhanden | 8.1.3   |
| @capacitor/geolocation          | nicht vorhanden | 8.2.2   |
| @capacitor/ios                  | nicht vorhanden | 8.5.2   |
| @capacitor/keyboard             | nicht vorhanden | 8.0.5   |
| @capacitor/network              | nicht vorhanden | 8.0.1   |
| @capacitor/push-notifications   | nicht vorhanden | 8.1.2   |
| @capacitor/splash-screen        | nicht vorhanden | 8.0.2   |
| @capgo/capacitor-audio-recorder | nicht vorhanden | 8.2.9   |

### devDependencies

| Paket          | Vorher          | Nachher |
| -------------- | --------------- | ------- |
| vitest         | 4.1.10          | 4.1.11  |
| @capacitor/cli | nicht vorhanden | 8.5.2   |

Keine direkten bestehenden Dependencies wurden entfernt. Transitive Sicherheitsupdates sind vollständig im Lockfile nachvollziehbar. Das gezielte Override `xcode → uuid 11.1.1` ersetzt die verwundbare UUID-Version des CLI-Werkzeugs; die unveränderte v4-Nutzung wurde gegen das erzeugte Xcode-Projekt geprüft.

## Geänderte/neue Scripts

| Script         | Befehl                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| build:native   | `node scripts/validate-env.mjs native && tsc -b && vite build --mode native --outDir dist-native && node scripts/verify-native-bundle.mjs` |
| mobile:version | `node scripts/sync-mobile-version.mjs`                                                                                                     |
| mobile:sync    | `npm run build:native && npm run mobile:version && cap sync`                                                                               |
| mobile:ios     | `cap open ios`                                                                                                                             |
| mobile:android | `cap open android`                                                                                                                         |
| android:aab    | `npm run mobile:sync && android/gradlew --project-dir android bundleRelease`                                                               |
| test:mobile    | `vitest run src/services/platform`                                                                                                         |
| security:check | `node scripts/check-client-security.mjs`                                                                                                   |

## Environment und Konfiguration

| Name                                                                                                  | Ort/Zweck                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY                                                            | Bestehende öffentliche Frontendwerte; Validierung gehärtet                                                   |
| VITE_APP_URL                                                                                          | Bestehender optionaler öffentlicher Webwert, Allowlist                                                       |
| VITE_PUSH_ENABLED                                                                                     | Neuer öffentlicher Schalter, Standard false                                                                  |
| VITE_PUSH_ENVIRONMENT                                                                                 | development oder production; APNs-Umgebung                                                                   |
| CAPACITOR_ENV                                                                                         | Lokale CLI-Konfiguration production/development                                                              |
| BUILD_NUMBER                                                                                          | Positive monotone native Buildnummer in CI                                                                   |
| APP_VERSION                                                                                           | Optionaler expliziter Versionswert für iOS/Android; Standard aus mobile-version.json                         |
| ALLOWED_ORIGINS                                                                                       | Bestehendes Function-Secret um genau bekannte native Origins ergänzen                                        |
| APNS_PRIVATE_KEY / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_DEVELOPMENT_BUNDLE_ID           | Nur Supabase Edge, späterer APNs-Zugang                                                                      |
| FCM_SERVICE_ACCOUNT_JSON                                                                              | Nur Supabase Edge, späterer FCM-Zugang                                                                       |
| APP_SUPABASE_PUBLIC_URL                                                                               | Optional nur Server: öffentliche Storage-Origin hinter lokalem Reverse Proxy                                 |
| ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD        | Geschützte CI-Signing-Secrets                                                                                |
| ANDROID_KEYSTORE_PATH                                                                                 | Lokaler Pfad zum temporär bereitgestellten Signing-Keystore, kein Clientwert                                 |
| GOOGLE_SERVICES_JSON_BASE64                                                                           | Geschützte CI-Firebase-Konfiguration                                                                         |
| APPLE_TEAM_ID / IOS_PROFILE_NAME                                                                      | CI-Identität/Profilreferenz                                                                                  |
| IOS_CERTIFICATE_BASE64 / IOS_CERTIFICATE_PASSWORD / IOS_PROFILE_BASE64 / IOS_KEYCHAIN_PASSWORD        | Geschützte CI-Signing-Secrets                                                                                |
| MOBILE_RELEASE_ENABLED                                                                                | Repository-Freigabeschalter für spätere signierte Artefakte                                                  |
| VERCEL_DEPLOY_ENABLED / VERCEL_ORG_ID / VERCEL_PROJECT_ID / VERCEL_TOKEN                              | Vorbereiteter CI-Webrelease im vorhandenen Projekt; Token ausschließlich Secret                              |
| LOCAL_APP_URL                                                                                         | Lokale Browserprüfung, Standard http://127.0.0.1:5174                                                        |
| MOBILE_TEST_ACCESS_FILE / MOBILE_TEST_BASE_URL / MOBILE_TEST_SCREENSHOT_DIR / MOBILE_TEST_RESULT_FILE | Ausschließlich Prüfskript: externe lokale Zugangsdatei, Testserver und Ausgabepfade; keine App-Konfiguration |

Werte von Zugangsdaten sind absichtlich nicht enthalten. Zusätzliche lokale Testzugänge lagen ausschließlich außerhalb des Repositorys in Dateien mit Modus 0600. Keine Änderungen der produktiven Environment-Werte wurden vorgenommen.

## Erzeugte, nicht versionierte Artefakte

- `dist/`: Web-PWA.
- `dist-native/`: lokales Frontend für Capacitor.
- Native kopierte `public`-/Assets-Verzeichnisse aus `cap sync`.
- `android/app/build/outputs/apk/debug/app-debug.apk` und `android/app/build/outputs/bundle/release/app-release.aab`.
- Lokale SDK/JDK/Emulator-Dateien unter einem temporären Toolchain-Verzeichnis; keine Repository-Abhängigkeit dieses Pfades.
- Testberichte/Browserprofile enthalten keine neuen Produktfunktionen und werden nicht eingecheckt.

## Übernommene fremde Änderungen

Das Ausgangsmanifest enthält den ursprünglichen `git status` mit Änderungen an Fachmodulen, Dokumentation, Benutzer-/Freigabe-/Fuhrpark-RPCs und deren Tests. Diese Vorgeschichte bleibt erhalten. Nur Änderungen der Inhaltsprüfsummen seit diesem Manifest erscheinen oben als neue mobile Bearbeitung. Keine früheren Migrationen wurden zurückgesetzt oder entfernt.
