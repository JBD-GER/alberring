# Rollen und Berechtigungen

Effektive Rechte sind die Vereinigung aller aktiven, zeitlich gültigen Rollen eines Benutzers. `private.has_permission()` akzeptiert nur Rollen derselben aktiven Organisation. Benutzer dürfen ihre Rollen nicht selbst verändern.

## Standardrollen

| Rolle                 | Schwerpunkt                                                      | Bewusst nicht automatisch enthalten               |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Super Admin           | Vollständige Betreiberadministration                             | Vergabe nur an ausdrücklich autorisierte Personen |
| Administration        | Benutzer, Teams, News, allgemeine Dokumente, Einstellungen       | Atteste und HR-Mitarbeiterakten                   |
| Pflegedienstleitung   | Planung, News, Urlaub, Abwesenheitsstatus                        | Attestdateien                                     |
| Teamleitung           | Eigenes Team, Teamplanung, erste Urlaubsfreigabe                 | Attestdateien, globale Administration             |
| Disposition           | Planung, Verfügbarkeit, Fuhrparkübersicht                        | Atteste, medizinische Details                     |
| Personal / HR         | Mitarbeiter, Urlaub, Krankmeldungen, Attestarchiv                | Integrations-/Systemrechte ohne Zusatzrolle       |
| Fuhrpark              | Fahrzeuge, Zuweisungen, Kilometerstände                          | HR- und Attestdaten                               |
| Mitarbeiter           | Eigene Daten und Anträge, Kommunikation, veröffentlichte Inhalte | Fremde Anträge und Administration                 |
| Auditor / Datenschutz | Audit- und Rollenübersicht lesend                                | Chat-Inhalte und Atteste                          |

Systemrollen sind organisationsspezifisch editierbar. Die Migration ergänzt fehlende Standardrollen und Rechte, entfernt aber keine bewusst angepassten Zuweisungen.

## Kritische Trennungen

- `messages.moderate` ist kein allgemeines Leserecht. Auch Moderatoren müssen Mitglied einer Konversation sein.
- Sowohl Chat-Mitgliedschaft als auch die aktuelle Permission `messages.use` sind erforderlich. Nach Rechteentzug bleiben keine lesbaren Chat- oder Anhangsdaten zurück.
- `sick_leave.view_status` gibt planungsrelevante Abwesenheit frei, niemals Attestdateien. Teamleitungen sehen dabei nur aktive eigene beziehungsweise geleitete Teams; Disposition/PDL mit globaler Planungsverantwortung sehen den notwendigen organisationsweiten Status.
- `sick_leave.view_certificates` ist eine eigenständige HR-Fachpermission.
- `documents.manage_employee_files` ist von allgemeinem `documents.manage` getrennt. Auch Dokumente mit Sichtbarkeit `personal` bleiben ausschließlich beim Eigentümer mit `documents.view_own` und ausdrücklich berechtigten HR-Fachrollen.
- `users.manage` gewährt keine fremden Rollen oder Teams: Organisation und Aktivstatus werden nochmals serverseitig geprüft.
- Änderungen an Rollen-Permissions laufen ausschließlich über `set_role_permission` und werden auditiert. Die für den Betrieb notwendigen Super-Admin-Rechte `users.manage` und `roles.manage` können nicht entfernt werden; letzter Super Admin und eigene letzte Verwaltungsrolle sind gegen Lockout geschützt.
- Zweistufige Urlaubsfreigaben benötigen zwei verschiedene Entscheider.
- Technische Administration erhält nicht durch ihren Namen Zugriff auf Atteste.
- Audit-Logs sind für Clients nicht beschreibbar; kritische Einträge entstehen in RPCs und Edge Functions.

## Durchsetzung

Die Oberfläche blendet nicht erlaubte Aktionen aus. Maßgeblich sind jedoch:

1. Column Grants für sensible Profil-/Mitarbeiterfelder
2. RLS auf sämtlichen API-erreichbaren Tabellen
3. bucket-spezifische Storage-RLS
4. transaktionale Security-Definer-RPCs mit festem `search_path`
5. Edge Functions für Auth-Admin, geplante Jobs und kurzlebige Downloads

Ein organisationsfremder Datensatz wird selbst bei fehlerhaftem Clientcode nicht freigegeben. Direkte Updates auf Nachrichten, Notifications, Urlaubsanträge, Kilometerstände, Materialvorgänge und News sind auf sichere Spalten beschränkt oder vollständig durch RPCs ersetzt.
