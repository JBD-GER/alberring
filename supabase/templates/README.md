# Alberring Auth-E-Mails

Deutsche Vorlagen für die bestehenden Supabase-Auth-Abläufe. Das Design verwendet die Petrolfarben der Mitarbeiter-App, Inline-CSS, Layouttabellen, systemeigene Schriftarten und einen primären Aktionsbutton. Es werden keine externen Bilder, Schriften oder Tracking-Dienste geladen.

| Vorlage         | Supabase-Typ   | Betreff                                                 |
| --------------- | -------------- | ------------------------------------------------------- |
| `invite.html`   | Invite user    | Einladung zur Alberring Mitarbeiter-App                 |
| `recovery.html` | Reset password | Passwort für die Alberring Mitarbeiter-App zurücksetzen |

Die einzige Templatevariable ist `{{ .ConfirmationURL }}`. Supabase erzeugt damit den einmal verwendbaren Bestätigungslink einschließlich Auth-Typ und erlaubtem Rücksprungziel. Diesen Platzhalter unverändert lassen; keine feste Domain oder selbst gebauten Tokenlinks einsetzen. Die bestehenden Web- und App-Rücksprungziele bleiben damit erhalten.

`supabase/config.toml` verknüpft die Dateien für die lokale Entwicklung. Auf dem gehosteten Projekt müssen Inhalt und Betreff zusätzlich unter **Authentication → Email → Templates** oder über die Management API hinterlegt werden (`mailer_templates_invite_content`, `mailer_subjects_invite`, `mailer_templates_recovery_content`, `mailer_subjects_recovery`). Ein Frontend-Deployment veröffentlicht die gehosteten E-Mail-Vorlagen nicht.

Die Vorlagen nennen **24 Stunden**. Deshalb nur zusammen mit `mailer_otp_exp = 86400` im gehosteten Projekt verwenden; lokal ist `auth.email.otp_expiry = 86400` gesetzt. Supabase verwendet diesen Ablaufzeitraum gemeinsam für Einladungs- und Recovery-Links.

Die Vorlagen ändern nur Inhalt und Gestaltung. Das Versandlimit und die Empfängerbeschränkungen des integrierten Supabase-Maildienstes bleiben bestehen. Für den verlässlichen Versand an Mitarbeiteradressen ist ein produktiver SMTP-Dienst in Supabase zu konfigurieren. Keine Absenderadresse wird durch diese Vorlagen festgelegt.

Referenzen: [Supabase E-Mail-Vorlagen](https://supabase.com/docs/guides/auth/auth-email-templates), [lokale Konfiguration](https://supabase.com/docs/guides/local-development/customizing-email-templates).

## iPhone- und Android-Installationslinks

Stand 29.09.2026: Beide tatsächlichen URLs in `mobile-distribution.json` sind ausdrücklich `null`. Die App ist noch in keinem Store freigegeben. Die Vorlagen zeigen beide Plattformen mit dem Hinweis „Download nach Store-Freigabe verfügbar.“ Es werden weder App-IDs noch funktionierende Store-Links erfunden.

Nach Freigabe ausschließlich die verifizierten Links der Alberring-App eintragen und `npm run mobile:links` ausführen. iOS und Android können unabhängig nacheinander aktiviert werden. `npm run mobile:links:check` prüft, dass beide Vorlagen zur Konfiguration passen. Der Generator akzeptiert nur direkte HTTPS-Links zu `apps.apple.com` beziehungsweise das Produktions-Package `de.alberring.connect` auf `play.google.com`; Tracking- und Authentifizierungsparameter sind ausgeschlossen. Ein syntaktisch gültiger Apple-Link ersetzt nicht die Prüfung der tatsächlichen App-ID und Unlisted-Freigabe in App Store Connect.

Die zuerst nötige Kontofreischaltung verwendet weiterhin unverändert `{{ .ConfirmationURL }}`. Mitarbeitende nehmen die Einladung an, legen ihr Passwort fest und melden sich anschließend in der installierten App an. Store-Links enthalten keine persönlichen Einladungslinks, Token oder Mitarbeiterdaten. Die URLs stammen aus der versionierten Betreiberkonfiguration, nicht aus veränderbaren Benutzermetadaten.

Auch die Recovery-Vorlage enthält den Installationsbereich: Der bestehende Wiederholungsversand einer bereits begonnenen Einladung kann über diesen Auth-Typ laufen. Damit gibt es bei beiden Pfaden dieselben Downloadinformationen.

Die Anpassung liegt im Repository und muss später zusätzlich im gehosteten Supabase-Projekt hinterlegt werden. Dieser Generator verschickt keine E-Mails und verändert keine Live-Konfiguration. Der letzte dokumentierte STRATO-Zustellfehler bleibt unabhängig davon offen; siehe `docs/MAILVERSAND_2026-09-24.md`.
