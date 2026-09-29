# Alberring – Apple-Einreichung

Stand: 29.09.2026. **iOS 1.0.0 (4) erfolgreich signiert, zu Apple hochgeladen und verarbeitet. Noch keine App-Review-Abgabe und keine Store-Veröffentlichung.**

## Festgelegter Vertriebsweg

Die App dient ausschließlich berechtigten Mitarbeitenden. Öffentliche Registrierung bleibt deaktiviert; ein Downloadlink gewährt keinen Zugang. Geplant ist Unlisted App Distribution mit Installation per Link, auch auf privaten Geräten. Manuelle Veröffentlichung ist bei Apple ausgewählt. Die App darf erst nach bestätigtem Unlisted-Status freigegeben werden. iOS und Android haben bis dahin weiterhin keine eingetragenen Store-Links.

Apple-Verwaltung erfolgt im Browser. Build, Signierung und Upload laufen auf GitHub-Cloud-Runnern; lokales Xcode oder Transporter wurde nicht benötigt.

## Apple und Signing

- Organisation: Alberring - Ambulante Pflege GmbH & Co. KG; aktive Mitgliedschaft, Verlängerung 30.09.2027.
- Team: `4562LXMH4C`; Bundle: `de.alberring.connect`; App-ID: `6817309574`; SKU: `alberring-ios-001`.
- Apple-Distribution-Zertifikat geprüft: Team und privater Schlüssel stimmen, gültig bis 29.09.2027.
- Profil `Alberring App Store 2026` (Apple-ID `S42ZTSVHR2`) vom Nutzer heruntergeladen und auf Team, Bundle, Zertifikat, Ablauf sowie App-Store-Verteilung geprüft.
- API-Zugang und Developer-Upload-Schlüssel nach ausdrücklicher Nutzerfreigabe eingerichtet; Schlüssel und Signing-Werte als geschützte GitHub-Environment-Secrets hinterlegt.
- Environment `store-release` mit erforderlicher Freigabe und Branchbeschränkung. Zugangsdaten liegen ausschließlich geschützt und gitignoriert in `apple-signing-private`; keine Geheimnisse in dieser Dokumentation oder im Repository.
- Native Push-Laufzeit deaktiviert, obwohl die zur Projektdatei passende Signierfähigkeit vorhanden ist. Keine Behauptung funktionierender Push-Zustellung.

## Verifizierter Build und Fehlerverlauf

[Signed mobile release artifacts #4](https://github.com/JBD-GER/alberring/actions/runs/36563211927), Commit `b18ebe8fd27524c92ac39e9476282d18ec067a9d`: Qualitätsprüfungen und iOS-Job **success**; Android absichtlich übersprungen. Archivierung, Export, Paketprüfung und Upload erfolgreich. Apple meldet in TestFlight **Upload abgeschlossen**, Build **1.0.0 (4) – Bereit zur Übermittlung**. Build 4 ist dem Versionseintrag zugeordnet.

Vorherige Fehlversuche bleiben als Historie sichtbar:

1. Ein Sicherheitscheck beanstandete die Testabhängigkeit undici 7.29.0. Lockfile auf 7.30.0 aktualisiert; Audit ohne Befund.
2. Ein global gesetztes Provisioning-Profil wurde fälschlich auf eine Swift-Package-Abhängigkeit angewandt. Die Signierung wird jetzt nur am Release-App-Target gesetzt.
3. Ein CommonJS-Helfer verletzte die vorhandene Lint-Konfiguration. Auf ein ESM-Skript umgestellt; nachfolgende Prüfungen erfolgreich.

[CI auf main](https://github.com/JBD-GER/alberring/actions/runs/36563316614) und [Native compatibility](https://github.com/JBD-GER/alberring/actions/runs/36563316681) für `19aacfdf` sind erfolgreich. Der GitHub-Workflow „Verified Vercel production deployment“ wurde dabei übersprungen; das ist kein Fehlschlag. Die eigentliche Vercel-Produktion für die Datenschutzänderung ist READY.

Der iOS-Branch enthält eine ältere Backend-Historie und darf nicht pauschal nach main gemergt werden. Geprüft: Frontend, iOS-Projekt, Capacitor-Konfiguration, Pakete und Store-Link-Konfiguration des hochgeladenen Commits stimmen mit main `19aacfdf` überein. Der aktuelle produktive Backend-Stand stammt aus dem separat veröffentlichten main-Release.

## Live-Domain, Auth und Datenschutz

- App: https://app.alberring.de
- App-Datenschutz: https://app.alberring.de/datenschutz
- Öffentliche Route ohne Anmeldung; Link im Login und in Einstellungen; alte `/privacy`-Route leitet weiter.
- Unternehmensseite als Quelle: https://www.alberring.de/datenschutz/
- App-Erklärung beschreibt Mitarbeiterdaten, Gesundheitsnachweise, Chat/Dateien/Audio, optionalen Standort, Authentifizierung und Protokolle sowie **Supabase, Vercel und Resend**.
- Supabase-Projektregion Frankfurt (`eu-central-1`); keine Behauptung ausschließlich europäischer Verarbeitung.
- Rechtsgrundlagen und Aufbewahrungskriterien benannt; keine erfundenen festen Löschfristen oder Bestätigung ungeprüfter Auftragsverarbeitungsverträge.
- Datenschutzerklärung unter main-Commit `19aacfdf5e5adf225231fe1e1a0470d73b4b3fff` veröffentlicht; TypeScript, ESLint, Web-Build und mobile Browserdarstellung geprüft.
- Datenschutz-URL bei Apple gespeichert. 13 Datentypen erfasst, jeweils App-Funktionalität, mit Benutzeridentität verknüpft, ohne Tracking. Veröffentlichung nach ausdrücklicher Zustimmung des Nutzers bestätigt.
- Supabase Site URL und APP_URL auf app.alberring.de; CORS erlaubt exakt die beiden Web-Adressen und `capacitor://localhost`.
- Native Auth-Rückleitungen für Einladung und Passwort-Reset unter `de.alberring.connect://auth/callback` mit konkreten `next`-Parametern freigegeben; vorhandene Web-Rückleitungen erhalten.
- Öffentliches Signup produktiv deaktiviert. E-Mails über Resend, Öffnungs-/Klicktracking deaktiviert. In dieser Sitzung keine Test-E-Mails versandt.

## Isolierter Apple-Prüfzugang

Eigene Organisation **Alberring – Apple-Prüfung (Testdaten)** mit zwei erfundenen Personen (Alex Beispiel, Sam Muster), Mitarbeiterrolle, einem Prüfteam, Beispielchat und interner Beispielmeldung eingerichtet. Kein Zugriff auf echte Mitarbeitende oder Administratorfunktionen.

Prüfadresse: `apple-review@alberring.de`. Passwort ausschließlich in der geschützten lokalen Datei `apple-signing-private/review-access.json` und im vorgesehenen App-Review-Feld bei Apple. Keine Passwörter in Git, E-Mails, Screenshots oder Ausgabedokumenten.

Anmeldung per API geprüft. Der Zugang sieht exakt die zwei Testprofile. Abfragen auf fremde Organisationen waren bei 13 Tabellen nicht sichtbar; die benötigten Onboarding-, Tour- und Chat-RPCs funktionierten. Anmeldung in der Live-Web-Oberfläche, Dashboard und Beispielchat ebenfalls geprüft. Das ersetzt noch keine native Geräteabnahme.

Weitere Listen (z. B. Dienste und Dokumente) sind ohne zusätzliche Beispieldatensätze leer. Apple-Notizen erklären diesen Zustand. Der Zugang muss während der Prüfung erreichbar bleiben und anschließend gezielt gesperrt werden.

## App-Store-Stand

- Deutscher Name, Untertitel, Wirtschaft-Kategorie, Beschreibung, Keywords, Kontakt und Support-URL gespeichert.
- Kostenlos, Basis Deutschland/EUR. Apple-Silicon-Mac- und Vision-Pro-Verteilung deaktiviert.
- Altersfragebogen ausgefüllt; resultierende globale Freigabe 4+ mit regionalen Ausnahmen. Keine Kinderkategorie, keine medizinische Beratung.
- Inhaltsrechte: keine eingebundenen Inhalte externer Inhaltsanbieter.
- Review-Zugang und englische Anleitung hinterlegt; manuelle Veröffentlichung erhalten.
- TestFlight-Prüfanleitung für Build 4 gespeichert. Noch keine Tester eingeladen.

## Vor der tatsächlichen Einreichung offen

1. Native Geräteprüfung über TestFlight: Login/Logout, Einladung/Recovery, Berechtigungsverweigerung, Kamera/Audio/Dateien/Standort, App-Hintergrundwechsel. Hierfür ein echtes iPhone verwenden.
2. Echte Screenshots des iOS-Builds für die bei Apple verlangten iPhone- und iPad-Größen erstellen. Keine Browserbilder als angebliche Geräteaufnahmen ausgeben; nur synthetische Daten verwenden.
3. Länder-Verfügbarkeit und Apple-DSA-/Händlerstatus anhand des tatsächlichen Betriebs vervollständigen.
4. App-Review-Abgabe durchführen, Unlisted-Antrag stellen, Freigabe abwarten. **Keine normale öffentliche Veröffentlichung auslösen.**
5. Erst den tatsächlich freigegebenen Apple-Link in die Store-Link-Konfiguration und Einladungen übernehmen; Android später separat.

## Quellen

- [App Store Connect](https://appstoreconnect.apple.com/apps/6817309574/distribution)
- [Unlisted App Distribution](https://developer.apple.com/support/unlisted-app-distribution/)
- [App Privacy](https://developer.apple.com/app-store/app-privacy-details/)
- [Screenshot-Anforderungen](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
