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

Apple Developer zeigt für `app@alberring.de` noch den ausstehenden Mitgliedschaftskauf. Die Kaufseite nennt 99 € für ein Jahr. App Store Connect meldet, dass der Apple Account nicht eingerichtet ist. Apple nennt auf der Accountseite bis zu 48 Stunden Verarbeitung. Zahlung und Freischaltung sind deshalb derzeit unterschiedliche Zustände.

Ohne Freischaltung können App-Datensatz, registrierte Bundle-ID, Signierung und finale Review-Abgabe in diesem Konto noch nicht abgeschlossen werden. Weder eine Apple-Team-ID noch eine numerische App-Store-ID wurde erfunden.

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

1. **Datenschutz- und Support-URL:** `/privacy` enthält im aktuellen Quellstand nur einen Betreiber-Platzhalter. Verantwortlichen, erreichbaren Kontakt, tatsächliche Datenverarbeitung und Aufbewahrungs-/Löschprozesse ergänzen und die Seite öffentlich erreichbar bereitstellen. Keine beliebige Unternehmens-Datenschutzseite als App-Erklärung einsetzen.
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
