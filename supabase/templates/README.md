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

## Geschützte Geräteauswahl

Stand 14.10.2026: Nach der Einladungsannahme im Browser führt die Aktivierung zu `/installation`. Nur angemeldete, aktive Mitarbeitende können diesen Bereich nutzen. Die Auswahl bietet Web, den privaten Android-Download und die von Apple freigegebene iPhone-/iPad-App. `iosAppStoreUrl` enthält den im App Store verifizierten Unlisted-Link `https://apps.apple.com/de/app/alberring/id6817309574`. Bereits installierte native Apps benötigen keinen erneuten Installationsschritt.

Einladungs- und Recovery-E-Mails enthalten ausschließlich den Link zum geschützten Portal, keine Store-URLs, APK-URLs oder Download-Token. `npm run mobile:links` hält beide Vorlagen aktuell. Die Einladung und die Passwortzurücksetzung verwenden weiterhin unverändert `{{ .ConfirmationURL }}`. Änderungen müssen zusätzlich in den gehosteten Supabase-Vorlagen gespeichert werden; der Generator versendet keine E-Mails.

Android-Dateien werden mit der bestehenden Mitarbeitersitzung aus dem privaten Storage geladen. Es wird kein weitergebbarer signierter Downloadlink erzeugt. Eine bereits heruntergeladene Installationsdatei kann technisch weitergereicht werden; der Datenzugriff bleibt davon unabhängig durch den bestehenden Mitarbeiterlogin und serverseitige Berechtigungen geschützt.
