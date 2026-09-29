# Alberring Connect - Kundenfeedback und Projektdokumentation

Stand: 16.09.2026, Version 2.0, neue Änderungen nicht veröffentlicht.

## Kundenfeedback &<br/>Projektdokumentation

Alberring Connect | Änderungen, Admin-Anleitung und technische Nachweise

**Arbeitsstand: 16.09.2026 - NICHT VERÖFFENTLICHT**

Die Ergänzungen aus dem Telefonat sind im lokalen Projekt umgesetzt und geprüft. Es erfolgte dafür keine neue Veröffentlichung, keine produktive Datenbankmigration und kein Versand an echte Mitarbeitende. Die Freigabe zur Veröffentlichung steht ausdrücklich noch aus.

Anlass und Ziel

Diese Dokumentation führt das schriftliche Feedback von Y. Alberring und die anschließend telefonisch ergänzten Anforderungen zusammen. Im Mittelpunkt stehen nachträgliche Bearbeitung durch den Super Admin, korrigierbare Mitarbeiterdaten, erneute Einladungen, eine Urlaubsfreigabe und das Entfernen von Benutzerzugängen bei vollständig erhaltener Fachhistorie.

Die wesentlichen Ergebnisse

1. Super Admins können Mitarbeiterdaten und E-Mail-Adressen sowie Wartungen und weitere bestehende Fachdaten nachträglich korrigieren.

2. Benutzer lassen sich aus der aktiven Organisation entfernen. Ihr Auth-Konto wird gelöscht; Nachrichten und Vorgänge bleiben unter „Gelöschter Benutzer“ erhalten.

3. Der zuweisbare Rollenkatalog enthält nur Super Admin, Mitarbeiter und Teamleitung.

4. Die erste Feedbackrunde bleibt enthalten: eine Freigabe für Urlaub und erneuter Versand einer offenen Einladung.

Dokumentumfang

Anforderungsabgleich und Rollen: Seiten 2-3. Admin-Anleitung: Seiten 4-8. Technische Umsetzung und Code: Seiten 9-11. Prüfungen und Übergabe: Seiten 12-13.

Dokumentversion 2.0 · Lokaler Entwicklungsstand · Grundlage für die spätere Projektabgabe. Ein bestimmtes Landesamt oder Förderprogramm wurde nicht benannt; behördenspezifische Formvorgaben und eine behördliche Abnahme sind damit nicht nachgewiesen.

## Anforderungen und Änderungsstand

Beide Feedbackrunden sind erfasst; die Veröffentlichungsstände bleiben unterscheidbar.

| ID / Kundenwunsch                  | Umsetzung und prüfbares Ergebnis                                                                                              | Stand                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A1 · Urlaub ohne zweite Person     | Eine berechtigte Entscheidung setzt den Antrag auf „Genehmigt“. Bestehende offene Anträge werden nicht automatisch genehmigt. | Erste Runde bereits live |
| A2 · Einladung erneut senden       | Beschriftete Aktion bei „Eingeladen“; neuer Link oder manuelle Linkweitergabe bei fehlender E-Mail-Zustellung.                | Erste Runde bereits live |
| A3 · Mitarbeiterdaten korrigieren  | Stammdaten und Anmelde-E-Mail getrennt bearbeitbar. Gleiche Profil-ID, Rollen und Historie bleiben bestehen.                  | Neu, nur lokal           |
| A4 · Bestehende Vorgänge editieren | Wartung, Schäden, Kilometer, Urlaub, Krankheit, Material und Dokumentmetadaten erhalten Korrekturpfade.                       | Neu, nur lokal           |
| A5 · Benutzer allgemein löschen    | Aktive, eingeladene und archivierte Konten entfernbar; Auth-Zugang weg, Fachprofil und Inhalte bleiben erhalten.              | Neu, nur lokal           |
| A6 · Genau drei Rollen             | Nur Super Admin, Mitarbeiter und Teamleitung werden angeboten und können neu zugewiesen werden.                               | Neu, nur lokal           |

Die spätere Anforderung ersetzt die frühere Löschregel

Die erste Feedbackrunde erlaubte ausschließlich das vollständige Entfernen ungenutzter Einladungen. Das Telefonat konkretisiert stattdessen die allgemeine Löschung des Zugangs bei erhaltener Historie. Die neue lokale Umsetzung ersetzt diese ältere Regel einschließlich des bisherigen API-Endpunkts. Die erste PDF bleibt ein historischer Nachweis; für die geplante neue Version gilt dieses Dokument.

Grenze zwischen Bearbeitung und Historie

Bearbeitbar sind die fachlichen Felder der jeweiligen Formulare. Verknüpfte Identitäten, ursprüngliche Autoren, Dateien und bereits protokollierte Entscheidungen werden durch eine Korrektur nicht stillschweigend umgeschrieben. Statuswechsel und Freigaben erfolgen weiterhin über die dafür vorgesehenen Aktionen.

## Rollen und Berechtigungen

Drei verständliche Rollen mit serverseitig geprüften Rechten.

| Funktion                              | Super Admin | Teamleitung                              | Mitarbeiter                                                            |
| ------------------------------------- | ----------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Neue umfassende Fachdatenkorrekturen  | Ja          | Nein                                     | Nein                                                                   |
| Mitarbeiterdaten / E-Mail korrigieren | Ja          | Nein                                     | Nein                                                                   |
| Benutzerzugang endgültig entfernen    | Ja          | Nein                                     | Nein                                                                   |
| Urlaub entscheiden                    | Ja          | Mit Freigaberecht; keine eigene Freigabe | Nur bei ausdrücklich zugewiesenem Freigaberecht; keine eigene Freigabe |
| Benutzer / Rollen / Teams verwalten   | Ja          | Nach zugewiesenen Rechten                | Nach zugewiesenen Rechten                                              |
| Eigene Vorgänge lesen und Chat nutzen | Ja          | Nach Berechtigungen                      | Nach Berechtigungen                                                    |

Rolle ist nicht gleich pauschale Freigabe

Super Admins haben organisationsweit die effektiven Rechte. Für Teamleitung und Mitarbeiter bleiben vorhandene, anpassbare Einzelberechtigungen maßgeblich. Allein der Rollenname erteilt keine zusätzlichen Verwaltungsrechte. Die neue Berechtigung data.correct ist ausschließlich für echte Super Admins wirksam und kann gewöhnlichen Rollen nicht freigeschaltet werden.

So ändern Sie eine Rolle

1. Administration > Benutzer öffnen und beim passenden Konto den Namen oder die Rollenverwaltung wählen.

2. Im Bereich Rollen und Teams die gewünschte Rolle auswählen und die Rollenauswahl speichern. Für die normale Nutzung eine passende Hauptrolle wählen.

3. Die Administration bietet nur die drei genannten Rollen an. Eigene Rollenänderungen und das Entfernen des letzten aktiven Super Admins bleiben geschützt.

Technisch bleiben bisherige Rollen-Datensätze für historische Verweise bestehen, sind aber deaktiviert. Die Migration bricht ab, wenn noch wirksame Zuordnungen zu entfallenden Rollen existieren; es erfolgt keine ungeprüfte Hoch- oder Herabstufung. Die vorab gelesene Produktionsverteilung enthielt keine solchen Zuordnungen.

## Mitarbeiter und Einladungen

Stammdaten korrigieren, E-Mail ändern und eine Einladung erneut bereitstellen.

Mitarbeiterdaten nachträglich ändern

1. Als Super Admin zu Administration > Benutzer wechseln und den Namen oder Daten bearbeiten öffnen.

2. Unter Mitarbeiterdaten bearbeiten die benötigten Werte ändern: Vorname, Nachname, Anzeigename, Mitarbeiternummer, Telefon, Funktion, Beschäftigungsstatus, Eintritt, Austritt, Geburtsdatum und Wochenstunden.

3. Mitarbeiterdaten speichern wählen. Die Bestätigung abwarten. Rollen und Teams werden im darunterliegenden Bereich separat verwaltet.

Beschäftigungsstatus und Zugang sind getrennt: „Ausgeschieden“ als Beschäftigungsangabe entfernt noch kein Login. Dafür in der Benutzerliste den Kontostatus ändern oder den Benutzer löschen.

Falsche E-Mail-Adresse korrigieren

1. In derselben Detailansicht E-Mail-Adresse korrigieren öffnen und die richtige dienstliche Adresse eingeben.

2. E-Mail-Adresse ändern wählen. Damit ändert sich auch die Anmeldeadresse. Die Aktion versendet selbst keine Nachricht.

3. Bei Status Eingeladen anschließend zur Benutzerliste zurückkehren und Einladung erneut senden wählen. Alte Einladungs- und Passwortlinks werden bei der Korrektur ungültig.

Eine verlorene Einladung erneut senden

Unter Administration > Benutzer die eingeladene Person suchen und Einladung erneut senden anklicken. Eine Neuanlage des Kontos ist nicht erforderlich. Für aktive Konten steht stattdessen die Funktion Passwort vergessen? auf der Anmeldeseite zur Verfügung.

**Versandrückmeldung beachten**

Wenn kein automatischer Mailversand möglich ist, zeigt die App einen Einmaligen Einladungslink. Diesen über „Link kopieren“ vertraulich an die betreffende Person weitergeben. Ein manueller Link ist keine Bestätigung einer versendeten E-Mail. Bei einer laufenden Kontoänderung oder schneller Wiederholung kurz warten und erneut versuchen.

## Benutzer löschen, Inhalte erhalten

Die gewünschte Löschung entfernt den Zugang und bewahrt die Arbeitsnachweise.

1. Administration > Benutzer öffnen und die Person anhand von Name und E-Mail eindeutig prüfen.

2. Die Aktion Löschen wählen. Sie steht Super Admins auch bei bereits genutzten Konten zur Verfügung.

3. Den Bestätigungstext lesen: Der Zugang wird dauerhaft entfernt; vorhandene Nachrichten und Vorgänge bleiben erhalten. Die Löschung bestätigen.

4. Nach erfolgreicher Rückmeldung verschwindet das Konto aus der Benutzerverwaltung. Bestehende Chats zeigen den Autor als Gelöschter Benutzer.

| Bereich                         | Verhalten nach der Löschung                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anmeldung und laufender Zugriff | Auth-Konto, Sitzungen und Refresh-Tokens entfernt; alter Token erhält keine Organisationsrechte. Geräte-/Push-Zugang wird widerrufen.                             |
| Chats und Nachrichten           | Profil-ID, Nachrichteninhalt, Antworten, Anhänge und Gesprächszugehörigkeiten bleiben verknüpft. Sichtbarer Autor: „Gelöschter Benutzer“.                         |
| Fachliche Vorgänge              | Urlaub, Krankmeldungen, Einsatzdaten, Wartungen und andere verknüpfte Datensätze bleiben bestehen.                                                                |
| Dateien und Audit               | Dateien werden nicht gelöscht. Geschützte Personalhistorie und Audit-Daten einschließlich früherer Identitätsangaben bleiben für berechtigte Verwaltung erhalten. |

Löschen und Archivieren unterscheiden sich

Archivieren sperrt den Zugang, erhält aber die Kontenidentität und die Möglichkeit einer kontrollierten Reaktivierung. Löschen entfernt die Auth-Identität dauerhaft und schützt das verbleibende Fachprofil vor Reaktivierung. Eine spätere neue Einladung erzeugt einen neuen Zugang; sie verbindet sich nicht automatisch mit der alten Historie.

Das eigene Konto kann nicht gelöscht werden. Mindestens ein aktiver Super Admin muss erhalten bleiben. Die Funktion ist keine vollständige Löschung aller personenbezogenen Daten: Der Erhalt der Nachrichten und Fachhistorie ist hier ausdrücklich beauftragt. Bereits exportierte oder heruntergeladene Inhalte werden durch Zugangsentzug nicht zurückgerufen.

## Urlaub und Krankmeldungen

Eine Freigabe genügt; falsche Angaben lassen sich nachträglich korrigieren.

Urlaub ohne zweite Freigabeperson genehmigen

1. Urlaub > Team & Freigabe oder den Zugang über Administration > Urlaubsfreigaben öffnen.

2. Den offenen Antrag über Antrag bearbeiten aufrufen, Zeitraum prüfen und bei Bedarf kommentieren.

3. Genehmigen wählen. Der Status wird unmittelbar „Genehmigt“. Für den vorgesehenen Standard ist keine weitere Person erforderlich.

Unter Administration > Systemeinstellungen > Freigabestufen Urlaub bleibt „Eine Freigabe (Standard)“ ausgewählt. Bereits auf einen zweiten Schritt wartende Anträge können ausdrücklich abgeschlossen werden; die Umstellung genehmigt sie nicht automatisch. Super Admins dürfen eigene Anträge entscheiden. Andere Freigabeberechtigte behalten die Sperre eigener Entscheidungen.

Bestehenden Urlaubsantrag korrigieren

Als Super Admin den Antrag öffnen und Daten korrigieren wählen. Urlaubsart, Beginn, Ende, Umfang und Notiz anpassen; einen Korrekturgrund eintragen und speichern. Das gilt auch für historische oder abgeschlossene Anträge. Arbeitstage werden neu berechnet; unzulässige Zeiträume und Konflikte werden serverseitig geprüft.

Krankmeldung korrigieren

In Krankmeldungen > HR-Ansicht den betreffenden Vorgang auswählen und Daten von [Name] korrigieren öffnen. Beginn, voraussichtliches Ende beziehungsweise unbekanntes Ende und Atteststatus ändern. Einen Korrekturgrund ergänzen und speichern. Vorhandene Attestdateien und die betroffene Person bleiben unverändert.

**Korrektur und Entscheidung bleiben nachvollziehbar**

Die Korrektur schreibt den fachlichen Datensatz mit Vorher-/Nachher-Werten und Grund ins Audit. Sie ersetzt keinen früheren Freigabevermerk und startet keine zusätzliche Freigabestufe. Eine spätere Statusentscheidung erfolgt über den bestehenden Workflow.

## Fuhrpark und Wartungen

Auch ein bereits angelegter oder abgeschlossener Termin ist korrigierbar.

Wartung oder Termin bearbeiten

1. Fuhrpark > Wartungen & Termine öffnen. Bei bereits erledigten oder stornierten Vorgängen den Filter Alle Termine wählen.

2. Am betreffenden Eintrag Wartung bearbeiten öffnen. Die vorhandenen Daten sind bereits eingetragen.

3. Fahrzeug, Art, Titel, Werkstatt/Dienstleister, Termin, Kilometerangaben, Notiz und Status entsprechend korrigieren. Bei abgeschlossener Wartung lassen sich Abschlussdatum und Kilometerstand ändern.

4. Wartung speichern wählen und die Rückmeldung prüfen. Der Status „Storniert“ erhält den Termin als Nachweis.

Schadensmeldung korrigieren

Unter Schadensmeldungen > Meldung bearbeiten Fahrzeug, Schadensdatum, Beschreibung und Status korrigieren. Die ursprünglich meldende Person bleibt erhalten. Änderungen werden mit Vorher-/Nachher-Daten protokolliert.

Kilometermeldung korrigieren

In der Historie der Kilometerstände den Eintrag über Meldung korrigieren öffnen. Kilometerwert, Datum und Prüfstatus ändern, einen Korrekturgrund angeben und Korrektur speichern wählen. Geprüfte Meldungen und Fahrzeugkilometer werden auf Konsistenz geprüft.

Fahrzeugdaten und nächste Wartung

Auf der Fahrzeugkarte Bearbeiten wählen. Stammdaten, Zuordnung, nächste Wartung und aktueller Kilometerstand sind bearbeitbar. Ein niedrigerer aktueller Kilometerstand darf die bereits bestätigte Kilometerhistorie nicht unterschreiten. Falls die Historie falsch ist, zuerst deren fehlerhaften Eintrag korrigieren.

**Berechtigung**

Die neuen Korrekturaktionen sind Super Admins vorbehalten. Bestehende berechtigte Abläufe zum Anlegen, Prüfen oder Abschließen bleiben weiterhin über die entsprechenden Fuhrparkrechte verfügbar.

## Weitere nachträgliche Änderungen

Material, Dokumente und vorhandene Verwaltungsfunktionen.

Materialanforderung korrigieren

Unter Material > Bearbeitung die Anforderung mit einer Position öffnen und Daten korrigieren wählen. Artikel, Menge, Einheit, Kategorie, Priorität, Bedarfstermin und Begründung lassen sich mit Korrekturgrund ändern. Der bestehende Bearbeitungsstatus bleibt erhalten; Genehmigung oder Ablehnung erfolgen über den normalen Workflow.

Die aktuelle Eingabemaske legt eine Position pro Anforderung an. Bereits vorhandene Mehrpositionsanforderungen werden von dieser Korrektur ausdrücklich abgewiesen, damit keine Position versehentlich überschrieben wird.

Dokumentangaben korrigieren

In Dokumente das Dokument auswählen und Dokumentdaten korrigieren öffnen. Titel, Gültigkeitsbeginn/-ende und die Anforderung einer Lesebestätigung ändern; Grund angeben und speichern. Die zugehörige Datei wird dadurch nicht ausgetauscht. Dateiinhalte werden über den vorhandenen Versionsablauf gepflegt.

Dokumentordner umbenennen

In Dokumente den bestehenden Ordner auswählen und Ordner umbenennen wählen. Neuen Namen und Korrekturgrund eingeben, anschließend Ordnername speichern wählen. Dateien, Unterordner und Zugriffsregeln bleiben erhalten. Fremde persönliche Ordner bleiben geschützt.

Bereits vorhandene Bearbeitungsmöglichkeiten

| Bereich             | Verwaltungsweg / Einordnung                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Einsatzplanung      | Vorhandenen Einsatz öffnen, bearbeiten oder stornieren. Die bisherigen Konflikt- und Bestätigungsregeln gelten weiter. |
| News                | Beitrag bearbeiten, planen oder archivieren. Autor und Veröffentlichungsablauf bleiben nachvollziehbar.                |
| Teams und Rollen    | Administration öffnen; Teamnamen, Mitgliedschaften, Rollenwahl und zulässige Einzelrechte verwalten.                   |
| Systemeinstellungen | Organisationsweite Einstellungen mit Verwaltungsrecht ändern, einschließlich Urlaubsfreigabestufen.                    |

Was „umfassend bearbeiten“ technisch bedeutet

Die Formulare bearbeiten gezielt die aufgeführten Fachfelder. Interne IDs, Mandantenzuordnung, Audit-Einträge und fremde Nachrichtenautoren bleiben geschützt, damit bestehende Vorgänge nachvollziehbar zugeordnet bleiben.

## Technische Umsetzung

Frontend, berechtigte Serveraktionen und stabile Referenzen.

**Architektur**

React/TypeScript-Oberfläche → authentifizierte Edge Function oder RPC → serverseitige Rollen-/Mandantenprüfung → Datenbanktransaktion und Audit. Die Oberfläche blendet Aktionen abhängig von Rechten ein; die maßgebliche Prüfung erfolgt zusätzlich auf dem Server.

Zwei getrennte Identitäten

| Baustein        | Aufgabe                               | Bei Benutzerlöschung                                                                |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| auth.users      | Anmeldung, Identitäten, Sitzungen     | Wird entfernt; Refresh-Tokens werden gelöscht.                                      |
| public.profiles | Stabile fachliche Benutzer-ID         | Bleibt erhalten; auth_user_id wird NULL, Status archiviert, deleted_at gesetzt.     |
| Fachdatensätze  | Nachrichten, Vorgänge und Zuordnungen | Referenzieren weiterhin dieselbe Profil-ID. Keine Löschkaskade über das Fachprofil. |
| Storage-Objekte | Gespeicherte Dateien                  | Datei und Pfad bleiben erhalten. Frühere Auth-Eigentümerreferenzen werden entfernt. |

Unmittelbarer Entzug von Berechtigungen

Die Berechtigungsermittlung verlangt ein aktives Profil mit passender Auth-ID in einer aktiven Organisation. Das gelöschte Profil erfüllt diese Bedingungen nicht mehr. Auch ein noch nicht abgelaufener, zuvor ausgestellter JWT erhält dadurch keinen Zugriff auf Organisationsdaten. Die lokale Datenbankprüfung verwendet ausdrücklich noch den früheren JWT-Benutzerschlüssel.

Nachvollziehbarkeit und parallele Aktionen

Die Löschtransaktion prüft Super-Admin-Rolle, Organisation, eigenes Konto und verbleibende Administration. Sie sperrt die betroffenen Zeilen und koordiniert sich mit anderen Kontoaktionen. Laufende E-Mail-Änderungen oder Einladungen blockieren die Löschung vorübergehend. Wiederholtes Löschen desselben bereits gelöschten Profils ist idempotent.

Bestehende Nachrichten lesen den Anzeigenamen aus dem erhaltenen Profil. Vertrauliche ehemalige Personalangaben sind für gewöhnliche Kollegen ausgeblendet; autorisierte Benutzerverwaltung und Audit behalten ihre Nachweise.

## Codeauszug: Zugang entfernen

Auszüge aus der tatsächlich lokal implementierten Migration; keine isolierte Installationsanleitung.

1. Stabiles Fachprofil statt Löschen der Historie

```sql
update public.profiles
set auth_user_id = null,
    status = 'archived', archived_at = now(),
    deleted_at = now(), deleted_by = me,
    display_name = 'Gelöschter Benutzer', avatar_url = null,
    email = target.id::text || '@deleted.invalid',
    updated_at = now()
where id = target.id;

delete from auth.refresh_tokens where user_id = auth_id::text;
delete from auth.users where id = auth_id;
update public.user_devices
set revoked_at = now(), push_token = null, push_token_hash = null
where profile_id = target.id;
```

Quelle: Migration 20260916080136, private.delete_user (formatierter Auszug)

Diese Schritte liegen zusammen mit Berechtigungsprüfung, Sperren, Storage-Eigentümeranpassung und Audit-Eintrag in derselben Datenbanktransaktion. public.profiles wird nicht gelöscht. Schlägt ein Schritt fehl, wird die Transaktion zurückgerollt.

2. Aufruf über die Berechtigung des angemeldeten Nutzers

```typescript
const context = await requireUser(req, "users.manage");
const { error } = await context.caller.rpc("admin_delete_user", {
  p_profile_id: parsed.data.profileId,
  p_request_id: requestId,
});
if (error) throw userDeletionError(error) ?? error;
```

Quelle: supabase/functions/admin-delete-user/index.ts

Die RPC prüft zusätzlich die echte Rolle super_admin. Eine bloß zugewiesene users.manage-Berechtigung reicht zur Löschung nicht aus. Der öffentliche Einstieg ist ein SQL-Invoker mit festem search_path; die private Implementierung enthält die eigentliche Autorisierung.

Vollständiger Quelltext: supabase/migrations/20260916080136_retained_deleted_users_and_three_roles.sql. Alte Clients werden über admin_delete_unused_invited_user auf dieselbe datenerhaltende Implementierung geführt.

## Codeauszug: kontrollierte Korrekturen

Berechtigungen, Änderungsgrund und Vorher-/Nachher-Protokoll.

Korrektur eines Urlaubsantrags

```sql
if me is null or not private.has_system_role(array['super_admin']) then
  raise exception 'permission_denied' using errcode='42501';
end if;
-- ... Zeitraum, Mandant, Konflikte und Korrekturgrund prüfen ...
update public.leave_requests
set leave_type=p_leave_type, starts_on=p_starts_on,
    ends_on=p_ends_on, day_fraction=p_day_fraction,
    workdays=days, note=nullif(trim(p_note),'')
where id=target.id returning * into after_row;
-- Audit enthält den Grund und beide Zustände:
jsonb_build_object('reason', trim(p_correction_reason),
                  'before', to_jsonb(target),
                  'after', to_jsonb(after_row))
```

Quelle: Migration 20260916080152, private.correct_leave_request (gekürzt)

Die Auslassungen enthalten weitere Prüfungen und das INSERT in audit_logs. Der Auszug beschreibt den Mechanismus und ist allein nicht ausführbar. Die vollständige Funktion bewahrt Profilzuordnung, Antragstatus und vorhandene Entscheidungen.

E-Mail-Änderung über die Auth-API

1. Die RPC admin_begin_employee_email_change prüft Rechte, Zielprofil und Adresse und reserviert den Vorgang im Audit.

2. Die Edge Function ändert die Adresse über auth.admin.updateUserById. Ein neu erzeugter, verworfener Auth-Link macht vorherige Links ungültig; es wird keine Mail versendet.

3. admin_complete_employee_email_change gleicht das Fachprofil ab und protokolliert den Erfolg. Bei Fehlern wird zuerst der Abschlusszustand gelesen und andernfalls eine Rücksetzung der Auth-Änderung versucht.

Da Auth-API und Fach-RPC keine gemeinsame Datenbanktransaktion bilden, behandelt die Implementierung Fehler und unklare Antworten ausdrücklich. Eine nach Commit verlorene Antwort darf nicht nur die Auth-Adresse fälschlich zurücksetzen. Ein fehlgeschlagener Ausgleich wird als Fehler gemeldet.

Quellen: supabase/functions/_shared/employee-edit.ts; admin-update-employee-email/index.ts; Migration 20260916080044_employee_profile_editing.sql.

## Prüfungen und Nachweise

Lokale Verifikation mit künstlichen Testdaten; keine produktive Abnahme vorgetäuscht.

| Prüfung                      | Ergebnis / Aussage                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint und Build | TypeScript, ESLint und lokaler Release-Build erfolgreich. Keine Bereitstellung.                                                                                               |
| React-/Komponententests      | 93 Tests in 12 Dateien erfolgreich, einschließlich neuer Korrekturformulare und Admin-Aktionen.                                                                               |
| PostgreSQL / pgTAP           | 503 Assertions in 13 Dateien erfolgreich; darunter 38 für datenerhaltende Kontolöschung.                                                                                      |
| Edge-Logik / Deno            | 19 Shared-Logik-Tests erfolgreich; fünf geänderte/neue Edge-Einstiege erfolgreich typgeprüft.                                                                                 |
| Browser auf Desktop / Mobil  | 12 öffentliche Playwright-Läufe sowie 16 gemockte Speicheraktionen auf Desktop/Mobil erfolgreich. Kein Seitenüberlauf oder JavaScript-Fehler in den geprüften neuen Abläufen. |
| Lokaler Auth-Dienst          | Echte Adressänderung; alter Invite-Link gesperrt, neuer Link nutzbar; Rücksetzung bei Fehler und verlorene Abschlussantwort geprüft. Testkonten anschließend entfernt.        |
| DB-Lint / Security-Advisors  | Keine Fehler. Ein Lint-Hinweis: ungenutzter Parameter p_name der absichtlich gesperrten Rollenerstellung. Security-Advisors: kein Fehlerbefund.                               |

Besonders relevante Löschprüfungen

Aktiver Benutzer mit Nachrichten, Anhängen und Sitzung entfernbar; Nachrichtentext unverändert; ursprüngliche Profil-ID erhalten; Autor für verbleibende Chatteilnehmer als „Gelöschter Benutzer“ lesbar; Auth-Konto, Sitzungen und Refresh-Tokens entfernt; alter Token ohne Organisationszugriff; keine fremde Organisation und keine Selbstlöschung; erneuter Aufruf ohne zweite Löschung; alter Endpunkt bewahrt ebenfalls Daten.

Aussagegrenzen der Prüfung

Mock-Browserprüfungen bestätigen Bedienung, API-Payloads und responsive Darstellung, aber keine externe E-Mail-Zustellung. Die SQL-Tests laufen lokal mit Rollback. Der zusätzliche Auth-Test nutzt ausschließlich lokale example.test-Konten. Produktive End-to-End-Prüfungen und die Veröffentlichung der Telefonat-Ergänzungen wurden nicht durchgeführt.

Die bestehende externe SMTP-Abnahme bleibt separat offen. Dieses Dokument behauptet weder eine behördliche Freigabe noch die Erfüllung nicht benannter Fördervorgaben.

## Quellstand und spätere Übergabe

Reproduzierbare Dateien und ausdrücklich ausstehende Veröffentlichung.

| Baustein                    | Datei / Zuordnung                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mitarbeiterdaten und E-Mail | 20260916080044_employee_profile_editing.sql; Edge Functions admin-update-employee und admin-update-employee-email                                        |
| Benutzerlöschung und Rollen | 20260916080136_retained_deleted_users_and_three_roles.sql; admin-delete-user; Kompatibilität admin-delete-invited-user                                   |
| Fachliche Korrekturen       | 20260916080152_super_admin_record_corrections.sql; LeavePage, SickLeavePage, MaterialRequestsPage, Documents                                             |
| Fuhrpark                    | 20260916080340_super_admin_fleet_corrections.sql; src/features/fleet/FleetPage.tsx                                                                       |
| Admin-Oberfläche            | src/features/admin/Admin.tsx; zugehörige Tests und src/styles/admin-controls.css                                                                         |
| Automatisierte Nachweise    | supabase/tests/invitation_deletion.test.sql, employee_editing.test.sql, record_corrections.test.sql, fleet_corrections.test.sql sowie Rollen-/RLS-Suites |

Migrationsdateien liegen unter supabase/migrations/. Die generierten SETUP_FRESH.sql und SETUP_UPGRADE_20260710.sql werden aus den Quellen aktualisiert. Bestehende Installationen erhalten später nur die noch fehlenden Migrationen; Setup-Bundles sind nicht zur erneuten Ausführung auf der bereits migrierten Produktion bestimmt.

Prüfungen lokal wiederholen

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npx --yes supabase@2.111.0 test db --local
npx playwright test
```

Quelle: Projektbefehle; laufende lokale Supabase-Umgebung vorausgesetzt

Veröffentlichung bleibt ausstehend

Vor einer späteren Bereitstellung: ausdrückliche Freigabe einholen, aktuellen Quellstand festhalten, Sicherung und Rollenbestand prüfen, neue Migrationen und Edge Functions zusammen mit dem passenden Frontend bereitstellen und die freigegebenen Abläufe mit Testkonten abnehmen. Keine dieser produktiven Aktionen ist mit diesem lokalen Arbeitsstand bereits erfolgt.

Für die spätere Projektabgabe gehören diese PDF, die editierbare Markdown-Fassung, der freigegebene Quellstand und die Abnahmeergebnisse zusammen. Ein Dokumenten-/Quellmanifest mit SHA-256-Prüfsummen liegt ergänzend unter output/pdf/Alberring_Quellnachweis_2026-09-16.json.
