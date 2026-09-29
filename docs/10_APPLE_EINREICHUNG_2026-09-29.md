# Alberring – Apple-Einreichung

Stand: 29.09.2026. Vorbereitung für interne Nutzung; noch keine Einreichung und keine Store-Freigabe.

## Verbindliche Entscheidungen aus dieser Sitzung

- Nur interne Nutzung durch freigeschaltete Mitarbeitende.
- Installation per Link auf privaten oder betrieblichen iPhones: **Unlisted App Distribution**.
- Die Downloadadresse ist kein Zugriffsschutz. Kontofreischaltung, Login und serverseitige Rechte bleiben erforderlich.
- Apple-Verwaltung im Browser. Keine lokale Xcode- oder Apple-Developer-App als Voraussetzung; Kompilierung auf einem macOS-Cloud-Runner.
- iOS zuerst. Android folgt separat. Beide Store-URLs bleiben bis zur tatsächlichen Freigabe `null`.
- Mitgliedschaft laut Nutzer bereits bezahlt. **Keinen zweiten Kauf auslösen.**

## Aktuell beobachteter Kontostand

Die Mitgliedschaft ist am 29.09.2026 im Browser als aktive Organisationsmitgliedschaft bestätigt: **Alberring - Ambulante Pflege GmbH & Co. KG**, Team-ID **4562LXMH4C**, Verlängerungsdatum 30.09.2027. Kein erneuter Kauf wurde ausgelöst. Den App-Store-Connect-Bedingungen wurde erst nach ausdrücklicher Zustimmung des Nutzers zugestimmt.

Bundle-ID `de.alberring.connect` wurde registriert. Push Notifications ist passend zum vorhandenen Signing-Entitlement aktiviert; die App-Laufzeit bleibt ohne Push-Aktivierung und ohne APNs-Schlüssel.

Der [App-Datensatz Alberring](https://appstoreconnect.apple.com/apps/6817309574/distribution) ist erstellt: Apple-ID **6817309574**, Deutsch, SKU `alberring-ios-001`, Version 1.0.0, Status **In Vorbereitung zur Übermittlung**. Beschreibung, Keywords, Support-URL, Copyright, Review-Kontakt und Unlisted-Hinweise sind als Entwurf gespeichert. **Manuelle Veröffentlichung** ist gespeichert. Noch kein Build hochgeladen, keine Review-Abgabe, kein fertiger Store-Link.

Das vom Nutzer heruntergeladene Apple-Distribution-Zertifikat wurde geprüft: Organisation und Team stimmen, der öffentliche Schlüssel passt zum lokal erzeugten privaten Schlüssel; gültig bis 29.09.2027. Der verschlüsselte P12-Export und die benötigten Passwörter sind als GitHub-Environment-Secrets in `store-release` hinterlegt. Das Environment verlangt die Freigabe durch den Repository-Inhaber und erlaubt ausschließlich den Branch `codex/ios-review-preparation`. Private Signing-Dateien bleiben außerhalb des Git-Repositories und der Ausgabedokumente.

Das App-Store-Profil **Alberring App Store 2026** ist bei Apple erstellt und aktiv (Profil-ID `S42ZTSVHR2`). Der automatische Download wurde von Chrome mit `ERR_BLOCKED_BY_CLIENT` gesperrt; der manuelle Download durch den Nutzer steht aus. App-Store-Connect-API-Zugang ist noch nicht aktiviert; eine konkrete Freigabe für den Upload-Schlüssel mit Entwicklerrolle und geschützter Speicherung in GitHub Actions wurde angefragt. Noch kein signierter Release-Lauf gestartet.

Der kostenlose Preis (Basis Deutschland/EUR, 0,00 €) ist gespeichert. Verteilung auf Apple Silicon Macs und Apple Vision Pro ist deaktiviert; Ziel bleibt iPhone/iPad. Die Länder-Verfügbarkeit ist noch nicht konfiguriert.

## Neue App-Domain und parallele Einladungsänderung

Der Nutzer stellt die App auf **https://app.alberring.de** um und bearbeitet die Einladungslinks separat. Diese Ankündigung bestätigt noch keine fertige DNS-/HTTPS- oder Backend-Umstellung. Die Apple-Bundle-ID und das Zertifikat bleiben unverändert. Die native App enthält lokale Web-Assets und ist nicht an eine Vercel-WebView-Adresse gebunden.

Vor der Geräteabnahme gemeinsam prüfen:

- Neue Domain in Vercel/DNS und gültiges HTTPS, einschließlich direkter Aufrufe von `/accept-invite` und `/reset-password`.
- Supabase Site URL `https://app.alberring.de` und genaue erlaubte Web-Redirects für Einladung/Passwort-Reset.
- Produktionswert `APP_URL` der Einladungs-Functions und die CORS-Liste `ALLOWED_ORIGINS` passend zur neuen Domain; bestehende native Origins müssen erhalten bleiben.
- Native PKCE-Rückleitung `de.alberring.connect://auth/callback` mit den benötigten `next`-Parametern erhalten. Web-Einladungen und native Passwort-Resets müssen jeweils ihre eigene Rückleitung behalten.
- Live-Mailvorlagen und die vom Nutzer geänderten Einladungslinks am finalen Stand prüfen; iOS-/Android-Store-Links bleiben bis zur tatsächlichen Veröffentlichung leer.
- Tatsächliche Testzustellung, Einladung annehmen, Passwort setzen, Login und nativen Reset prüfen. Eine neue Domain allein belegt nicht, dass die bisherige STRATO-Ablehnung behoben ist.

In dieser Sitzung wurden wegen der parallel angekündigten Änderung keine Live-Domain-, Auth-Redirect- oder Einladungs-Konfigurationen umgestellt.

## Einladungspflicht bestätigt

Der Nutzer hat ausdrücklich nochmals bestätigt: keine öffentliche Kontoerstellung, Zugang nur per Einladung. Am 29.09.2026 liefert der produktive Supabase-Auth-Endpunkt `disable_signup: true`; als Anmeldeanbieter ist ausschließlich E-Mail aktiv. Die Login-Komponente bietet Anmeldung und Passwort-Reset, aber keine Registrierung. Auch die lokale Supabase-Konfiguration deaktiviert Sign-ups. Der Installationslink kann deshalb kein öffentliches Benutzerkonto erzeugen.

## Vercel-Vorschau korrigiert

Die iOS-Prüfbranch-Commits haben zusätzlich Vercel-Web-Vorschauen ausgelöst. Die neue strikte Prüfung öffentlicher Umgebungsvariablen hat Vercels automatisch eingefügte Deployment-Metadaten abgelehnt. Die Web-Prüfung erlaubt jetzt die konkret beobachteten öffentlichen Vercel-Metadaten über eine endliche Liste; unbekannte Variablen und Schlüssel bleiben gesperrt, native Builds bleiben unverändert streng. Vier fokussierte Tests, ESLint und lokaler Web-Build sind erfolgreich.

Commit `98d8f837d681aed99363de230b2edd115805542a`: [Vercel-Vorschau READY](https://vercel.com/flaaq-holding-gmb-h/alberringapp/F2bmL3uLk3trA56EXAXKFfTYPuWP). Die bestehende Produktion auf `main` wurde nicht ersetzt. Alte rote Vorschauen bleiben in der Historie.

## Technische Identität und bereits geprüfter Stand

| Feld                     | Wert                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| Anzeigename              | Alberring                                                        |
| Bundle-ID Produktion     | `de.alberring.connect`                                           |
| Separate Entwicklungs-ID | `de.alberring.connect.dev`                                       |
| Version / Build          | `1.0.0` / `1` – vor erstem Upload gegen App Store Connect prüfen |
| Sprache                  | Deutsch                                                          |
| Plattformen              | iPhone und iPad; Deployment Target iOS 15                        |
| Kategorie, Vorschlag     | Wirtschaft / Business                                            |
| SKU, Vorschlag           | `alberring-ios-001`                                              |
| Preis                    | Kostenlos                                                        |
| Apple-Verteilung         | Unlisted, nach Antrag und Apple-Genehmigung                      |

Der native Frontend-Build ist erfolgreich und enthält lokale Web-Assets ohne PWA-Service-Worker. 217 vorhandene Vitest-Tests sowie 11 neue Tests zu Store-Links bestehen. ESLint und der vorhandene Client-Secret-Scan sind erfolgreich. Plist-/Projektdateien wurden geparst. Das ersetzt weder eine signierte iOS-Kompilierung noch Gerätetests.

Die Cloud-Kompilierungsprüfung liegt in `.github/workflows/ios-preflight.yml`. **Der erste Lauf ist erfolgreich:** [GitHub Actions, iOS review preflight #1](https://github.com/JBD-GER/alberring/actions/runs/36556432034), Commit `b66385e242e40653d91741c6a94925306e591496`, Laufzeit 3 Minuten 20 Sekunden. Sie baut die iOS-Release-Konfiguration für den Simulator ohne Signing, mit synthetischer Backend-Konfiguration und ohne Produktionszugänge. Das erstellte Artefakt `alberring-ios-compatibility-only` ist ausdrücklich kein hochladbares Store-Paket. Separate Prüfbasis auf GitHub: Branch `codex/ios-review-preparation`; keine Zusammenführung mit `main`. Dieser Branch enthält den aktuellen Frontend-/iOS-Stand für die Kompilierung; er ist keine vollständige Aktualisierung der separat lokal geänderten Backend-Migrationen und nicht als ungeprüfter Produktions-Merge gedacht.

Die bestehenden nativen und signierten Release-Workflows lassen sich im Browser für **nur iOS** starten. Die Release-Pipeline benötigt erst echte geschützte Apple-Zertifikate/Profile und Produktionskonfiguration. Sie erstellt Artefakte; ein automatischer Upload oder Review-Antrag ist darin noch nicht implementiert. Für den browserbasierten Betrieb muss der Upload anschließend aus der Cloud über Apples unterstützte Upload-Werkzeuge/API erfolgen. Siehe `03_RELEASE_PROZESS.md` für die vorhandenen Signing-Variablen.

## App-Store-Texte zum Übernehmen

**Name:** Alberring

**Untertitel:** Die interne Mitarbeiter-App

**Beschreibung:**

Alberring ist die interne Mitarbeiter-App für den Arbeitsalltag bei Alberring Ambulante Pflege. Sie bündelt betriebliche Informationen und die Zusammenarbeit im Team an einem Ort.

Mit einem freigeschalteten Mitarbeiterkonto stehen abhängig von der zugewiesenen Rolle unter anderem folgende Funktionen zur Verfügung:

- Dienstliche Nachrichten und interne Neuigkeiten
- Dienstplan und Übersicht der eigenen Einsätze
- Urlaubsanträge und Krankmeldungen
- Betriebliche Dokumente und Nachweise
- Fuhrparkmeldungen und Materialanforderungen
- Fotos, Dateien, Sprachnachrichten und auf Wunsch einmaliges Teilen des Standorts in Nachrichten

Alberring richtet sich ausschließlich an berechtigte Mitarbeitende. Es gibt keine öffentliche Registrierung. Die Zugangsdaten werden im Rahmen einer persönlichen Einladung eingerichtet. Ein App-Download allein berechtigt nicht zur Nutzung.

Die Anwendung dient der internen Organisation. Sie ist nicht zur Patientendokumentation, medizinischen Beratung oder Behandlung bestimmt.

**Keywords, Vorschlag:** `Alberring,Mitarbeiter,Dienstplan,Team,Kommunikation,Urlaub,Dokumente`

**Review Notes, vorbereiteter englischer Text:**

Alberring is an internal employee application for Alberring Ambulante Pflege. We request unlisted app distribution because employees need to install the app using a direct App Store link, including on personally owned devices. The app is not intended for the general public.

Access requires an employee account provisioned by an authorized administrator. There is no public sign-up. The download link does not grant access to any internal data. Features are assigned according to the employee's role.

The app supports internal communication, shift schedules, leave requests, sickness absence reporting, documents, fleet reporting and material requests. It is not a patient record system or a medical advice app. Camera, microphone and location permissions are requested in the relevant feature after a user action; there is no background location tracking. Native push remains disabled in the current configuration.

**Vor Abgabe ergänzen:** separat eingetragener funktionierender Review-Login mit synthetischen Inhalten, konkrete Prüfschritte und tatsächlich zuständiger Review-Kontakt. Den Entwurf erst nach Abnahme des endgültigen Builds übernehmen.

## Noch nötige Einreichungsinhalte

1. **Datenschutz- und Support-URL:** Der Betreiber hat `https://www.alberring.de/datenschutz/` benannt und Vercel sowie Supabase als Hostinganbieter bestätigt. Die Seite beschreibt derzeit die Website; App-Verarbeitungen und Dienstleister fehlen. Eine App-Ergänzung ist als Arbeitsentwurf vorbereitet. Die Region des Supabase-Projekts AlberringConnect ist als `eu-central-1` (Frankfurt) geprüft. Vertrags-/Übermittlungsgrundlagen und tatsächliche Aufbewahrungs-/Löschregeln bleiben vom Betreiber zu ergänzen; die Region allein belegt keine ausschließlich europäische Verarbeitung. `/privacy` enthält noch den Platzhalter. Die Unternehmenshomepage mit erreichbarem Kontakt ist als Support-URL im Store-Entwurf gespeichert.
2. **App Privacy:** Namens-/E-Mail-/Telefonangaben, Benutzerkennungen, Mitarbeiterdaten, Nachrichten, Fotos/Dateien, Audio, optional gesendeter Standort und Krankheitsnachweise berücksichtigen. Diese Daten sind kontobezogen und dienen der App-Funktionalität. Kein Werbetracking im geprüften Quellstand. Angaben zu Betriebssystem-/Dienstleisterdaten am endgültigen Build und tatsächlichen Backend abgleichen; nicht „keine Daten erhoben“ erklären.
3. **Review-Konto:** eigene isolierte Testorganisation mit synthetischen Personen und Inhalten. Keinen Mitarbeiter- oder Super-Admin-Zugang aus dem Echtbetrieb an Apple weitergeben. Zugang während der Review erreichbar halten und nach Abschluss sperren.
4. **Screenshots:** echte Aufnahmen des geprüften iOS-Builds für iPhone und iPad, ohne Mitarbeiterdaten. Vorhandene Browser-/Android-Bilder sind kein iOS-Nachweis. Größe mit den aktuellen App-Store-Vorgaben abgleichen.
5. **Geräteabnahme:** Anmeldung, Einladung/Recovery, Logout, Rechteverweigerung, Kamera, Audio, Dateitransfer, Standort und Hintergrundwechsel mit dem signierten Paket prüfen. Push erst nach APNs-Einrichtung aktivieren.
6. **E-Mail-Zustellung:** Der letzte dokumentierte Stand meldet eine STRATO-Ablehnung der bisherigen App-URL. Einladung und Reset müssen nach Behebung tatsächlich im Testpostfach ankommen. Zusätzliche Store-Links lösen diese unabhängige Störung nicht.
7. **Apple-Formulare:** aktuelle Altersfreigabe einschließlich Fragen zu Nutzerinhalten/Kommunikation, Inhaltsrechten, Exportangaben sowie Betreiber-/Händlerstatus anhand des tatsächlichen Betriebs beantworten.

## Reihenfolge nach Freischaltung

1. Organisations-/Teamzuordnung prüfen, Bundle-ID registrieren, App-Datensatz anlegen und Signing einrichten.
2. Signiertes Release in der Cloud bauen, prüfen und nach App Store Connect übertragen. TestFlight-/Geräteabnahme abschließen.
3. Metadaten, Screenshots, Datenschutz, Review-Zugang und Kontakt eintragen. **Manuelle Veröffentlichung** wählen.
4. Für Unlisted zunächst Apples erforderliche Einstellung **Public** verwenden, mit Review-Hinweis einreichen und danach den Unlisted-Antrag stellen. Eine normale öffentliche Veröffentlichung nicht auslösen. Freigabe erst nach bestätigtem Unlisted-Status.
5. Verifizierten Apple-Link in `mobile-distribution.json` eintragen. Später Android-Link ergänzen. `npm run mobile:links` aktualisiert beide Auth-Mailvorlagen; diese anschließend in Supabase veröffentlichen und mit erlaubtem Testempfänger prüfen.

## Offizielle Quellen

- [Apple: Unlisted App Distribution](https://developer.apple.com/support/unlisted-app-distribution/)
- [Apple: Distribution Methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/)
- [Apple: Build-Upload](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple: Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple: App Privacy](https://developer.apple.com/app-store/app-privacy-details/)
- [Supabase: Auth-E-Mail-Vorlagen](https://supabase.com/docs/guides/auth/auth-email-templates)
