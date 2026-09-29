# Einladungen und Passwort-Reset: Prüfung vom 24.09.2026

## Aktueller Stand nach Veröffentlichung

**Die Oberfläche, die 24-Stunden-Einstellung und die neuen E-Mail-Vorlagen sind live. Die zuverlässige Zustellung von Einladungs- und Reset-Mails ist noch nicht abschließend hergestellt.** Der aktuell nachgewiesene Blocker ist die Ablehnung der App-URL durch den ausgehenden STRATO-Spamfilter.

- Frontend veröffentlicht unter `https://alberringapp.vercel.app`, Vercel-Deployment `dpl_3LQQb73z8ihU9jdzxTNH8VqT7dLv`. Enthalten sind erneuter Versand offener Einladungen und der 24-Stunden-Hinweis mit „Nicht mehr anzeigen“.
- Supabase `mailer_otp_exp` wurde auf **86400 Sekunden** gesetzt, gespeichert und erneut geprüft. Die gemeinsame Einstellung gilt für Einladungs- und Passwort-Reset-Links.
- Die deutschen Alberring-Vorlagen für **Invite user** und **Reset password** wurden in Supabase gespeichert. Sie verwenden die formelle Ansprache, nennen 24 Stunden Gültigkeit und behalten aktuell den nativen `{{ .ConfirmationURL }}`-Link bei. Die Quellen liegen unter `supabase/templates/`.
- Der vorhandene **STRATO-SMTP-Dienst auf Port 465** ist in Supabase eingerichtet. Die Anmeldung funktioniert; der spätere Inhaltsfilter lehnt Nachrichten mit der bisherigen App-URL ab. Zugangsdaten werden in diesem Dokument nicht gespeichert.
- Das Supabase-Versandlimit wurde nach Aktivierung des eigenen SMTP-Dienstes mit **30 E-Mails pro Stunde** bestätigt; der Mindestabstand je Empfänger beträgt weiterhin 60 Sekunden.
- Ein echter Supabase-`/invite`-Test scheiterte an `550 5.7.1 Refused by local policy. Sending of SPAM is not permitted! (B-URL)`. Die Meldung ist keine erfolgreiche Zustellung.

## Erstbefund vor der Umstellung

Projekt: AlberringConnect (`jchaxvntjhrttvcknmnn`). Die anfängliche Prüfung erfolgte lesend über Supabase-Logs, aggregierte Audit-Daten und die angemeldete Dashboard-Sitzung. Die folgenden Werte beschreiben den Zustand **vor** den oben dokumentierten Live-Änderungen.

- **Anfangs war kein eigener SMTP-Dienst eingerichtet.** Im Dashboard war der eingebaute Supabase-Maildienst aktiv. Dieser ist laut [Supabase-Dokumentation](https://supabase.com/docs/guides/auth/auth-smtp) nicht für den Produktivbetrieb ausgelegt und hat ein enges projektweites Versandlimit.
- Im abgefragten 24-Stunden-Zeitraum meldete `/invite` **17 HTTP-429-Fehler** und `/recover` **einen HTTP-429-Fehler**, jeweils `over_email_send_rate_limit`. Vier `/invite`-Anfragen wurden mit HTTP 200 quittiert. Eine HTTP-200-Antwort belegt noch keinen Eingang im Postfach.
- Die App-Audits enthalten neun Wiederholungsversuche mit `delivery=manual_link` und fünf mit `delivery=email`. Ein manueller Link bedeutet ausdrücklich, dass keine Einladungs-E-Mail versendet wurde.
- **Email OTP expiration stand auf 3600 Sekunden (1 Stunde).** Die inzwischen erfolgte Umstellung auf 86400 Sekunden gilt gemeinsam für Einladungs- und Reset-Links.
- Site URL und erlaubte Redirect-URLs stimmen: `https://alberringapp.vercel.app`, `/accept-invite` und `/reset-password`.
- Es bestehen zehn offene Einladungen; zugehörige Auth-Konten sind noch unbestätigt. Die Untersuchung verändert diese Mitarbeiterkonten nicht.
- Logs enthalten außerdem abgelaufene bzw. nicht mehr vorhandene Einmal-Tokens. Daraus lässt sich nicht sicher unterscheiden, ob der Link bereits verwendet, ersetzt oder tatsächlich zeitlich abgelaufen war.

## Korrekturen im Projekt

- Klarer Wiederholungsversand nur für offene Einladungen; keine erneute Einladung aktiver Konten.
- Kurzer Hinweis „Einladungslink: 24 Stunden gültig“ mit „Nicht mehr anzeigen“, pro Administration und Browser gespeichert; zusätzlicher Hinweis im Formular.
- Versandlimit und fehlender Maildienst werden als Fehler bzw. manueller Versand angezeigt, nicht als versendete E-Mail.
- Ein vorübergehendes Versandlimit erzeugt keinen neuen manuellen Ersatzlink, der einen zuvor verschickten Link ersetzen könnte.
- Neue Mitarbeiterprofile werden vor dem eigentlichen Versand angelegt. Scheitert danach der Versand, bleibt die offene Einladung zum Wiederholen verfügbar.
- Passwort-Reset unterscheidet Versandlimit, Maildienstfehler, ungültigen Link und Netzwerkfehler. Die öffentliche Bestätigung verrät weiterhin nicht, ob ein Konto existiert.
- Einladung annehmen bleibt bei Netzwerkausnahmen bedienbar; die Aktivierung lässt sich nach einem bereits gespeicherten Passwort wiederholen.

## SMTP-Diagnose und tatsächlich beobachteter Posteingang

Direkte SMTP-Diagnosen wurden mit getrennten Nachrichteninhalten durchgeführt. „Angenommen“ bedeutet hierbei zunächst nur, dass der SMTP-Server die Nachricht akzeptiert hat.

| Testinhalt                                                    | STRATO-SMTP-Ergebnis        | Beobachtung im Gmail-Testpostfach      |
| ------------------------------------------------------------- | --------------------------- | -------------------------------------- |
| Nachricht ohne Link                                           | Angenommen                  | Posteingang (INBOX)                    |
| Nachricht nur mit Supabase-Domain                             | Angenommen                  | Spam-Ordner                            |
| Nachricht mit `https://alberringapp.vercel.app/accept-invite` | Abgelehnt mit `550 … B-URL` | Kein erfolgreicher Versand über STRATO |

Bei der im Posteingang empfangenen Diagnosemail meldete Gmail **DKIM pass** mit Selektor `strato-dkim-0002`, **DMARC pass** und **SPF none**. Daraus folgt weder, dass jede Auth-E-Mail ankommt, noch dass die Ablage im Posteingang gesichert ist. Der Test mit der Supabase-Domain zeigt ausdrücklich eine Spam-Einstufung trotz SMTP-Annahme.

STRATO beschreibt `B-URL` als eine im Nachrichteninhalt erkannte verdächtige URL. Die isolierten Tests belegen hier die Ablehnung der konkreten App-URL; sie belegen keine pauschale Sperre aller `vercel.app`- oder `supabase.co`-Adressen. Der aktuelle native Supabase-Link enthält das App-Ziel als `redirect_to`-Parameter. [STRATO-Fehlercodes](https://www.strato.de/faq/mail/fehlermeldungen-bei-e-mails/), [STRATO-Filter für ausgehende E-Mails](https://www.strato.de/faq/mail/wie-aktiviere-ich-den-spamschutz-in-strato-webmail/)

## Noch offene Produktionsschritte

1. Die Ablehnung der bisherigen App-URL beheben. `app.alberring.de` wurde dem Vercel-Projekt `alberringapp` zugeordnet; die Domain-Inhaberschaft ist bestätigt, die DNS-Konfiguration noch ungültig. Vercel verlangt einen **CNAME** mit Name **`app`** und Ziel **`12eb3b30d5385129.vercel-dns-016.com.`**. Aktuell ist dafür kein DNS-Eintrag vorhanden. Der STRATO-Kundenlogin ist für den Nutzer geöffnet; die Anmeldung steht aus. Eine DNS-Umstellung ist damit noch nicht erfolgt. Die bisherige produktive URL bleibt aktiv.
2. Ein zusätzlicher Einstieg für Supabase-`TokenHash`-Links ist lokal implementiert und mit 61 relevanten Tests, Typecheck und ESLint geprüft; ein unabhängiger Review fand keine verbleibenden Blocker. Er verifiziert erst nach ausdrücklichem Klick, wartet auf die passende Nutzersitzung und entfernt verbrauchte Tokens sofort aus der URL. Dieser Zusatz ist **noch nicht veröffentlicht**; die aktiven Vorlagen wurden dafür noch nicht umgestellt. Supabase dokumentiert solche Links zusammen mit `verifyOtp`; ein reiner Austausch der Template-URL ohne passenden App-Einstieg genügt nicht. [Supabase-E-Mail-Vorlagen](https://supabase.com/docs/guides/auth/auth-email-templates)
3. Nach Behebung der URL-Ablehnung erneut eine echte Einladung und eine Reset-Mail an die freigegebene Testadresse senden, den tatsächlichen Posteingang prüfen und beide Link-Abläufe vollständig durchlaufen. Erneuter Einladungsversand und abgelaufene bzw. bereits verwendete Links sind ebenfalls zu prüfen.
4. Die Spam-Einstufung im empfangenden Postfach weiter überprüfen. Erfolgreiche SMTP-Annahme allein reicht für die abschließende Zustellbestätigung nicht aus.

Eine Datenbankmigration ist für die bisher gefundenen Ursachen nicht erforderlich.

Bei der Domain-Umstellung müssen Site URL, erlaubte Auth-Redirects, Function-`APP_URL` und CORS gemeinsam berücksichtigt werden. Web-Reset-Anfragen verwenden derzeit `location.origin`; eine Vorlage darf deshalb nicht ungeprüft ein altes Vercel-Ziel aus `.RedirectTo` übernehmen. Unterbrochene Einladungen mit Recovery müssen weiter nach `/accept-invite` gelangen. Bestehende native PKCE-Rücksprünge verwenden vorerst den bisherigen `ConfirmationURL`-Ablauf.

## Umsetzung und Verifikation

- Die Backend-Korrekturen sind in Produktion: `admin-create-user` Version **9** und `admin-resend-invite` Version **10**, beide `ACTIVE` und weiterhin mit JWT-Prüfung.
- Beide bereitgestellten Endpunkte wurden ohne Nutzersitzung aufgerufen und weisen die Anfrage mit HTTP 401 zurück; auch der Aufruf mit öffentlichem Projekt-Key erreicht den eigenen `unauthorized`-Schutz korrekt. Es wurde dabei keine E-Mail verschickt.
- **185 Vitest-Tests**, ESLint und Produktionsbuild erfolgreich.
- Der spätere additive TokenHash-Einstieg besteht die relevanten Tests und einen erneuten vollständigen Produktionsbuild; dieser Zusatz wurde noch nicht auf Vercel bereitgestellt.
- **46 Edge-Function-Tests** einschließlich Typprüfung erfolgreich mit der im CI verwendeten Version Deno **2.9.4**; beide geänderten Functions zusätzlich separat mit `deno check` geprüft.
- Browserprüfung der echten Benutzerverwaltungs-Komponente mit isolierten Testdaten: erneuter Versand, 24-Stunden-Dialog auf Desktop und bei 390 px Breite, gespeicherte Ausblend-Präferenz nach Neuladen und Fehlermeldung ohne falsches Erfolgspopup.
- Die Frontend-Änderungen sind inzwischen mit dem oben genannten Vercel-Deployment produktiv veröffentlicht; Ablaufzeit und Vorlagen wurden ebenfalls live geändert. Die vollständige Verifikation der Einladungs- und Passwort-Reset-Abläufe bleibt wegen der dokumentierten STRATO-URL-Ablehnung offen.
