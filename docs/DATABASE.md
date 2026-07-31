# Datenbank und Supabase-Betrieb

## Welches SQL ausführen?

Es gibt zwei bewusst getrennte Installationswege:

### Bestehendes Alberring-Projekt

Wenn `202607100001_core.sql` und `202607100002_messaging.sql` in diesem Projekt bereits ausgeführt wurden, im Supabase **SQL Editor** genau diese Datei vollständig ausführen:

```text
supabase/SETUP_UPGRADE_20260710.sql
```

Das transaktionale Bundle enthält die Migrationen 003 bis 006 und die aktuellen Referenzdaten. Keine Teilabschnitte herauskopieren und `SETUP_FRESH.sql` nicht zusätzlich ausführen.

### Wirklich leeres Supabase-Projekt

In einem neuen Projekt ohne Alberring-Tabellen stattdessen genau diese Datei vollständig ausführen:

```text
supabase/SETUP_FRESH.sql
```

Sie enthält Kernschema, Messaging, Fachdomänen, RLS, Workflows und Referenzdaten in einem transaktionalen Bundle. Vorhandene Supabase-Systemschemas wie `auth` und `storage` sind normal und bedeuten nicht, dass Alberring bereits installiert ist.

Vor einem Upgrade produktiver Daten immer ein Backup erstellen. Die Setup-Dateien installieren keine Edge Functions, keine Function-Secrets, kein SMTP und keine Cron-Zeitpläne; diese Schritte sind in [DEPLOYMENT.md](DEPLOYMENT.md) beschrieben.

## Erster Administrator

Ein Datensatz unter **Authentication → Users** ist zunächst nur ein Supabase-Auth-Benutzer. Die App benötigt zusätzlich ein aktives `profiles`-Profil, Mitarbeiterstammdaten und die Super-Admin-Rolle. Deshalb wird der erste Administrator einmalig gebootstrapped.

1. Im Supabase Dashboard unter **Authentication → Users** einen Benutzer mit der gewünschten Admin-E-Mail anlegen.
2. Sicherstellen, dass die E-Mail dieses Benutzers bestätigt ist.
3. Die echte Benutzer-ID aus der Detailansicht kopieren. Das ist die UUID aus `auth.users`, nicht eine frei erfundene ID.
4. Im SQL Editor mit genau dieser UUID und derselben E-Mail ausführen:

```sql
select public.bootstrap_first_admin(
  'AUTH-USER-UUID'::uuid,
  'admin@ihre-domain.de',
  'Vorname',
  'Nachname'
);
```

Die Funktion prüft den bestätigten Auth-Benutzer, verknüpft ihn mit der vorbereiteten Organisation, aktiviert das Profil und weist die Rolle `Super Admin` zu. Für denselben Benutzer ist der Aufruf idempotent. Sobald ein anderer aktiver Super Admin existiert, verweigert die Funktion einen erneuten Erst-Bootstrap. Ein vorhandener aktiver Super Admin braucht diesen Schritt daher nicht.

Die Funktion ist über die Data API nur für `service_role` freigegeben. Der manuelle Aufruf im geschützten SQL Editor ist der vorgesehene einmalige Installationsweg. Es wird absichtlich weder ein Auth-Benutzer noch ein Standardpasswort in SQL oder Seed-Daten erzeugt.

Die Meldung „Konto ist noch nicht aktiv oder wurde gesperrt“ kann erscheinen, wenn zwar `auth.users` existiert, aber noch kein aktives Alberring-Profil vorhanden ist. Beim allerersten Benutzer behebt der korrekte Bootstrap genau diese fehlende Verknüpfung. Spätere Benutzer werden ausschließlich über **Administration → Benutzer → Mitarbeiter einladen** angelegt und aktivieren ihr eigenes Invite-Profil beim Annehmen der Einladung.

## Auth-Konfiguration ohne öffentliche Registrierung

SQL kann die gehostete Supabase-Auth-Einstellung für öffentliche Registrierungen nicht zuverlässig umschalten. Im Dashboard deshalb vor dem Produktivstart unter **Authentication → Providers → Email** öffentliche E-Mail-Sign-ups deaktivieren. Benutzer werden danach ausschließlich über `admin-create-user` eingeladen. Zusätzlich:

- **Site URL** auf die produktive App-URL setzen.
- Als Redirect-URLs mindestens `https://IHRE-APP/accept-invite` und `https://IHRE-APP/reset-password` erlauben.
- Produktives SMTP konfigurieren und Einladung sowie Passwort-Reset real testen.
- Eine angemessene Mindestpasswortlänge und die gewünschte Session-/MFA-Strategie in Auth festlegen.

`admin-create-user` kann einen unbestätigten, zur gleichen Organisation gehörenden Auth-Invite nach einem Timeout sicher wieder aufnehmen. Vorhandene aktive oder organisationsfremde Konten werden nicht übernommen. Erneutes Senden ist serverseitig mit einem kurzen Cooldown serialisiert und auditiert.

## Versionierte Quellen

Die fachlich maßgeblichen Migrationsquellen bleiben:

1. `202607100001_core.sql` – Organisation, Identität, Rollen und Basisdomänen
2. `202607100002_messaging.sql` – Messaging-Erweiterung
3. `202607100003_domain_schema.sql` – normalisierte Fachdomänen und Constraints
4. `202607100004_security_rls.sql` – RLS, Column Grants und Storage-Policies
5. `202607100005_workflows.sql` – transaktionale RPCs, Trigger und Realtime
6. `202607100006_reference_data.sql` – Rollen, Urlaubstypen, Kategorien und Provider
7. `202607120007_document_folders.sql` – sichere Dokumentordner
8. `202607120008_document_folder_audiences.sql` – rollenbasierte Ordnerfreigaben
9. `202607240009_messaging_policy_hardening.sql` – korrekte Chat-Zielbindung in RLS

`SETUP_FRESH.sql` und `SETUP_UPGRADE_20260710.sql` sind die bequemen Installationsbundles für den SQL Editor. Sie werden mit `npm run supabase:build:setup` vollständig aus den versionierten Migrationen und `seed.sql` erzeugt. Die Einzelmigrationen bleiben die maßgebliche Quelle.

## Sicherheitsmodell

- Fachliche Daten sind über `organization_id` einer Organisation zugeordnet.
- RLS erzwingt Organisations-, Rollen-, Team-, Eigentümer- und Mitgliedschaftsgrenzen serverseitig; UI-Gates sind nur zusätzliche Bedienlogik.
- Effektive Berechtigungen entstehen aus zeitlich gültigen Rollenzuweisungen.
- Direkte private Chats sind nur für Mitglieder lesbar; eine technische Administratorrolle erhält keinen pauschalen Inhaltzugriff.
- HR- und Geburtstagsfelder werden über eingeschränkte RPCs wie `get_my_profile()`, `list_directory_entries()`, `admin_list_users()`, `list_leave_requests()` und `list_sick_leave_records()` passend zur Rolle maskiert.
- Kritische Statuswechsel und Schreibvorgänge laufen über `security definer`-RPCs mit festem `search_path`, serverseitiger Validierung und Audit-Ereignissen.
- Besonders sensible Dateien liegen ausschließlich in privaten Buckets. Atteste haben keine direkte Storage-SELECT-Policy.
- Der Service-Role-Key ist ausschließlich für vertrauenswürdige Edge Functions bestimmt und darf nie den Browser erreichen.

## Wichtige Client-RPCs

Identität und Administration:

- `get_my_profile`, `my_permissions`, `list_directory_entries`, `admin_list_users`
- `update_own_profile`, `activate_my_profile`
- `set_user_role`, `set_user_team`, `set_role_permission`
- `bootstrap_first_admin` ausschließlich für die einmalige Einrichtung

Kommunikation und News:

- `list_conversations`, `get_or_create_direct_conversation`, `create_group_conversation`
- `send_message`, `edit_message`, `retract_message`
- `save_news_post`, `publish_scheduled_news`, `mark_news_opened`, `acknowledge_news`

Fachworkflows:

- `save_shift`, `acknowledge_shift`
- `submit_leave_request`, `withdraw_leave_request`, `decide_leave_request`
- `report_sick_leave`, `extend_sick_leave`, `set_sick_leave_status`
- `create_document_upload`, `finalize_document_upload`, `add_document_version`, `archive_document`
- `save_vehicle`, `submit_mileage`, `review_mileage_submission`
- `save_material_request`, `set_material_request_status`
- `mark_notification_read`, `mark_all_notifications_read`

Diese Funktionen prüfen unter anderem Organisationsgrenzen, Statusübergänge, Rollen, Schichtkonflikte, Fahrzeugzuordnungen und Audit-Pflichten in der Datenbank. Direkte Client-Schreibrechte auf manipulationsanfällige Tabellen sind entsprechend eingeschränkt.

Der Dokument-Upload ist bewusst dreistufig und fehlertolerant:

1. `create_document_upload(title, visibility, team_id, folder_id, category_id, acknowledgement_required)` erzeugt den validierten Draft.
2. Die Datei wird nach `documents/{org}/{document}/...` hochgeladen; `add_document_version(...)` prüft das Storage-Objekt und registriert Version 1 beziehungsweise eine Folgeversion atomar.
3. `finalize_document_upload(document_id)` veröffentlicht einen Draft erst, wenn eine aktuelle Datei tatsächlich vorhanden ist.

Neue Versionen erhalten eine fortlaufende Nummer, setzen vorhandene Lesebestätigungen zurück, erzeugen ein Audit-Ereignis und benachrichtigen ausschließlich Profile, die das Dokument tatsächlich öffnen dürfen. Persönliche Dokumente und Mitarbeiterakten sind von allgemeinem `documents.manage` getrennt.

## Storage

Alle Buckets sind privat. Verbindliche Pfadmuster sind:

- `message-attachments/{org}/{conversation}/{message}/{file}`
- `news-attachments/{org}/{news}/{file}`
- `documents/{org}/{document}/{version}/{file}`
- `employee-documents/{org}/{employee}/{document}/{version}`
- `sick-certificates/{org}/{employee}/{sick_leave}/{version.ext}`
- `vehicle-files/{org}/{vehicle}/{kind}/{file}`
- `material-request-files/{org}/{request}/{file}`
- `avatars/{org}/{profile}/{file}`

Sichere Downloads laufen über `create-secure-download`. Die Function prüft die Fachberechtigung erneut, protokolliert den Zugriff und erstellt eine kurzlebige signierte URL. Die Laufzeit wird über `SIGNED_URL_TTL_SECONDS` konfiguriert und serverseitig begrenzt.

## Edge Functions

Benutzeraufgerufene, JWT- und permission-geschützte Functions:

- `admin-create-user`
- `admin-update-user-status`
- `admin-resend-invite`
- `create-secure-download`
- `careville-test-connection`

Automations-Functions mit eigenem `AUTOMATION_SECRET`:

- `process-birthday-reminders`
- `process-mileage-reminders`
- `process-scheduled-news`
- `send-notification-batch`

Einladungs- und Recovery-Mails laufen über Supabase Auth und benötigen für den Produktivbetrieb eine funktionierende SMTP-Konfiguration sowie korrekte Redirect-URLs. Der reine SQL-Lauf deployt keine dieser Functions. Befehle, Secrets und Cron-Hinweise stehen in [DEPLOYMENT.md](DEPLOYMENT.md#5-edge-functions-deployen).

## Tests und aktueller Nachweis

[`supabase/tests/rls_core.test.sql`](../supabase/tests/rls_core.test.sql) enthält 22 positive und negative pgTAP-Prüfungen, unter anderem für Organisationstrennung, Chatmitgliedschaft plus `messages.use`, Team-Scope bei Krankmeldungen, Rollen-Eskalation, News-Publishing, eigene Notifications sowie Attest-, persönliche Dokument- und Storage-Zugriffe.

Ausführung mit lokaler Supabase CLI und Docker:

```bash
npx supabase db reset
npx supabase test db
```

In der aktuellen Arbeitsumgebung wurden alle Migrationen 001–006 und `seed.sql` auf einer vollständig leeren eingebetteten PostgreSQL-Laufzeit ausgeführt. Dabei wurden 65 Public-Tabellen, die vollständige Berechtigungsmatrix aller neun Standardrollen sowie Kernworkflows für Bootstrap, Chat, News, Dokumente, Urlaub, Krankmeldung, Planung, Fuhrpark, Kilometerstände und Material geprüft. Zusätzlich bestanden PostgreSQL-Parser und Deno-Typecheck der Edge Functions.

Der pgTAP-Lauf selbst wurde mangels Docker/Supabase CLI hier **nicht** ausgeführt. Vor einem produktiven Rollout müssen `db reset` und `test db` daher trotzdem auf einer echten lokalen Supabase-Instanz sowie anschließend rollenbasierte Smoke-/E2E-Tests gegen Staging erfolgreich sein.
