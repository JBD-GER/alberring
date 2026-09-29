# Rollen und Berechtigungen

Produktiv bereitgestellt nach ausdrücklicher Freigabe; siehe [Veröffentlichungsnachweis vom 16.09.2026](VEROEFFENTLICHUNG_2026-09-16.md).

## Rollenstand 16.09.2026 (veröffentlicht)

Der aktive und zuweisbare Katalog ist auf `super_admin`, `employee` und `team_lead` begrenzt. Neue freie Rollen sind gesperrt; frühere Rollen werden deaktiviert, historische Referenzen bleiben erhalten. Noch gültige Zuordnungen zu entfallenden Rollen führen beim Migrieren zu einem prüfbaren Abbruch, nicht zu einer automatischen Rechteänderung.

Die neue Berechtigung `data.correct` ist effektiv ausschließlich für echte Super Admins wirksam und nicht an gewöhnliche Rollen delegierbar. Mitarbeiter-Stammdaten, E-Mail-Änderung, allgemeine Zugangslöschung und neue Fachkorrekturen prüfen die Systemrolle zusätzlich serverseitig. Bestehende Einzelrechte für Teamleitung/Mitarbeiter bleiben konfigurierbar. `users.manage` allein erlaubt keine allgemeine Löschung oder neue Stammdatenkorrektur. Selbstlöschung und Verlust des letzten aktiven Super Admins bleiben geschützt.

Effektive Rechte berücksichtigen nur aktive, zeitlich gültige Rollen derselben aktiven Organisation. Super Admins erhalten automatisch sämtliche registrierten Berechtigungen. Urlaubsanträge und Krankmeldungen dürfen ausschließlich die Systemrollen Administration/Admin und Super Admin anlegen; zusätzliche Einzelrechte auf anderen Rollen ändern diese Grenze nicht. Eigene Rollen können nur Super Admins ändern, solange mindestens ein aktiver Super Admin erhalten bleibt.

## Standardrollen

| Rolle                 | Schwerpunkt                                                          | Bewusst nicht automatisch enthalten               |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Super Admin           | Vollständige Betreiberadministration                                 | Vergabe nur an ausdrücklich autorisierte Personen |
| Administration        | Benutzer, Teams, Urlaub und Krankmeldungen erfassen, News, Dokumente | Atteste und HR-Mitarbeiterakten                   |
| Pflegedienstleitung   | Planung, News, Urlaub, Abwesenheitsstatus                            | Attestdateien                                     |
| Teamleitung           | Eigenes Team, Teamplanung, erste Urlaubsfreigabe                     | Attestdateien, globale Administration             |
| Disposition           | Planung, Verfügbarkeit, Fuhrparkübersicht                            | Atteste, medizinische Details                     |
| Personal / HR         | Mitarbeiter, Urlaub, Krankmeldungen, Attestarchiv                    | Integrations-/Systemrechte ohne Zusatzrolle       |
| Fuhrpark              | Fahrzeuge, Zuweisungen, Kilometerstände                              | HR- und Attestdaten                               |
| Mitarbeiter           | Eigene Einträge ansehen, Kommunikation, veröffentlichte Inhalte      | Urlaub/Krankmeldungen anlegen und Administration  |
| Auditor / Datenschutz | Audit- und Rollenübersicht lesend                                    | Chat-Inhalte und Atteste                          |

Rollen lassen sich unter **Administration → Benutzer → Rollen ändern** auswählen und gemeinsam speichern. Super Admins können jede Rolle vergeben und nachträglich ändern; die Super-Admin-Rolle behält immer Vollzugriff. Andere Rollen sind organisationsspezifisch editierbar. Die Migration ersetzt bisherige Rechte zur eigenen Abwesenheitserfassung durch `leave.view_own` und `sick_leave.view_own`; die neuen Erfassungsrechte `leave.create` und `sick_leave.create` sind ausschließlich Admins und Super Admins vorbehalten.

## Kritische Trennungen

- `messages.moderate` ist kein allgemeines Leserecht. Auch Moderatoren müssen Mitglied einer Konversation sein.
- Sowohl Chat-Mitgliedschaft als auch die aktuelle Permission `messages.use` sind erforderlich. Nach Rechteentzug bleiben keine lesbaren Chat- oder Anhangsdaten zurück.
- `sick_leave.view_status` gibt planungsrelevante Abwesenheit frei, niemals Attestdateien. Teamleitungen sehen dabei nur aktive eigene beziehungsweise geleitete Teams; Disposition/PDL mit globaler Planungsverantwortung sehen den notwendigen organisationsweiten Status.
- `sick_leave.view_certificates` ist eine eigenständige HR-Fachpermission.
- `documents.manage_employee_files` ist von allgemeinem `documents.manage` getrennt. Auch Dokumente mit Sichtbarkeit `personal` bleiben ausschließlich beim Eigentümer mit `documents.view_own` und ausdrücklich berechtigten HR-Fachrollen.
- `users.manage` gewährt keine fremden Rollen oder Teams: Organisation und Aktivstatus werden nochmals serverseitig geprüft.
- Rollen werden transaktional über `set_user_roles` und Rollenrechte über `set_role_permission` gespeichert und auditiert. Nur Super Admins vergeben oder entziehen die Super-Admin-Rolle. Der letzte aktive Super Admin kann nicht entfernt werden; dessen Vollzugriff lässt sich nicht durch einzelne Rechte reduzieren.
- Eine Urlaubsfreigabe ist der Standard. Admins und Super Admins mit `leave.manage` dürfen auch eigene Anträge entscheiden. Für andere Freigaberollen bleibt die Sperre eigener Entscheidungen bestehen. Optional ausdrücklich eingestellte zweistufige Freigaben benötigen weiterhin zwei verschiedene Entscheider.
- `users.manage` erlaubt das endgültige Löschen ausschließlich ungenutzter Einladungen im eigenen Mandanten: Status `invited`, kein bestätigter oder angemeldeter Auth-Benutzer, keine Fachhistorie oder Dateien. Die Prüfung und das Entfernen von Profil und Auth-Konto erfolgen atomar; der Audit-Eintrag bleibt erhalten. Super-Admin-Einladungen dürfen nur Super Admins entfernen. Genutzte Konten werden archiviert.
- Technische Administration erhält nicht durch ihren Namen Zugriff auf Atteste.
- Audit-Logs sind für Clients nicht beschreibbar; kritische Einträge entstehen in RPCs und Edge Functions.

## Teams und Chat

- Teams können direkt mit mehreren Mitgliedern erstellt werden. Die Mitgliederauswahl lässt sich später durchsuchen, ergänzen und reduzieren; Einladungen und bestehende pausierte Mitgliedschaften bleiben dabei sichtbar.
- Teammitgliedschaft und Chatmitgliedschaft werden getrennt verwaltet. Ein Teamchat kann zum Beispiel auch Vertretungen aus anderen Teams aufnehmen.
- In den Chatdetails können berechtigte Chatverantwortliche Mitglieder ändern und ein Gruppenbild hochladen, ersetzen oder entfernen. Zugelassen sind JPG, PNG, WebP und GIF bis 5 MB.
- Gruppenbilder liegen im privaten Bucket `conversation-avatars`. Leserechte setzen Chatmitgliedschaft beziehungsweise eine gültige Verwaltungsberechtigung voraus. Änderungen sind nur durch berechtigte Chatverantwortliche möglich.
- Rollenänderungen gelten serverseitig sofort. Die Oberfläche aktualisiert die Rechte beim Zurückkehren zum Fenster und spätestens beim nächsten aktiven Minutenintervall; bei einer Rechteänderung werden zwischengespeicherte Daten verworfen.

## Durchsetzung

Die Oberfläche blendet nicht erlaubte Aktionen aus. Maßgeblich sind jedoch:

1. Column Grants für sensible Profil-/Mitarbeiterfelder
2. RLS auf sämtlichen API-erreichbaren Tabellen
3. bucket-spezifische Storage-RLS
4. transaktionale Security-Definer-RPCs mit festem `search_path`
5. Edge Functions für Auth-Admin, geplante Jobs und kurzlebige Downloads

Ein organisationsfremder Datensatz wird selbst bei fehlerhaftem Clientcode nicht freigegeben. Direkte Updates auf Nachrichten, Notifications, Urlaubsanträge, Kilometerstände, Materialvorgänge und News sind auf sichere Spalten beschränkt oder vollständig durch RPCs ersetzt.
