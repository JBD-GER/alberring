# Chat-Mitteilungen und App-Kennzeichen

Version 1.0.7 (15) ergänzt die Aktivierung von Chat-Push nach der Anmeldung und in den Einstellungen. Eine ausdrückliche Nutzeraktion aktiviert die Kategorie „Nachrichten“ und fragt die Betriebssystemberechtigung an. Andere Kategorien, E-Mail-Präferenzen und Ruhezeiten bleiben erhalten. Android registriert vor dieser Aktion keinen FCM-Token automatisch.

Der Server verwendet APNs für iOS und FCM v1 für Android. Der Sperrbildschirm erhält nur einen allgemeinen Hinweis, eine technische Benachrichtigungs-ID und einen internen Zielpfad. Chattexte, Namen und Dokumente sind nicht Teil des Push-Payloads. Die Zahl auf iOS wird aus noch ungelesenen und zugänglichen Hinweisen berechnet. Android verwendet aktive Benachrichtigungen; Zahl oder Punkt hängen vom Launcher und den Geräteeinstellungen ab.

Lesebestätigungen markieren zugehörige Hinweise als gelesen. Ein verspäteter Versand für bereits gelesene Nachrichten, archivierte Chats, gesperrte Absender oder stummgeschaltete Gruppen wird unterdrückt. Beim Öffnen, Lesen und Fortsetzen der App werden Kennzeichen und Benachrichtigungsablage abgeglichen. Abmelden widerruft die Gerätezuordnung und leert lokale Hinweise. Ein anderes Gerät wird spätestens bei seiner nächsten Synchronisierung aktualisiert.

Chatversand stößt die vorhandene, mit einem separaten Geheimnis geschützte Automation nach dem Datenbank-Commit an. Cron prüft ausstehende Zustellungen zusätzlich minütlich. Gerätebezogene Zustellungsbelege und Claims mit Sperre und Lease verhindern parallele Doppelbearbeitung. Ein Provider-Ausfall blockiert das Speichern der Nachricht nicht.

## Betreiberkonfiguration

- Supabase-Geheimnisse: `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `FCM_SERVICE_ACCOUNT_JSON`. Keine privaten Schlüssel in App, Repository oder Logs.
- Signierte iOS-Builds benötigen eine App-ID und ein App-Store-Profil mit Push-Berechtigung. APNs-Schlüssel auf das Produktions-Thema der App begrenzen.
- Android benötigt eine Firebase-App für das bestehende Package. `GOOGLE_SERVICES_JSON_BASE64` wird als geschütztes Build-Geheimnis eingebunden; kein Analytics-SDK.
- `VITE_PUSH_ENABLED=true` erst für die jeweilige Release-Umgebung setzen, wenn die zugehörigen Provider- und Build-Zugänge eingerichtet sind.
- Nach Freigabe einmal auf einem angemeldeten Gerät aktivieren und mit einem zweiten isolierten Testkonto prüfen: App im Hintergrund, neue Nachricht, Hinweis öffnen, lesen, Kennzeichen prüfen, abmelden. Betriebssystemberechtigungen und Android-Batterieeinstellungen können Zustellungen unterdrücken; APNs/FCM garantieren keine Zustellzeit.

## Automatische Prüfung

`supabase/tests/chat_push_badges.test.sql` prüft Sichtbarkeit, Lesestatus, archivierte/stummgeschaltete Chats und Kontogrenzen. Die Clienttests prüfen Registrierung, Abmeldung, langsame Antworten und das Wiederherstellen einer Sitzung. Die Provider-Tests prüfen signierte Requests, Zähler und die datensparsamen Payloads ohne echte Mitarbeiterdaten.
