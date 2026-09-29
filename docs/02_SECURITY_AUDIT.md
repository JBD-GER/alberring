# 02 · Security Audit

Stand: 17.09.2026. Gegenstand: vorhandene Web-Anwendung, gemeinsame Client-Erweiterungen, native Projektkonfiguration, Supabase-Migrationen, Edge Functions und lokale Prüfung. Diese technische Prüfung ist kein unabhängiges Penetrationstest-Zertifikat. Einstellungen eines gehosteten Supabase-Projekts oder Store-Kontos lassen sich durch Repository-Dateien allein nicht bestätigen. Die Umsetzung hat keine Produktionsdatenbank verändert.

## Prüfmodell und Bestandsschutz

APK, IPA und JavaScript-Bundles gelten als vollständig einsehbar. Zugriffsschutz darf deshalb nicht auf versteckten Client-Schlüsseln, ausgeblendeten Schaltflächen oder App-Paketintegrität beruhen. Maßgeblich sind Supabase Auth, aktuelle Datenbankberechtigungen, Row Level Security und geprüfte Serverfunktionen.

Der Arbeitsbaum enthielt bereits umfangreiche Änderungen an Benutzerverwaltung, Rollen, Workflows, Tests und SQL-Dateien. Diese wurden erhalten. Die IST-Analyse entstand vor der Implementierung. Bei der SQL-Bewertung wurde die gesamte Migrationsreihenfolge berücksichtigt: frühere Policies sind teilweise durch spätere Härtungen ersetzt. Historische Risiken wurden deshalb nicht fälschlich als aktuelle, unbehobene Lücken bewertet.

## Ergebnisse und Maßnahmen

| Bereich                     | Vorher / Risiko                                                                               | Umsetzung und Ergebnis                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Auth-Daten           | SDK verwendete browsertypischen Storage                                                       | Plattformabstraktion verwendet unter iOS den eigenen Keychain-Adapter und unter Android Keystore-gestützte Verschlüsselung. Native Storage-Fehler führen zu einer Fehlermeldung; kein stiller Rückfall auf Klartext-localStorage. Web-Verhalten bleibt erhalten.                                  |
| Öffentliche Build-Variablen | Vorhandensein und URL wurden geprüft, private Schlüsseltypen nicht zuverlässig ausgeschlossen | Explizite VITE-Variablenliste, HTTPS-Regel für native Builds, Prüfung auf private Schlüsselpräfixe und auf service_role-JWT statt anon-JWT. Zusätzlicher Musterscan für Clientquellen und erzeugte Bundles.                                                                                       |
| Client-Secretprüfung        | Bundles können ausgelesen werden                                                              | Im untersuchten Client wurden keine privaten Supabase-, Stripe-, OpenAI-, Resend-, Datenbank- oder Signing-Zugangsdaten festgestellt. Service-Role-Zugriff bleibt auf Edge Functions/Administration begrenzt. Ein Musterscan ersetzt keine Inventur aller externen Secrets.                       |
| Native Weiterleitungen      | Passwort-Reset nutzte ausschließlich location.origin                                          | Native Auth-Weiterleitung und Deep-Link-Parser akzeptieren bekannte Schemes/Ziele und PKCE-Code; fremde URLs und ungeprüfte Weiterleitungsziele werden abgewiesen. Produktive Redirect-Allowlist muss im Betreiberprojekt gesetzt werden.                                                         |
| Gerätezuordnung             | user_devices enthielt bereits Tokenfelder, jedoch keine native Lebenszyklusbindung            | Vorhandene Tabelle erweitert: Installations-ID, Auth-Session-ID, Push-Umgebung und App-Version. Registrierung und Widerruf über begrenzte RPCs. Profil und Organisation werden serverseitig bestimmt.                                                                                             |
| Tokenzugriff                | Eigene Geräte konnten direkt geändert und Tokenfelder gelesen werden                          | Direkte Client-Writes entzogen. Raw Token und Hash nicht client-lesbar. Eine aktive Tokenbindung pro Plattform/Umgebung, atomare Rotation und Neuverknüpfung. Höchstens zehn aktive native Geräte pro Profil.                                                                                     |
| Logout / Parallelität       | Logout ignorierte SDK-Fehler; keine Push-Abmeldung                                            | Gerätewiderruf vor lokalem Supabase-Sign-out; Fehler werden angezeigt. Registrierung und Widerruf sind clientseitig serialisiert. Generation-Prüfungen unterbinden verspätete Registrierung und veraltete Rückmeldungen. Bei fehlender Verbindung wird keine erfolgreiche Abmeldung vorgetäuscht. |
| Push-Inhalt                 | Kein APNs-/FCM-Versand                                                                        | APNs-/FCM-Sender vorbereitet. Auf dem Sperrbildschirm nur allgemeiner Hinweis, keine Nachrichten-, Krankheits-, Standort- oder Personaldetails. Navigation ist auf interne App-Pfade beschränkt.                                                                                                  |
| Push-Wiederholung           | Andere Kanäle wurden ohne Anbieter übersprungen                                               | Atomare Batch-Lease und gerätebezogene Versandbelege, begrenzte Wiederholung, erneute Prüfung von Opt-out/Ruhezeit, Behandlung ungültiger Tokens. Fehlende Credentials verschieben den Versuch ohne vorgetäuschten Versand.                                                                       |
| Browserberechtigungen       | HTTP-Header blockierten Mikrofon und Standort                                                 | Gezielt auf eigene Herkunft begrenzte Freigabe für nutzerinitiierte Funktionen; kein allgemeines Öffnen für Fremdframes. Native Transport-/WebView-Konfiguration wird getrennt geführt.                                                                                                           |
| Medien                      | Browserdateien; Chat nur PDF/JPEG/PNG                                                         | Aufnahme/Fotoauswahl mit Fehlerzuständen. Neue Fotoaufbereitung dekodiert und kodiert Pixel neu, begrenzt Dimensionen/Größe und entfernt EXIF. Chat-Audio bleibt im vorhandenen privaten Bucket mit 10-MiB-Limit und bestehender Mitgliedschaftsprüfung.                                          |

## Supabase-Zugriffsschutz

Die bestehende Mandanten- und Benutzerisolation bleibt maßgeblich. `private.current_profile_id()` und `private.current_organization_id()` bestimmen aus `auth.uid()` das aktive Profil in einer aktiven Organisation. Rechte stammen aus Datenbankrollen und zeitlich gültigen Zuweisungen. Benutzereditierbares `user_metadata` wird nicht für Rollenfreigaben verwendet; die frühere Einladungsauswertung wurde bereits im Bestand auf `app_metadata` gehärtet.

Im Bestand sind öffentliche Tabellen mit RLS versehen. Anonyme Tabellenzugriffe und gefährliche Privilegien wie TRUNCATE wurden entzogen. Kritische Änderungen erfolgen über geprüfte RPCs; vertrauliche HR-Spalten besitzen eingeschränkte Leserechte. Admin-Edge-Funktionen prüfen den Benutzer über Supabase Auth, aktiven Kontostatus und aktuelle Berechtigungen. CORS ist eine ausdrückliche Herkunftsliste und ersetzt keine Autorisierung.

Private Storage-Buckets verwenden Mandanten-, Eigentümer- und Konversationsregeln. `create-secure-download` autorisiert den Dateipfad vor dem Erzeugen eines zeitlich begrenzten Links; TTL beträgt konfigurierbar 30 bis 120 Sekunden. Ein signierter Link ist innerhalb seiner Laufzeit ein Zugriffsnachweis und darf nicht öffentlich weitergegeben werden. Uploadbereinigung bleibt auf zulässige, nicht mehr referenzierte Objekte begrenzt.

Die neue Migration `20260917073037_native_push_devices_and_audio.sql` ergänzt ausschließlich den erforderlichen Geräte-/Versandzustand sowie Audio-MIME-Typen. `push_delivery_receipts` besitzt RLS und ausschließlich Service-Role-Grants. Die öffentlichen Registrierungs-Wrapper laufen als SECURITY INVOKER; die benötigte privilegierte Implementierung befindet sich im nicht per PostgREST exponierten Schema `private`, mit ausdrücklichen Execute-Grants und interner Auth-Prüfung. Service-only-RPCs für aktiven Geräteabruf und Batch-Claim sind für anon/authenticated gesperrt. Keine Policy wurde zum Beheben eines Clientfehlers pauschal geöffnet.

Supabase unterscheidet Tabellen-Grants und Zeilen-Policies; beides muss korrekt gesetzt sein. Neue Objekte erhalten hier ausdrückliche Minimalberechtigungen. Siehe [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) und [Data-API-Härtung](https://supabase.com/docs/guides/api/securing-your-api).

## Push-Sicherheitsarchitektur

`register_push_device` übernimmt keine vom Client behauptete Benutzer-/Mandanten-ID. Eine gültige Auth-Session muss zum angemeldeten Benutzer gehören; abgelaufene oder fehlende Sessions werden abgewiesen. Tokenformat/Länge/Plattform/Umgebung werden geprüft. Der SHA-256-Hash entsteht serverseitig. Tokenwechsel oder Kontowechsel widerrufen die bisherige aktive Bindung und löschen den alten Rohwert. Nach Logout/Providerwiderruf bleibt nur der minimale Registerdatensatz bestehen.

Der Sender berücksichtigt nur aktive Profile/Organisationen mit bestehender, nicht abgelaufener Session und einer innerhalb von 60 Tagen aktualisierten Gerätebindung. Diese Frist ist ein Versandfilter, kein automatischer Löschlauf. APNs verwendet signierte ES256-Provider-Tokens, FCM signierte Service-Account-Assertions und kurzlebige OAuth2-Zugriffstokens. Credentials werden ausschließlich serverseitig gelesen. Token- und Credential-Inhalte werden in diesem Versandpfad nicht geloggt.

Parallelität und Netzabbrüche können nach Annahme durch einen externen Anbieter eine Wiederholung verursachen, falls der anschließende Datenbankbeleg ausfällt. Das System arbeitet daher mit mindestens einmaliger Zustellung, nicht mit behaupteter Exactly-once-Garantie; gerätebezogene Belege und Anbieter-Collapse/Tags reduzieren Duplikate. Bereits an das Betriebssystem zugestellte Meldungen können bei einer späteren serverseitigen Abmeldung nicht garantiert zurückgeholt werden. Der Client entfernt lokale zugestellte Meldungen soweit die Plattform dies unterstützt.

## Konfiguration ohne Secretwerte

| Ziel                       | Später zu setzen / zu prüfen                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Edge-CORS                  | Bestehende Web-Herkünfte plus `capacitor://localhost` (iOS) und `https://localhost` (Android), exakt in `ALLOWED_ORIGINS`                                          |
| Supabase Auth              | Produktive Web-URL und native Callback-Schemes in der Redirect-Allowlist; SMTP/Verifikation/Passwortrichtlinie prüfen                                              |
| APNs                       | `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, für separate Dev-App `APNS_DEVELOPMENT_BUNDLE_ID`; korrekte Entwicklungs-/Produktionsumgebung |
| FCM                        | `FCM_SERVICE_ACCOUNT_JSON` ausschließlich als Edge-Secret; Android-Clientkonfiguration separat im nativen Build                                                    |
| Öffentliche Storage-Origin | Optional `APP_SUPABASE_PUBLIC_URL` im Edge-Server, z. B. für lokale Docker-/Reverse-Proxy-Umgebungen; produktiv ohne Wert unverändert                              |
| Automatisierung            | Bestehendes `AUTOMATION_SECRET`, Scheduler-Konfiguration und Anbieterzustand prüfen                                                                                |
| Client                     | Nur zulässige öffentliche VITE-Werte; `VITE_PUSH_ENABLED` erst nach Betreiberkonfiguration aktivieren                                                              |

## Nachgewiesene Prüfungen

- Alle 14 lokalen SQL-Testdateien: **539 pgTAP-Prüfungen erfolgreich**, davon 33 neue Geräte-/Session-/Privilege-/Audio-Prüfungen.
- Alle 13 Edge-Entrypoints: Deno-Typprüfung erfolgreich; **29 Deno-Tests erfolgreich**, einschließlich APNs-JWT-Signaturtest mit flüchtigem Testschlüssel, FCM-Request-Vertrag, ungültiger Tokens, Vertraulichkeit und Ruhezeiten.
- Client-Push: **7 gezielte Vitest-Prüfungen erfolgreich**, einschließlich konkurrierender Registrierung/Abmeldung, verweigerter Permission und abgewiesenem Fremdlink.
- `supabase db advisors --local --type security --level warn --fail-on error`: **keine Befunde**.
- `supabase db lint --local --level warning --fail-on error --schema public,private`: kein Fehler; bestehende Warnung zum ungenutzten Parameter `p_name` in `public.create_role`.
- Schema-Abgleich über lokale Shadow-Datenbank: **No schema changes found**. Die CLI liefert für diesen In-sync-Zustand einen Fehler-Exitcode; es bestand kein Schema-Diff. Migrationsdatei und lokales Schema wurden abgeglichen, die beiden vorhandenen Setup-Bundles neu erzeugt.
- Für Browserprüfungen wurde eine separate lokale Organisation mit ausdrücklich bezeichneten Prüfprofilen und einer realen Testkonversation angelegt. Sie ist nicht Bestandteil produktiver App-Daten oder hardcodierter Clientlogik. Kein E-Mail-Versand.

## Im lokalen Integrationstest behobener Downloadfehler

Die lokale Edge-Laufzeit verwendet intern `http://kong:8000`. Der dort erzeugte signierte Storage-Link war für den Browser nicht auflösbar. Der neue Serverhelfer `publicDownloadUrl` ersetzt ausschließlich die Herkunft eines signierten Storage-Pfads durch die validierte optionale Betreiberkonfiguration `APP_SUPABASE_PUBLIC_URL`. Signierter Pfad und Query bleiben unverändert. Er erlaubt HTTPS sowie HTTP auf Loopback, verbietet eingebettete Credentials/fremde Pfadpräfixe und übernimmt keine Client-Herkunft als Ziel. Ohne Konfiguration bleibt das produktive Verhalten unverändert. Der anschließende reale Abruf über die autorisierte Edge-Funktion lieferte lokal HTTP 200 und JPEG-Inhalt. Zwei zusätzliche Deno-Tests prüfen URL-Erhalt und die Ablehnung unzulässiger Ziele.

## Verbleibende Prüf- und Betriebsaufgaben

1. Migration und Edge Functions kontrolliert in Staging, anschließend im Betreiberprojekt anwenden. Deployter Stand, Redirects, CORS und Storage-Einstellungen müssen gegen das Repository geprüft werden.
2. APNs/FCM-Zustellung auf echten Geräten mit tatsächlichen Betreiber-Credentials prüfen: Vordergrund, Hintergrund, beendet, Rotation, Logout, erneute Installation, Tipp auf Benachrichtigung. Die derzeitigen Tests belegen Protokollverhalten; sie belegen keine Live-Zustellung.
3. Keychain-/Keystore-Wiederherstellung, Gerätesperre, Backup/Restore und Fehlerfälle auf signierten Gerätebuilds prüfen. Ein erfolgreicher Webtest belegt diese Betriebssystemfunktionen nicht.
4. Fachliche Lösch- und Aufbewahrungsfristen für HR-/Krankheitsdaten, Chat, Dateien, Audit und Gerätebelege festlegen. Die vorhandenen Retention-Einstellungen sind noch kein universeller automatischer Löschlauf.
5. Bestehende und neue Dependencies einschließlich ihrer Datenschutzmanifeste bei jedem Release prüfen. Zertifikate, private Keys und Service-Accounts ausschließlich in CI-/Server-Secretverwaltung speichern.

Referenzen: [Supabase Sign-out und Token-Lebensdauer](https://supabase.com/docs/guides/auth/signout), [APNs Provider-Authentifizierung](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [FCM Fehlercodes](https://firebase.google.com/docs/cloud-messaging/error-codes). Abruf: 17.09.2026.
