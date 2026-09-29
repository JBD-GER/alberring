# Veröffentlichung der Telefonat-Ergänzung am 16.09.2026

Die zunächst zurückgestellte Version wurde nach der ausdrücklichen Freigabe „okay launch es jetzt“ veröffentlicht. Dieser Nachweis ergänzt die unverändert aufbewahrte PDF-Dokumentation Version 2.0 und deren lokalen Quellnachweis.

- Live-Adresse: https://alberringapp.vercel.app
- Vercel-Deployment: `dpl_Dfj4GBtsZ6j8cKsgNR5QoCwowdUW`, Status **READY**, Ziel **production**.
- Deployment-Adresse: https://alberringapp-lvunw17af-flaaq-holding-gmb-h.vercel.app
- Vorherige Version: `dpl_9VmfwR3ZymFcHmZefJCEtgXSuP2H`.
- Auslieferung aus dem geprüften lokalen Arbeitsstand, ohne neuen Git-Commit. Ein im Hosting angezeigter älterer Commit allein identifiziert daher nicht diesen Quellstand; maßgeblich sind die Datei-/Artefaktprüfsummen.

## Veröffentlichter Umfang

Mitarbeiterdaten und Anmelde-E-Mail bearbeiten, Einladung erneut senden, Benutzerzugang mit erhaltener Fachhistorie löschen, drei zuweisbare Rollen sowie neue Super-Admin-Korrekturen für Wartungen, Schäden, Kilometerstände, Urlaub, Krankheit, Material, Dokumentangaben und Ordnernamen. Die Einzelfreigabe von Urlaub bleibt aktiv.

Produktiv angewendete Migrationen:

1. `20260916080044_employee_profile_editing.sql`
2. `20260916080136_retained_deleted_users_and_three_roles.sql`
3. `20260916080152_super_admin_record_corrections.sql`
4. `20260916080340_super_admin_fleet_corrections.sql`
5. `20260916101245_restrict_fleet_rpc_service_role_access.sql`

Die fünfte Migration gleicht drei technische Ausführungsrechte an den getesteten lokalen Stand an. In der gehosteten Umgebung führten Standardprivilegien zu zusätzlichen `service_role`-Rechten an drei neuen Fuhrpark-RPCs. Diese direkten Rechte wurden widerrufen; angemeldete berechtigte Benutzer behalten ihre geprüften Aufrufrechte. Dazu wurden drei zusätzliche SQL-Prüfungen ergänzt.

Bereitgestellte Edge Functions: `admin-update-employee`, `admin-update-employee-email`, `admin-delete-user`, `admin-resend-invite`, `admin-delete-invited-user`. Alle fünf sind ACTIVE und verwenden JWT-Prüfung. Das Frontend wurde als Produktionsbuild zunächst bereitgestellt und nach Backend-Abgleich auf die reguläre Adresse umgeschaltet.

## Prüfungen und Schutz bestehender Daten

Vor der Änderung wurden Schema und öffentliche Anwendungsdaten in einem privaten lokalen Verzeichnis gesichert. Die Dump-Befehle liefen erfolgreich; Dateigrößen, Zugriffsrechte und Prüfsummen wurden kontrolliert. Eine vollständige Wiederherstellungsprobe wurde dabei nicht durchgeführt. Beim Daten-Dump gemeldete zyklische Fremdschlüssel von Nachrichten und Dokumentordnern müssen bei einer Wiederherstellung berücksichtigt werden.

Der Quellnachweis des zuvor geprüften Standes stimmte vor dem Launch bei allen 65 erfassten Dateien. Nach Bereitstellung stimmen 39 Datenbankfunktionsdefinitionen und deren effektive Ausführungsrechte mit der lokalen Testumgebung überein. Alle 68 ausgelieferten statischen Dateien einschließlich HTML, Service Worker und Fachmodulen sind bytegleich zum Produktionsbuild. Die Remote-Migrationshistorie ist vollständig; es stehen keine weiteren Migrationen aus.

Lokaler Gesamtstand: **506 pgTAP-Prüfungen** in 13 Dateien bestanden. Die zuvor nachgewiesenen 93 Komponenten- und 19 Deno-Tests gelten weiterhin für den unveränderten Frontend-/Edge-Code. Die zusätzlichen drei Prüfungen betreffen ausschließlich die technischen SQL-Aufrufrechte.

Live-Prüfungen:

- Öffentliche Login-, Passwort-vergessen-, Reset-, Einladungs- und Zugriffsschutzseiten auf 390 und 1440 Pixel Breite geprüft: keine Browser-/Ressourcenfehler, defekten Bilder oder horizontalen Überläufe.
- Alle fünf Edge-Endpunkte weisen Anfragen ohne Anmeldung mit HTTP 401 zurück.
- Genau drei aktive Rollen: `super_admin`, `employee`, `team_lead`.
- Anzahl der Profile, Auth-Konten, Nachrichten und Storage-Objekte vor und nach der Migration unverändert; kein Profil wurde durch diese Veröffentlichung gelöscht.
- Remote-Datenbank-Lint ohne Fehler; lediglich der bekannte Hinweis auf den ungenutzten Parameter `p_name` der absichtlich gesperrten Rollenerstellung. Security-Advisors ohne Fehlerbefund.
- Fehlerlog-Abfrage des neuen Vercel-Deployments ohne Einträge zum Prüfzeitpunkt.

Es wurden keine echten Mitarbeiterkonten bearbeitet oder gelöscht, keine Einladungs-/Reset-Mails verschickt und keine fachlichen Entscheidungen ausgeführt. Authentifizierte Fachabläufe wurden lokal geprüft; der Live-Smoke umfasst öffentliche, lesende Browserprüfungen und technische Backend-Abgleiche. Eine reale externe SMTP-Zustellprüfung ist dadurch nicht ersetzt.

## Nutzung und Nachweisdateien

Bereits geöffnete App-Sitzungen über **Aktualisieren** auf den neuen Stand bringen oder die App vollständig schließen und neu öffnen.

- Fachliche Dokumentation und Admin-Anleitung: `output/pdf/Alberring_Projektdokumentation_Kundenfeedback_2026-09-16.pdf` (historischer lokaler Abnahmestand Version 2.0).
- Ursprünglicher Quellnachweis: `output/pdf/Alberring_Quellnachweis_2026-09-16.json`.
- Ergänzender Veröffentlichungsnachweis mit Produktionsartefakten, Function-Versionen und aktuellen Quellen: `output/pdf/Alberring_Veroeffentlichungsnachweis_2026-09-16.json`.
