# 07 · Technische Datenschutz- und Store-Grundlage

Stand: 17.09.2026. Diese Unterlage beschreibt tatsächlich vorhandene Datenflüsse und technische Maßnahmen. Sie ist die Arbeitsgrundlage für Betreiber, Datenschutzverantwortliche und Store-Verantwortliche, keine rechtlich verbindliche Datenschutzerklärung. Rechtsgrundlagen, Beschäftigtendatenschutz, Auftragsverarbeitung, Fristen und Store-Antworten müssen anhand des tatsächlichen Betriebs festgelegt werden.

## Daten und Zwecke

| Datenart                                                             | Zweck und Auslöser                                                             | Übertragung / Ablage                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Dienstliche E-Mail, Name, Profil-ID                                  | Einladung, Anmeldung, internes Verzeichnis, Rechte                             | Supabase Auth und profilspezifische Datenbanktabellen                                                                       |
| Sitzungs- und Refresh-Token                                          | Anmeldung wiederherstellen, berechtigte API-Anfragen                           | Native Keychain bzw. Keystore-verschlüsselter Storage; im Web bestehender SDK-Storage; Übertragung an Supabase              |
| Rollen, Team-/Organisationszuordnung                                 | Mandantenisolation, fachliche Berechtigungen                                   | Supabase; sensible Felder/Änderungen über RLS und RPCs                                                                      |
| Mitarbeiter-/Dienstplandaten                                         | Personalverwaltung, Einsätze, Urlaub, Fuhrpark, Material                       | Bereits vorhandene fachliche Supabase-Tabellen                                                                              |
| Krankmeldungen und Nachweise                                         | Bestehende Krankmeldeabläufe                                                   | Rollenbeschränkte Datenbank und private Dateiablage; besonders schutzbedürftige Inhalte                                     |
| Chattexte und Empfänger-/Mitgliedschaftsdaten                        | Dienstliche Kommunikation nach aktivem Senden                                  | Nachrichten und Konversationsmetadaten in Supabase                                                                          |
| Einmaliger Standort                                                  | Nutzer wählt Standort teilen und bestätigt den Versand                         | Zunächst nur in der Anzeige; nach ausdrücklichem Senden Koordinaten, Messgenauigkeit und Zeitpunkt als Chattext in Supabase |
| Fotos / ausgewählte Dateien                                          | Kameraaufnahme, Photo Picker oder Datei-Upload mit anschließender Nutzeraktion | Private Storage-Buckets, Dateimetadaten in Datenbank; Zugriffsregeln des jeweiligen Fachbereichs                            |
| Audio                                                                | Explizit gestartete Sprachnachricht, maximal zwei Minuten                      | Vor Versand lokal/temporär; nach bestätigtem Versand privater Chat-Anhang in Supabase                                       |
| Installations-ID, Push-Token, Plattform, App-Version, Sessionbindung | Optionaler Push nach Einwilligung im Betriebssystem und Auswahl von Kategorien | Geschütztes user_devices-Register, Tokens nur serverseitig abrufbar; Token an APNs oder FCM für Zustellung                  |
| Versand-/Auditinformationen                                          | Wiederholungen, Zugriffsnachweise, Administration                              | Bestehende Audit-/Notificationtabellen und neue service-only Versandbelege                                                  |
| Technische Verbindungsdaten                                          | HTTPS, Auth, Dateitransfer und Betriebsdiagnose                                | Infrastruktur von Supabase/Vercel sowie später Apple/Google; konkrete Logfristen außerhalb des Quellcodes zu prüfen         |

Es wurde kein Werbe-, Tracking-, Crash-Analytics- oder Verhaltensanalyse-SDK hinzugefügt. Vorhandene Infrastruktur kann technische Betriebslogs führen; „kein Analytics-SDK“ bedeutet nicht „keinerlei Protokollierung“.

## Standort: bewusste Freigabe während der Nutzung

Der neue Adapter fragt eine Position bei aktiver Nutzeraktion ab; es gibt keinen Hintergrunddienst, kein kontinuierliches Tracking, keine Standort-Historie und keinen Geofence. Die präzise Ortung wird angefragt, eine vom Betriebssystem gewährte ungefähre Position wird mit Genauigkeit berücksichtigt. Die Geräteposition wird nicht allein durch die Permission-Anfrage oder das Öffnen der Einstellungen an das Backend übertragen.

In der Konversation wird eine Vorschau angezeigt. Erst der bestätigte Versand schreibt einen normalen Nachrichtentext mit Koordinaten, Genauigkeit und Zeitstempel. Danach gelten dieselben Mitgliedschafts-, Speicher- und Löschregeln wie für die Konversation. Teilnehmer können sichtbare Inhalte außerhalb der App weitergeben; die technische Zugriffskontrolle verhindert keine Bildschirmaufnahme durch berechtigte Empfänger.

Es wurde kein fachlich belegter Bedarf an Hintergrundstandort gefunden. Eine spätere Einführung wäre eine gesonderte Änderung mit neuer Zweckprüfung, Aufklärung, Permissions, Datenschutzbewertung und Store-Bewertung. Android unterscheidet ausdrücklich zwischen ungefährem/präzisem und Vordergrund-/Hintergrundzugriff: [Android Standortberechtigungen](https://developer.android.com/develop/sensors-and-location/location/permissions).

## Kamera, Fotos und Audio

Die neue Fotoauswahl verwendet den nativen Systempicker und fordert keinen pauschalen Zugriff auf die gesamte Mediathek. Kameraaufnahme und Auswahl werden erst nach einer konkreten Nutzeraktion angeboten. Androids Photo Picker stellt Zugriff auf ausgewählte Medien bereit: [Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker).

Die neue Fotoaufbereitung akzeptiert begrenzte Ausgangsgrößen, skaliert auf maximal 2048 Pixel an der längsten Seite und kodiert JPEG-Pixel neu. Dadurch werden EXIF, eingebettete GPS-Daten und ursprüngliche Kameradateinamen aus diesem Fotoverarbeitungspfad entfernt. Dieses Verhalten ist kein Versprechen, Metadaten aus sämtlichen bestehenden Datei-/PDF-Uploads zu entfernen; dort werden bewusst gewählte Originaldateien weiterhin nach den vorhandenen Regeln verarbeitet.

Audio startet ausschließlich nach aktiver Aufnahmeaktion. Es gibt Start, Stop, Verwerfen, Fehlerzustände und eine Begrenzung auf zwei Minuten. Beim Verlassen der Ansicht bzw. Hintergrundwechsel wird die Aufnahme abgebrochen. Native temporäre Aufnahmen werden nach dem Einlesen gelöscht; Audio wird erst nach dem Versand als privater Chat-Anhang hochgeladen. WebM/MP4/AAC/OGG sind im Chat mit maximal 10 MiB zugelassen. Keine automatische Transkription, keine Übertragung an KI-/Sprachdienste und kein Mithören im Hintergrund wurden implementiert.

## Berechtigungsinventar

| Berechtigung / Zugriff                                                                         | Zweck                                            | Zeitpunkt / Begrenzung                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| iOS NSLocationWhenInUseUsageDescription; Android ACCESS_COARSE_LOCATION / ACCESS_FINE_LOCATION | Einmalige Standortfreigabe                       | Im Standortdialog; kein Background Location                             |
| iOS NSCameraUsageDescription; Android CAMERA                                                   | Foto unmittelbar aufnehmen                       | Beim Kamera-Button                                                      |
| Nativer Photo Picker                                                                           | Einzelnes vorhandenes Foto auswählen             | Auswahl durch Nutzer; kein automatisches Durchsuchen der Mediathek      |
| iOS NSMicrophoneUsageDescription; Android RECORD_AUDIO                                         | Sprachnachricht aufnehmen                        | Beim Start; sichtbar, begrenzt, abbrechbar                              |
| APNs-Benachrichtigungsfreigabe; Android POST_NOTIFICATIONS                                     | Optionale Benachrichtigungen                     | Erst beim expliziten Aktivieren; Kategorien und Systemfreigabe getrennt |
| Netzwerkzugriff                                                                                | Gemeinsames Supabase-Backend                     | HTTPS in nativen Produktionsbuilds                                      |
| App-Einstellungen öffnen                                                                       | Abgelehnte/eingeschränkte Freigabe selbst ändern | Nur nach Nutzeraktion                                                   |

Zusätzliche native Deklarationen: `NSLocationAlwaysAndWhenInUseUsageDescription` ist wegen des eingebundenen Geolocation-SDKs zusätzlich zum WhenInUse-Text deklariert. Der implementierte Adapter fragt ausschließlich den Standort während der Nutzung an, keinen Always-Zugriff; Hintergrundortungsmodi bleiben aus. `NSPhotoLibraryUsageDescription` und `NSPhotoLibraryAddUsageDescription` stehen für die Kamera-SDK-Integration in der iOS-Konfiguration. Die implementierten Aktionen nutzen den Systempicker und `saveToGallery: false`; sie fordern keine pauschale Mediathek- oder Schreibfreigabe an. Das zusammengeführte Android-Manifest enthält außerdem die normalen FCM-Rechte `WAKE_LOCK` und `com.google.android.c2dm.permission.RECEIVE`. Diese Transportrechte erzeugen keinen zusätzlichen Benutzer-Permissiondialog und erlauben keine Hintergrundortung.

Die UI unterscheidet nicht bestimmt, gewährt, abgelehnt, eingeschränkt und dauerhaft abgelehnt, soweit die Plattform dies erkennen lässt. Keine Sammelanfrage aller Permissions beim ersten Start. Verweigerte Freigaben dürfen die übrige App weiter nutzbar lassen.

## Push und beteiligte Dienste

| Dienst                                       | Rolle in dieser Umsetzung                                                                   | Zu prüfende Betreiberangaben                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Supabase                                     | Gemeinsame Authentifizierung, Datenbank, private Storage-Buckets, Edge Functions, Scheduler | Projektregion, Verträge, Subprozessoren, Zugriffsrollen, Backup-/Logfristen, SMTP     |
| Vercel                                       | Hosting der bestehenden Web-App                                                             | Hostingregionen, technische Logs, Domain, Verträge                                    |
| Apple APNs                                   | iOS-Pushtransport nach späterer Einrichtung                                                 | Betreiber-Team, Schlüssel, Bundle-ID, Privacy-Angaben                                 |
| Google Firebase Cloud Messaging              | Android-Pushtransport nach späterer Einrichtung                                             | Firebase-Projekt, Service Account, Android-Clientkonfiguration, SDK-Datenverarbeitung |
| Supabase Auth / konfigurierter SMTP-Anbieter | Verifikation, Einladung, Passwort-Reset                                                     | Tatsächlicher produktiver E-Mail-Anbieter und Versandaufbewahrung                     |
| Careville                                    | Vorhandener Integrationsbereich, weiterhin ausdrücklich nicht konfiguriert                  | Erst bei tatsächlicher Anbindung neu bewerten                                         |

Die native Oberfläche wird aus dem App-Paket geladen. APNs und FCM sind Plattform-Pushdienste; sie erfordern keine zusätzliche eigene Hosting-Infrastruktur. Beiden wird ausschließlich ein generischer Hinweis samt begrenztem internen Navigationsziel und Benachrichtigungs-ID übergeben. Namen, Nachrichteninhalt, Krankheitsdaten, Foto-/Audioinhalt und Koordinaten werden nicht als Push-Vorschau versendet. Der eigentliche Inhalt wird erst nach autorisiertem Öffnen aus Supabase geladen.

Push ist im ausgelieferten Konfigurationsstandard deaktiviert (`VITE_PUSH_ENABLED` ist nicht `true`); dadurch wird vor der Betreiber-Einrichtung kein nativer Push-Permission-Dialog angefordert. Push-Credentials fehlen aktuell. Der Serverpfad ist vorbereitet und mit Protokolltests geprüft; tatsächliche Zustellung wurde ohne Betreiberzugänge nicht behauptet. Ob die spätere SDK-/Projektkonfiguration zusätzliche technische Daten erfasst, muss vor Store-Abgabe an den konkret eingebundenen Versionen kontrolliert werden.

## Lokale Speicherung, Transport und Aufbewahrung

Native Auth-Geheimnisse und Installationskennung werden über den sicheren Plattformadapter gespeichert. Berechtigungsdialog-Marker enthalten nur den bisherigen Abfragestatus. Web-Sessions behalten das vorhandene Browsermodell; React Query hält geladene Daten im Speicher und wird bei Abmeldung/Identitätswechsel bereinigt. Der PWA-Service-Worker betrifft die Web-Variante; native Builds enthalten keine Registrierung dieses Workers. Die vollständige Offline-Nutzung vertraulicher Fachdaten wurde nicht eingeführt.

HTTPS schützt produktive Verbindungen. RLS, Minimalprivilegien und private Buckets begrenzen den serverseitigen Zugriff. Verschlüsselung der Infrastruktur, Speicherregion, Backupaufbewahrung und administrative Zugriffe müssen vom Betreiber anhand des verwendeten Supabase-/Vercel-Tarifs geprüft werden; diese Dokumentation erfindet dazu keine Kontoeinstellungen.

Gerätewiderruf entfernt den Roh-Push-Token. Die 60-Tage-Frist beim Geräteversand schließt alte Registrierungen aus, löscht aber nicht automatisch Register- oder Versandbelegzeilen. Die Datenbank bewahrt gelöschte Mitarbeiterprofile teilweise als fachliche Referenz auf. Das ist von Löschung der Auth-Identität und fachlicher Datenvernichtung zu unterscheiden. Für Chat-/Standorttexte, Audio, Bilder, Gesundheitsnachweise, Personalunterlagen, Audits, Gerätebelege und Backups sind konkrete Lösch-/Aufbewahrungsregeln festzulegen. Eine beliebige globale Frist wurde nicht erfunden oder auf bestehende Geschäftsdaten angewandt.

## Grundlage für App Store Connect

Vor Abgabe sind mindestens Kontaktinformationen, Benutzerkennungen, Nachrichten/Benutzerinhalte, Fotos, Audio und optional übermittelter präziser/ungefährer Standort zu bewerten. Krankmeldungen und Nachweise können Gesundheitsdaten umfassen. Die Daten sind überwiegend einem betrieblichen Konto zugeordnet und dienen der App-Funktionalität. Die reine Freiwilligkeit einzelner Uploads hebt eine mögliche Deklarationspflicht nicht automatisch auf.

Die endgültigen Angaben müssen auch die eingebundenen Drittanbieter berücksichtigen; siehe [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/). Zu ergänzen sind eine tatsächlich betriebene Datenschutz-URL, Kontaktmöglichkeit, reale Aufbewahrungs-/Löschprozesse und die Prüfung der Privacy Manifests/Required Reason APIs des fertig signierten Builds. Eine Tracking-Freigabe wurde nicht eingeführt, da in der implementierten Anwendung kein Werbetracking vorgesehen ist.

## Grundlage für Google Play Data Safety

Die gleichen tatsächlichen Datenflüsse sind im Data-Safety-Formular konsistent zu erklären: erhobene Datentypen, Zwecke, obligatorisch/optional, kontoabhängige Verarbeitung, Übertragungssicherheit, Zugriff und Löschung. Die begriffliche Unterscheidung zwischen Verarbeitung durch Dienstleister und Weitergabe ist anhand der konkreten Verträge und Google-Definitionen zu beantworten. Siehe [Google Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469).

Vor Veröffentlichung benötigt der Betreiber die endgültige Datenschutz-URL, korrekte Angaben zu Standort, Mikrofon, Fotos, Benachrichtigungen und Gesundheits-/Personaldaten, Prüfung der SDK-Offenlegungen und einen nachvollziehbaren Lösch-/Supportweg. Die interne Benutzeranlage erfolgt administriert; ein selbstbedienter öffentlicher Registrierungsprozess wurde nicht eingeführt. Anforderungen zur Kontolöschung sind anhand des tatsächlichen Store-Vertriebsmodells zu prüfen.

## Nachweisgrenzen

Die Browseraufnahmen und Testdaten entstehen in einer isolierten lokalen Prüf-Organisation mit deutlich bezeichneten Prüfprofilen. Sie enthalten keine absichtlich eingebrachten Kundendaten und keine Zugangsdaten. Gerätespezifische Privacy-/Permission-Dialoge, echte APNs-/FCM-Zustellung und das Verhalten signierter Store-Builds müssen auf realen Geräten mit Betreiberkonten geprüft werden. Die hier beschriebene technische Umsetzung ersetzt diese späteren Abnahmen nicht.

## Native Wiederinstallation und Sicherung

iOS-Keychain-Einträge sind gerätegebunden und nicht synchronisierbar, können aber unter üblichen iOS-Bedingungen eine Deinstallation überleben. Es ist kein automatischer Reinstall-Löschmarker implementiert; Logout entfernt die Sitzung ausdrücklich. Android schließt Backup und Gerätetransfer der verschlüsselten Sitzungsdaten aus. Dieses Verhalten muss mit der betrieblichen Geräte-/Abmelderichtlinie und realen Wiederinstallationstests abgeglichen werden.
