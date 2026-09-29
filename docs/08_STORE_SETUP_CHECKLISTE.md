# 08 – Store-Setup-Checkliste

Stand: 17. September 2026. **ERLEDIGT** bedeutet in dieser Datei eine im Repository tatsächlich vorhandene Vorbereitung. Es bedeutet keine Store-Zulassung, keinen signierten Release und keinen erfolgreichen Gerätetest. Vor Veröffentlichung bleibt die in der Testdokumentation ausgewiesene Geräte-/Signing-Abnahme erforderlich.

## Gemeinsame Voraussetzungen

- **ERLEDIGT:** Gemeinsamer React-Code; gebündelter nativer Build `dist-native`; Capacitor 8.5.2; `/ios` und `/android`; keine Remote-WebView-Produktion.
- **ERLEDIGT:** Produktionsidentität `de.alberring.connect` und separate Entwicklungsidentität `.dev`; Version `1.0.0`, Build `1` in `mobile-version.json`.
- **ERLEDIGT:** Native Icons/Splash aus der vorhandenen Alberring-Grafik; reproduzierbare Erzeugung mit `node scripts/generate-mobile-assets.mjs`. Dies sind App-Assets, keine erfundenen Laufzeit-Screenshots.
- **ERLEDIGT:** HTTPS-Netzwerkregeln, keine Android-Backups der App-Daten, Keychain-/Keystore-Brücken, kontextbezogene Berechtigungen, keine Hintergrundstandort-/Hintergrundaudio-Modi.
- **ERLEDIGT:** Helle Oberfläche auf beiden Plattformen, auch unter dunkler Systemeinstellung. Vollständiges dunkles App-Theme wird nicht behauptet.
- **ERLEDIGT:** Native Kompatibilitäts-CI und geschützte, zunächst deaktivierte Signing-Pipeline; exakte Werte in [03_RELEASE_PROZESS.md](03_RELEASE_PROZESS.md).
- **SPÄTER MIT DEVELOPER ACCOUNT / RELEASE-VERANTWORTLICHEN:** Produktions-ID und Organisationsinhaber endgültig bestätigen, echte Backend-/Redirect-Konfiguration, Datenschutzprüfung, Geräteabnahme und echte Store-Screenshots. Native Features sind bis zur Geräteabnahme nicht als fertig zertifiziert zu betrachten.

## Apple

1. **SPÄTER MIT DEVELOPER ACCOUNT:** Organisation im Apple Developer Program registrieren; vertretungsberechtigte Person, Organisationsdaten und gegebenenfalls D‑U‑N‑S-Daten prüfen. App unter der tatsächlichen verantwortlichen Organisation veröffentlichen.
2. **ERLEDIGT:** Xcode-Projekt mit iOS-15-Deployment-Target und Swift Package Manager. **SPÄTER:** Vollständiges Xcode 26+ mit iOS-26-SDK installieren/auswählen; das lokale System hatte nur Command Line Tools. iOS-Kompilierung und Simulator-/Gerätetests dort nachholen.
3. **SPÄTER MIT DEVELOPER ACCOUNT:** Explizite Bundle-ID `de.alberring.connect` registrieren; Push Notifications aktivieren. Entwicklung bei Bedarf separat unter `.dev` registrieren. Keine Apple-Team-ID ist erfunden oder im Projekt als echte ID eingetragen.
4. **ERLEDIGT:** APNs-Callbacks im AppDelegate; `aps-environment` über Debug/Release; Notification-Plugin und Foreground-Konfiguration. **SPÄTER:** Echte APNs-Berechtigung, Auth-Key/Zertifikat und passenden Push-Sendedienst konfigurieren. Keine APNs-Schlüssel in Client/App-Bundle aufnehmen.
5. **SPÄTER MIT DEVELOPER ACCOUNT:** Apple-Distribution-Zertifikat erzeugen, privaten Schlüssel geschützt sichern, App-Store-Provisioning-Profil mit exakt passender Bundle-ID und Push-Entitlement erstellen. Ablaufdatum/Rotation dokumentieren. Die Pipeline benötigt die Werte aus Dokument 03.
6. **SPÄTER MIT DEVELOPER ACCOUNT:** App Store Connect App-Datensatz, Name, primäre Sprache, SKU, Bundle-ID und Team festlegen. Geschäfts-/EU-Händlerangaben und aktuelle Altersfreigaben vervollständigen.
7. **ERLEDIGT:** Kamera-, Foto-, Mikrofon- und When-In-Use-Standort-Erklärungstexte, Privacy-Manifest für benötigte Dateizeitstempelzugriffe, keine Tracking-Domains. Der zusätzliche Plist-Text `NSLocationAlwaysAndWhenInUseUsageDescription` ist laut [Capacitor-Geolocation-Dokumentation](https://capacitorjs.com/docs/apis/geolocation) für das eingebundene iOS-SDK erforderlich; er erteilt keine Berechtigung. Die App fordert keine Always-Freigabe an und aktiviert keine Hintergrundortung. **SPÄTER:** Im gebauten Archiv alle SDK-Privacy-Manifeste prüfen und App-Privacy-Fragen mit der tatsächlichen Datenverarbeitung abgleichen. Leere Antworten dürfen nicht pauschal als „keine Daten“ übernommen werden.
8. **SPÄTER MIT DEVELOPER ACCOUNT:** Signierten Archive-/Export-Lauf durchführen; echte `.ipa` in App Store Connect/Transporter hochladen. TestFlight-Tester, interne/externe Prüfung und Fehlerbehebung durchführen. Die lokale Arbeit hat keine `.ipa` ohne Credentials erfunden.
9. **SPÄTER MIT DEVELOPER ACCOUNT:** Universal Links bei Bedarf auf bestehender Hosting-Domain ergänzen: echtes Team-Präfix in `apple-app-site-association`, Associated Domains und Geräteverifikation. Custom-Scheme-/PKCE-Flow vorher separat kalt und warm testen.
10. **SPÄTER MIT DEVELOPER ACCOUNT:** Store-Screenshots direkt aus laufender, abgenommener App erstellen; iPhone/iPad-Anforderungen im aktuellen App Store Connect prüfen. Beschreibung, Support-URL, technische Datenschutzgrundlage für juristische Erklärung, Review-Hinweise und eingeschränktes Testkonto ohne echte Mitarbeiterdaten ergänzen.
11. **SPÄTER MIT DEVELOPER ACCOUNT:** Review einreichen, Rückfragen beantworten, Freigabe-/Rollout-Zeitpunkt festlegen. Bei der Mitarbeiter-App zusätzlich entscheiden, ob öffentliche Distribution oder eine für die Organisation geeignete nicht öffentliche Apple-Vertriebsform verwendet wird.

Offizielle Einstiegspunkte: [Apple Developer Program](https://developer.apple.com/programs/), [App-Store-Einreichung](https://developer.apple.com/app-store/submitting/), [aktuelle SDK-Anforderungen](https://developer.apple.com/news/upcoming-requirements/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/).

## Google

1. **SPÄTER MIT DEVELOPER ACCOUNT:** Google Play Console Organisationskonto eröffnen; Organisations-/Identitätsprüfung und aktuelle Kontovoraussetzungen abschließen. Verantwortung, Eigentum und Wiederherstellung des Kontos dokumentieren.
2. **ERLEDIGT:** Reale Android-Debug-/AAB-/Lint-Kompilierung und zwei Secure-Storage-Tests im Android-36-Emulator; echte Login-/Offline-/Tastatur-Screenshots. Android-Projekt, minSdk 24, compileSdk/targetSdk 36, Java 21, AGP 8.13.0, Gradle 8.14.3. Der zum Umsetzungsdatum geforderte Target API 36 ist eingestellt.
3. **SPÄTER MIT DEVELOPER ACCOUNT:** Play-App anlegen und Package `de.alberring.connect` endgültig festlegen. Das spätere Package einer veröffentlichten App ist nicht als normale Versionsänderung austauschbar.
4. **SPÄTER MIT DEVELOPER ACCOUNT:** Play App Signing einrichten; Upload-Key erzeugen und getrennt vom App-Signing-Key verwalten; Passwort-/Keystore-Backups geschützt halten. Reale Upload-Zertifikat-Fingerprints dokumentieren. Keine Keystore-Datei oder deren Passwort committen.
5. **ERLEDIGT:** `bundleRelease` und Signing-Konfiguration über sichere Umgebungswerte. Ohne Keys bleibt der lokale Build unsigniert. **SPÄTER:** Signiertes `.aab` erzeugen und Integrität, VersionCode und Zertifikat prüfen, bevor es hochgeladen wird.
6. **ERLEDIGT:** `POST_NOTIFICATIONS`, Notification Channel `alberring-updates`, FCM-Plugin und abschaltbarer Push-Client. **SPÄTER:** Firebase-Projekt/Android-App mit richtigem Package anlegen, `google-services.json` geschützt in Build übernehmen, FCM-v1-Servicekonto ausschließlich backendseitig nutzen, APNs für iOS separat anbinden.
7. **ERLEDIGT:** Präziser/ungefährer Standort während Nutzung; System-Photo-Picker; keine umfassenden Android-Medienbibliotheksrechte; Mikrofon nur durch Nutzerhandlung; keine Background-Location-Permission. **SPÄTER:** Play-Datensicherheitsangaben für Identität, Kommunikation, Fotos/Audio, Standort, Diagnostik und tatsächliche SDK-/Backend-Flüsse mit Datenschutzverantwortlichen prüfen.
8. **SPÄTER MIT DEVELOPER ACCOUNT:** Content Rating, Zielgruppe, App-Zugang/Review-Konto, Werbung-/Gesundheits- und sonstige tatsächlich anwendbare Erklärungen ausfüllen. Die Mitarbeiter-App verarbeitet Personal-/Gesundheitsbezüge; eine pauschale „keine sensiblen Daten“-Antwort wäre unzutreffend.
9. **SPÄTER MIT DEVELOPER ACCOUNT:** Store Listing mit Beschreibung, Support-Kontakt, Datenschutz-URL und echten Geräte-Screenshots. Keine Screenshots mit personenbezogenen Mitarbeiterdaten hochladen.
10. **SPÄTER MIT DEVELOPER ACCOUNT:** Internal Testing durchführen; anschließend die für das konkrete Konto geltenden Test-/Produktionszugangsbedingungen erfüllen. Physische Geräte verschiedener Android-Versionen und Hersteller prüfen, insbesondere Kamera-Rückkehr, restriktive Permissions, Tastatur, Edge-to-Edge, Logout und FCM-Tokenrotation.
11. **SPÄTER MIT DEVELOPER ACCOUNT:** Für verifizierte App Links echte SHA-256-Fingerprints des Play-App-Signing-Zertifikats und Package in `assetlinks.json` auf dem bestehenden Hosting hinterlegen; Manifest ergänzen und Linkverifikation auf Geräten prüfen.
12. **SPÄTER MIT DEVELOPER ACCOUNT:** Produktionsrelease prüfen, gestaffelten Rollout und Rücknahmeplan festlegen. Automatisierte Store-Uploads erst nach erfolgreicher manueller Signatur-/Testabnahme an die vorbereiteten Release-Artefakte anschließen.

Offizielle Einstiegspunkte: [Play Console](https://play.google.com/console/about/), [App Signing](https://developer.android.com/studio/publish/app-signing), [Target API](https://support.google.com/googleplay/android-developer/answer/11926878), [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469).

## Abschließende Freigaberegel

Repository-Vorbereitung, erfolgreicher Build, erfolgreicher Sync und Store-Zulassung sind unterschiedliche Nachweise. Die dokumentierten echten Testergebnisse sind maßgeblich. Fehlende Konten, Signing-Keys, Firebase/APNs-Konfiguration und native Geräteabnahme bleiben offen, bis sie mit realen Werten und realen Geräten nachgewiesen wurden.
