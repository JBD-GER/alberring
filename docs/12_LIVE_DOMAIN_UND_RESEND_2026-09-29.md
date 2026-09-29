# Produktivdomain und Resend – 29.09.2026

## Eingerichteter Stand

Die Web-App ist unter **https://app.alberring.de** erreichbar. Vercel meldet für die Produktionsdomain **Valid Configuration**. Die bestehende produktive Version wird über diese Domain ausgeliefert; für die Domain- und SMTP-Umstellung war kein neuer Frontend-Build erforderlich.

Die folgenden DNS-Einträge sind bei STRATO gespeichert und öffentlich auflösbar:

| Name relativ zu alberring.de | Typ   | Ziel                                                |
| ---------------------------- | ----- | --------------------------------------------------- |
| `app`                        | CNAME | `12eb3b30d5385129.vercel-dns-016.com.`              |
| `resend._domainkey.app`      | TXT   | Von Resend vorgegebener öffentlicher DKIM-Schlüssel |
| `rsend.app`                  | CNAME | `rsend-euw1.forge.rmta.net.`                        |
| `send.app`                   | CNAME | `send.forge.rmta.net.`                              |

Den Vercel-CNAME hat der Nutzer während der Einrichtung ergänzt. Die beiden Resend-CNAMEs wurden anschließend hinzugefügt. Resend bestätigt die Domain und alle drei Mail-DNS-Einträge als **verified**. Versand ist aktiviert; Empfang sowie Öffnungs- und Klicktracking sind deaktiviert.

## Supabase

Projekt: AlberringConnect (`jchaxvntjhrttvcknmnn`).

- Site URL: `https://app.alberring.de`.
- Neue erlaubte Redirects: `https://app.alberring.de/accept-invite` und `https://app.alberring.de/reset-password`.
- Die beiden bisherigen exakten Redirects unter `https://alberringapp.vercel.app` bleiben zusätzlich erlaubt.
- Function-`APP_URL`: `https://app.alberring.de`.
- Function-`ALLOWED_ORIGINS`: `https://app.alberring.de,https://alberringapp.vercel.app`.
- SMTP: `smtp.resend.com`, Port `465`, Benutzer `resend`.
- Absender: `Alberring Mitarbeiter-App <noreply@app.alberring.de>`.
- Eigener API-Schlüssel „Alberring Supabase Auth SMTP“, auf Versand über `app.alberring.de` beschränkt. Der Schlüssel ist in Supabase als SMTP-Passwort gespeichert und steht nicht im Repository.
- Auth-Link-Gültigkeit unverändert `86400` Sekunden, Versandlimit unverändert `30` E-Mails/Stunde, Mindestabstand je Empfänger `60` Sekunden.
- Die vorhandenen deutschen Einladungs- und Recovery-Vorlagen verwenden weiterhin `{{ .ConfirmationURL }}` und enthalten keine fest eingetragene alte Domain.

Die frühere STRATO-SMTP-Konfiguration wurde durch Resend ersetzt. Der am 24.09. dokumentierte ausgehende STRATO-URL-Filter liegt damit nicht mehr im Versandweg.

## Verifiziert

- HTTPS-Aufrufe von `/login`, `/accept-invite` und `/reset-password`: jeweils HTTP `200`, Auslieferung über Vercel.
- Die Anmeldeseite wurde im Browser unter der neuen Domain geöffnet.
- CORS-Preflight von der neuen und der bisherigen Domain: HTTP `204` mit der jeweils passenden exakten Origin.
- Eine fremde Test-Origin erhält keine `Access-Control-Allow-Origin`-Freigabe.
- Site URL, Redirect-Liste, SMTP-Konfiguration und Laufzeit wurden nach dem Speichern erneut über die Supabase Management API gelesen.
- Die beiden Function-Konfigurationswerte wurden anhand der von Supabase gelieferten SHA-256-Digests geprüft.
- Eine verschlüsselte SMTP-Verbindung zu Resend mit dem hinterlegten Schlüssel wurde erfolgreich authentifiziert (SMTP `235`, anschließend `NOOP` `250`). Dabei wurde keine E-Mail versendet.

## Rückmeldung zum Einladungsablauf

Der Nutzer hat nach der Umstellung bestätigt, dass alles funktioniert. Diese Rückmeldung gilt als manuelle Funktionsbestätigung. Die zuvor angefragte Testeinladung wurde durch den Agenten nicht versendet, weil die Administrator-Sitzung abgelaufen war. Eine separate technische Zustellbestätigung für die konkret benannte Testadresse wurde nicht erhoben.

Bereits abgelaufene Einladungen werden durch die Konfigurationsänderung nicht erneuert. Für diese Konten muss anschließend über die Benutzerverwaltung erneut eine Einladung versendet werden.

## Referenzen

- [Resend SMTP mit Supabase](https://resend.com/docs/send-with-supabase-smtp)
- [Supabase Redirect-URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Historischer Versandbefund vom 24.09.2026](MAILVERSAND_2026-09-24.md)
