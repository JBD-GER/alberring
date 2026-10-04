# Alberring: Aufnahme und erneute App-Prüfung

## Noch erforderlich

Apple verlangt für die Ablehnung vom 2. Oktober 2026 ausdrücklich eine Bildschirmaufnahme auf einem **echten iPhone mit der aktuellsten verfügbaren iOS-Version**. Die Aufnahme muss mit dem Start der installierten App beginnen. Simulatorbilder ersetzen dieses Video nicht. Version 1.0.2, Build 7 ist der vorbereitete Nachfolgestand; erst aufnehmen, wenn dieser Build in TestFlight verfügbar ist.

Die erneute Einreichung bleibt bis zum Video und zur Geräteprüfung offen. Unlisted-Vertrieb ist beantragt; Freigabe ist noch zu bestätigen. Manuelle Veröffentlichung beibehalten.

## Vorbereitung

1. Auf dem iPhone unter **Einstellungen → Allgemein → Softwareupdate** die aktuellste angebotene iOS-Version installieren. Modell und Versionsnummer notieren.
2. In TestFlight Alberring auf **1.0.2 (7)** aktualisieren. Einmal vor der Aufnahme die wichtigsten Abläufe prüfen, anschließend aus der App abmelden und zum Home-Bildschirm zurückkehren.
3. Nur die Organisation **„Alberring – Apple-Prüfung (Testdaten)“** verwenden. Keine echten Personal-, Gesundheits- oder Patientendaten aufnehmen.
4. Die geschützte Datei `apple-signing-private/review-access.json` enthält die Testzugänge. Sie gehört nicht ins Git-Repository und nicht in öffentliche Videos. Passwörter beim Eingeben verdeckt lassen; Benachrichtigungen anderer Apps für die Aufnahme vermeiden.
5. Bildschirmaufnahme im Kontrollzentrum starten. In einem durchgehenden Video vom Home-Bildschirm aus das Alberring-Symbol antippen. Ton ist optional.

## Aufnahmeablauf (etwa 4–6 Minuten)

| Schritt                     | Auf dem iPhone zeigen                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. App starten und anmelden | Alberring vom Home-Bildschirm öffnen. Auf der Startseite ist keine öffentliche Registrierung vorhanden. Mit `apple-review@alberring.de` anmelden. Falls eine Einführung erscheint, abschließen oder überspringen.                                                                        |
| 2. Neuigkeiten              | Die Willkommensnachricht öffnen und lesen.                                                                                                                                                                                                                                               |
| 3. Chat                     | „Prüfteam – Beispielchat“ öffnen. „Testnachricht für die App-Prüfung“ senden. Optional ein Foto ohne Personen oder eine kurze Test-Sprachnachricht senden; Berechtigungsdialoge dabei zeigen.                                                                                            |
| 4. Melden und blockieren    | Bei einer Nachricht von Sam Muster „Melden“ wählen, den Grund „Demonstration der Meldefunktion – fiktive Nachricht“ eingeben und absenden. Anschließend Sam über „Person blockieren“ blockieren.                                                                                         |
| 5. Einstellungen            | Unter Sicherheit die Meldung und die blockierte Person zeigen. Die Blockierung wieder aufheben. Kontaktangaben und Datenschutzerklärung kurz öffnen.                                                                                                                                     |
| 6. Dienstplan und Dokument  | Zum 5. Oktober 2026 oder einem folgenden Montag bis 9. November wechseln und den „Prüfung: Beispiel-Frühdienst“ öffnen. Unter Dokumente „App-Prüfung – Beispieldokument“ öffnen und die Lesebestätigung ausprobieren.                                                                    |
| 7. Team und Profil          | Das Teamverzeichnis und das eigene Profil öffnen. Die sichtbaren Funktionen hängen von der zugewiesenen Mitarbeiterrolle ab.                                                                                                                                                             |
| 8. Konto löschen            | Abmelden, mit `apple-review-deletion@alberring.de` anmelden. Unter Einstellungen → Konto löschen die Sieben-Tage-Frist zeigen, „Löschung beantragen“ wählen und den Antrag bestätigen. Den gespeicherten Antrag mit Frist aufnehmen. **Den Hauptzugang von Apple nicht löschen lassen.** |

Wenn eine Funktion während der Aufnahme scheitert: Fehler notieren und vor der Einreichung beheben; keine erfolgreiche Prüfung behaupten. Die eigentliche manuelle Löschung des separaten Löschtestkontos übernimmt danach die Testadministration innerhalb der angezeigten Frist mit Abschlussbestätigung.

## Ergänzende Verwaltungsaufnahme

Mit `apple-review-admin@alberring.de` kann Apple ausschließlich die Testorganisation verwalten. In einer kurzen zusätzlichen Aufnahme können unter Einstellungen die gemeldete Nachricht geprüft, die gezielte Moderation gezeigt und die Liste der Löschanträge geöffnet werden. Die Benutzerverwaltung zeigt den Einladungsprozess; keine Einladungen an reale Mitarbeitende als Test versenden. `apple-review-teamlead@alberring.de` deckt die Rolle Teamleitung ab. Alle drei Rollen sind getrennt von der produktiven Organisation.

## Übergabe

Die Originalaufnahme als MOV oder MP4 bereitstellen, zusammen mit iPhone-Modell, iOS-Version und der getesteten Buildnummer. Passwörter und andere private Benachrichtigungen dürfen nicht sichtbar sein. Da die App auch iPad unterstützt, die Hauptabläufe zusätzlich auf einem echten unterstützten iPad prüfen und Gerät/OS/Ergebnis dokumentieren; ein iPhone-Video belegt diese separate Prüfung nicht.

Danach: Video als App-Review-Anhang oder dauerhaft für Apple erreichbaren Link bereitstellen; die sechs verlangten Antworten in die Review-Notizen und die Antwort an App Review aufnehmen; Build auswählen; erst dann erneut zur Prüfung übermitteln.

Quellen: [Apple: Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Unlisted-Vertrieb](https://developer.apple.com/support/unlisted-app-distribution/). Der konkrete Videoauftrag stammt aus der erhaltenen Ablehnung.
