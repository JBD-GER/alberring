# Alberring Auth-E-Mails

Deutsche Vorlagen für die bestehenden Supabase-Auth-Abläufe. Das Design verwendet die Petrolfarben der Mitarbeiter-App, Inline-CSS, Layouttabellen, systemeigene Schriftarten und einen einzigen Aktionsbutton. Es werden keine externen Bilder, Schriften oder Tracking-Dienste geladen.

| Vorlage         | Supabase-Typ   | Betreff                                                 |
| --------------- | -------------- | ------------------------------------------------------- |
| `invite.html`   | Invite user    | Einladung zur Alberring Mitarbeiter-App                 |
| `recovery.html` | Reset password | Passwort für die Alberring Mitarbeiter-App zurücksetzen |

Die einzige Templatevariable ist `{{ .ConfirmationURL }}`. Supabase erzeugt damit den einmal verwendbaren Bestätigungslink einschließlich Auth-Typ und erlaubtem Rücksprungziel. Diesen Platzhalter unverändert lassen; keine feste Domain oder selbst gebauten Tokenlinks einsetzen. Die bestehenden Web- und App-Rücksprungziele bleiben damit erhalten.

`supabase/config.toml` verknüpft die Dateien für die lokale Entwicklung. Auf dem gehosteten Projekt müssen Inhalt und Betreff zusätzlich unter **Authentication → Email → Templates** oder über die Management API hinterlegt werden (`mailer_templates_invite_content`, `mailer_subjects_invite`, `mailer_templates_recovery_content`, `mailer_subjects_recovery`). Ein Frontend-Deployment veröffentlicht die gehosteten E-Mail-Vorlagen nicht.

Die Vorlagen nennen **24 Stunden**. Deshalb nur zusammen mit `mailer_otp_exp = 86400` im gehosteten Projekt verwenden; lokal ist `auth.email.otp_expiry = 86400` gesetzt. Supabase verwendet diesen Ablaufzeitraum gemeinsam für Einladungs- und Recovery-Links.

Die Vorlagen ändern nur Inhalt und Gestaltung. Das Versandlimit und die Empfängerbeschränkungen des integrierten Supabase-Maildienstes bleiben bestehen. Für den verlässlichen Versand an Mitarbeiteradressen ist ein produktiver SMTP-Dienst in Supabase zu konfigurieren. Keine Absenderadresse wird durch diese Vorlagen festgelegt.

Referenzen: [Supabase E-Mail-Vorlagen](https://supabase.com/docs/guides/auth/auth-email-templates), [lokale Konfiguration](https://supabase.com/docs/guides/local-development/customizing-email-templates).
