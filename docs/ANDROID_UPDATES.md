# Private Android-Verteilung und Updates

Die signierte Android-App wird über `https://app.alberring.de/android` verteilt.
Der Download erfordert ein aktives Mitarbeiterkonto; Storage prüft zusätzlich
den Mitarbeiter- und Organisationsstatus. Es gibt keine öffentliche
Google-Play-Produktivveröffentlichung.

## Für Mitarbeitende

Ab Version 1.0.4 prüft die installierte Android-App nach der Anmeldung, bei der
Rückkehr in die App und stündlich im Vordergrund auf eine neuere Version.
„Update herunterladen“ öffnet den geschützten Download im Browser. Dort ggf.
anmelden, die APK herunterladen und Androids Installation bestätigen. Die
Direktversion wird ohne vorherige Deinstallation aktualisiert. „Morgen erinnern“
blendet dieselbe Version für 24 Stunden aus. Eine noch neuere Version wird sofort
beim nächsten erfolgreichen Abruf angezeigt. Bei fehlendem Netz bleibt die App
nutzbar. Die Prüfung installiert nichts selbst und blockiert keine Formulare.

Ältere Versionen ohne diese Funktion benötigen einmalig das manuelle Update auf
1.0.4. Eine noch installierte Play-Testversion muss wegen der anderen Signatur
einmal entfernt werden; vorher ungesendete Entwürfe sichern. Serverdaten bleiben
erhalten.

## Release veröffentlichen

1. `mobile-version.json` erhöhen, Tests ausführen und Änderungen prüfen.
2. Den geprüften Commit ohne Force-Push auf den bereits zugelassenen Zweig
   `codex/android-release-preparation` übernehmen. Den geschützten Workflow
   `Signed Android release` ausführen/freigeben.
3. Den erfolgreichen Lauf, Quellcommit, Paketversion, Prüfsumme und unveränderte
   Signatur verifizieren. APK niemals im öffentlichen Git-Repository ablegen.
4. Die neue Datei als `android/Alberring-VERSION-BUILD.apk` in den bestehenden
   privaten Bucket `app-releases` hochladen. Authentifizierten Download und
   verweigerten anonymen Zugriff prüfen.
5. **Erst danach** `public/android-release.json` auf diese Version, Buildnummer
   und Datei setzen und den Web-Stand veröffentlichen. Portal und Updateprüfung
   verwenden dieselbe Datei, unabhängig von späteren iOS-Buildnummern.
6. Live-Manifest, CORS für `https://localhost`, `Cache-Control: no-store` und die
   heruntergeladene APK-Prüfsumme kontrollieren.

Die Versionsmetadaten sind öffentlich und enthalten keine Mitarbeiterdaten,
Zugangsdaten oder autorisierten Download-URLs. Der native Abruf sendet weder
Cookies noch Session-Token. Der Download bleibt geschützt. Der Signierschlüssel
muss für künftige Direkt-Updates erhalten bleiben.

## iOS und Web

iOS-Versionen werden separat bei Apple eingereicht und erst nach Freigabe über
den App Store aktualisiert. Ein Web-Deployment ersetzt keine installierten
nativen App-Dateien. Alle Plattformen nutzen weiterhin dasselbe Backend.
