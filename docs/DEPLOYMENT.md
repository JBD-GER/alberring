# Deployment

Diese Anleitung trennt bewusst Datenbank, Auth, Edge Functions und Frontend. Ein SQL-Bundle kann nur die Datenbankseite installieren; Function-Code, Secrets, E-Mail-Versand und Zeitpläne sind getrennte Supabase-Dienste und müssen separat eingerichtet werden.

## 1. Supabase-Projekt und SQL

Vor Änderungen an einem bereits genutzten Projekt ein Backup erstellen. Danach im Supabase **SQL Editor** genau eines der folgenden Bundles vollständig und ohne einzelne Abschnitte ausführen:

- Bestehende Alberring-Installation, in der `202607100001_core.sql` und `202607100002_messaging.sql` bereits ausgeführt wurden: `supabase/SETUP_UPGRADE_20260710.sql`
- Leeres, neues Projekt: `supabase/SETUP_FRESH.sql`

Die Bundles sind nicht gegeneinander austauschbar. `SETUP_FRESH.sql` niemals über eine bestehende Installation legen. Details zum Bootstrap des ersten Administrators stehen in [DATABASE.md](DATABASE.md#erster-administrator).

## 2. Auth für Produktion konfigurieren

Der einfachste Weg führt im Supabase Dashboard über **Authentication**:

- öffentliche Registrierungen/Sign-ups deaktivieren;
- anonyme Anmeldungen deaktivieren;
- Mindestlänge für Passwörter auf 12 Zeichen setzen und Groß-/Kleinbuchstaben sowie Ziffern verlangen;
- die produktive **Site URL** auf die exakte Frontend-URL setzen, zum Beispiel `https://connect.example.de`;
- als erlaubte Redirect-URLs exakt `https://connect.example.de/accept-invite` und `https://connect.example.de/reset-password` eintragen;
- für den Produktivbetrieb einen eigenen SMTP-Dienst konfigurieren und Invite- sowie Recovery-Mail real testen.

Die lokale [`supabase/config.toml`](../supabase/config.toml) enthält dieselben Regeln für die lokale Supabase-Umgebung. Wer die Produktionskonfiguration per CLI verwaltet, ersetzt dort vorher die lokalen URLs kontrolliert durch die Produktions-URLs und verwendet anschließend `npx supabase config push --project-ref IHRE_PROJECT_REF`. Nicht versehentlich eine lokale Site URL in Produktion pushen.

## 3. CLI mit dem Projekt verbinden

Für Functions und Secrets wird die Supabase CLI benötigt. Eine globale Installation ist nicht erforderlich:

```bash
npx supabase login
npx supabase link --project-ref IHRE_PROJECT_REF
```

## 4. Function-Secrets setzen

```bash
npx supabase secrets set \
  APP_URL=https://connect.example.de \
  ALLOWED_ORIGINS=https://connect.example.de \
  AUTOMATION_SECRET=EIN_LANGES_ZUFAELLIGES_SECRET \
  SIGNED_URL_TTL_SECONDS=60
```

`ALLOWED_ORIGINS` akzeptiert bei Bedarf mehrere, kommaseparierte, exakte Origins. Keine Wildcards in Produktion verwenden. `AUTOMATION_SECRET` muss hochentropisch sein und darf weder im Frontend noch im Repository stehen.

Die gehostete Supabase-Laufzeit stellt `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` automatisch für Edge Functions bereit. Diese drei Werte deshalb nicht noch einmal als eigene Function-Secrets setzen. Insbesondere darf `SUPABASE_SERVICE_ROLE_KEY` niemals als `VITE_*`-Variable veröffentlicht werden.

## 5. Edge Functions deployen

Alle Functions lassen sich mit der im Repository hinterlegten Konfiguration gemeinsam deployen:

```bash
npm run supabase:deploy:functions
```

Alternativ können sie einzeln deployt werden:

```bash
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-update-user-status
npx supabase functions deploy admin-resend-invite
npx supabase functions deploy create-secure-download
npx supabase functions deploy careville-test-connection
npx supabase functions deploy send-notification-batch --no-verify-jwt
npx supabase functions deploy process-birthday-reminders --no-verify-jwt
npx supabase functions deploy process-mileage-reminders --no-verify-jwt
npx supabase functions deploy process-scheduled-news --no-verify-jwt
```

Die fünf benutzeraufgerufenen Functions validieren das Supabase-JWT und die benötigte Permission selbst. Die vier Automations-Functions prüfen stattdessen bei jedem Aufruf den Header `x-automation-secret`; deshalb wird nur für diese Endpunkte `--no-verify-jwt` verwendet.

Schlägt ausschließlich die Mailzustellung wegen fehlendem Provider oder Versandlimit fehl, erzeugen `admin-create-user` und `admin-resend-invite` serverseitig einen kurzlebigen Einmal-Link. Die App zeigt ihn nur der berechtigten Administration zum Kopieren an. Damit bleibt die Mitarbeiteranlage funktionsfähig; der Link muss über einen sicheren, zum Empfänger verifizierten Kanal übermittelt werden. Bei funktionierendem SMTP wird weiterhin automatisch versendet und kein Link an den Browser zurückgegeben.

## 6. Zeitpläne konfigurieren

Die Migration `20260805071735_configure_automation_scheduler.sql` installiert Supabase Cron/`pg_net` und die vier Zeitpläne. Die Zugangswerte liegen absichtlich nicht im SQL. In **Supabase Vault** müssen vorher oder anschließend exakt diese beiden Secrets angelegt werden:

- `alberring_project_url`: die Supabase-Projekt-URL, zum Beispiel `https://IHRE_PROJECT_REF.supabase.co`
- `alberring_automation_secret`: exakt derselbe hochentropische Wert wie das Function-Secret `AUTOMATION_SECRET`

Waren beide Vault-Secrets beim Migrationslauf schon vorhanden, werden die Jobs automatisch eingerichtet. Andernfalls nach dem Anlegen einmal im SQL Editor ausführen:

```sql
select private.configure_automation_schedules();
```

Die Funktion ist für Data-API-Rollen gesperrt und darf nur administrativ im SQL Editor ausgeführt werden. Die installierten Zeitpläne sind:

| Function                     | Empfohlener Takt        | Zweck                                                                              |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `process-scheduled-news`     | jede Minute             | fällige News atomar veröffentlichen                                                |
| `send-notification-batch`    | alle fünf Minuten       | In-App-Zustellungen verarbeiten                                                    |
| `process-birthday-reminders` | stündlich bei Minute 5  | einmal täglich idempotent erinnern; Fehler automatisch erneut versuchen            |
| `process-mileage-reminders`  | stündlich bei Minute 15 | einmal täglich idempotent erinnern/eskalieren; Fehler automatisch erneut versuchen |
| interne Log-Bereinigung      | täglich 03:40 UTC       | Cron-Läufe nach 30 und Jobprotokolle nach 90 Tagen entfernen                       |

Die Jobs sind auf Wiederholungen ausgelegt und führen Job-/Deduplication-Protokolle. Trotzdem müssen Aufruf, Fehlerquote und Laufzeit im Produktivbetrieb überwacht werden. E-Mail- und Push-Zustellungen außerhalb von Supabase Auth sind derzeit nicht an einen Provider angebunden; `send-notification-batch` markiert solche Kanäle bewusst als `provider_not_configured` statt Daten an einen unbekannten Dienst zu senden.

## 7. Frontend bauen und veröffentlichen

Im Hosting ausschließlich folgende Build-Variablen hinterlegen:

```dotenv
VITE_SUPABASE_URL=https://IHRE_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=IHR_PUBLISHABLE_ODER_ANON_KEY
```

Dann bauen:

```bash
npm ci
npm run build
```

Das Verzeichnis `dist/` als SPA veröffentlichen und einen Fallback aller App-Routen auf `index.html` konfigurieren. Die Vorlage [`public/_headers`](../public/_headers) setzt Sicherheitsheader; beim gewählten Host prüfen, ob diese Datei unterstützt wird oder die Header dort separat konfiguriert werden müssen. TLS/HSTS, CSP, `frame-ancestors 'none'`, `Referrer-Policy` und `Permissions-Policy` vor der Freigabe kontrollieren.

## 8. Abnahme vor Einladungen

- Ersten bestätigten Auth-Benutzer mit `bootstrap_first_admin(...)` verbinden und den Super-Admin-Login testen.
- Invite- und Passwort-Reset-Mail mit der produktiven Domain vollständig durchspielen; bis SMTP eingerichtet ist den manuellen Link-Fallback kontrolliert prüfen.
- Einen Testbenutzer über die App einladen, den automatisch versendeten oder manuell sicher übergebenen Link annehmen und den Kontostatus prüfen.
- Je eine ungefährliche Aktion pro Rolle testen; besonders Chatmitgliedschaft, Teamgrenzen, Urlaubsfreigabe und Attestdownload.
- pgTAP/RLS-Tests gegen eine frische lokale Supabase-Instanz ausführen.
- Backup/PITR, Restore-Probe, Log-Alarmierung, SMTP-Zustellung, Rate Limits und Verantwortlichkeiten dokumentieren.
- Für besonders privilegierte Konten MFA organisatorisch festlegen und vor Produktivstart erzwingen.

Der Quellcode allein beweist weder ein korrekt konfiguriertes Remote-Projekt noch einen erfolgreichen Produktionsbetrieb. Der aktuelle Nachweisstand ist in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) festgehalten.
