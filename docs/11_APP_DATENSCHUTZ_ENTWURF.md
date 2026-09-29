# Datenschutzhinweise zur Alberring-Mitarbeiter-App

**Arbeitsentwurf vom 29.09.2026 – vor Veröffentlichung die markierten Betreiberangaben vervollständigen.** Die bestehende Unternehmensseite unter https://www.alberring.de/datenschutz/ beschreibt die Website. Dieser Text ergänzt die spezifischen Datenflüsse der Mitarbeiter-App; er bestätigt keine noch ungeprüften Verträge oder Löschfristen.

## Verantwortlicher und Kontakt

Alberring – Ambulante Pflege GmbH & Co. KG, Werkstraße 4, 28844 Weyhe, Deutschland. Telefon: 04203 8048429. E-Mail für Datenschutzanfragen: info@alberring.de. Diese Angaben stammen aus der vom Betreiber benannten [Unternehmens-Datenschutzerklärung](https://www.alberring.de/datenschutz/).

## Zweck und Zugang

Die App unterstützt ausschließlich die interne Zusammenarbeit berechtigter Mitarbeitender. Einladungen und Zugriffsrechte werden durch die zuständige Verwaltung vergeben. Der Installationslink allein gewährt keinen Zugang zu betrieblichen Inhalten. Die App dient der Kommunikation und Organisation, nicht der Patientendokumentation oder medizinischen Beratung.

## Verarbeitete Daten

Je nach Rolle und genutzter Funktion verarbeitet die App Namen, dienstliche Kontaktdaten, Benutzerkennungen, Rollen und Teamzuordnungen; Dienstplan-, Urlaubs- und weitere Mitarbeiterdaten; Krankmeldungen und gegebenenfalls Nachweise; Nachrichten, ausgewählte Fotos, Dateien und Sprachnachrichten sowie Fuhrpark- und Materialmeldungen. Krankheitsnachweise können Gesundheitsdaten enthalten.

Kamera, Mikrofon und Standort werden im Zusammenhang mit der jeweils gewählten Funktion angefragt. Sprachnachrichten werden aktiv aufgenommen und nach dem Senden übertragen. Standortfreigaben erfolgen einzeln und werden erst nach bestätigtem Versand Bestandteil einer Nachricht. Es gibt im geprüften Quellstand keine Hintergrundortung. Die Verweigerung optionaler Geräteberechtigungen beschränkt die zugehörige Funktion.

Zur Anmeldung werden Sitzungsinformationen auf dem Gerät gespeichert. Technische Verbindungs-, Sicherheits- und Betriebsdaten entstehen beim Zugriff auf die Dienste. Fachliche Aktionen können Zugriffs- und Verwaltungsprotokolle erzeugen. Im geprüften App-Quellstand ist kein Werbetracking implementiert.

## Dienstleister und Zugriffe

**Supabase** stellt Anmeldung, Datenbank, Dateiablage und serverseitige Funktionen bereit. Das am 29.09.2026 geprüfte Projekt „AlberringConnect“ ist in `eu-central-1` (Frankfurt) angelegt. Die Projektregion belegt nicht, dass sämtliche Support-, Verwaltungs-, Protokoll- oder Unterauftragnehmerverarbeitungen ausschließlich dort stattfinden.

**Vercel** hostet die Web-App und verarbeitet technische Daten bei deren Abruf. Die native iOS-Oberfläche liegt im installierten App-Paket; betriebliche Daten werden über die konfigurierten Backend-Dienste geladen. Aus dem Hosting der Web-App folgt nicht, dass sämtliche App-Inhalte bei Vercel gespeichert werden.

Nachrichten und Fachinhalte sind für die jeweils berechtigten Empfänger und betrieblichen Rollen verfügbar. Einladungs- und Rücksetz-E-Mails werden über Supabase Auth und den konfigurierten E-Mail-Anbieter versendet. **Vor Veröffentlichung bestätigen:** aktuell produktiver E-Mail-Anbieter, Vertragsparteien und Auftragsverarbeitungsverträge, Unterauftragnehmer, weitere Zugriffe sowie gegebenenfalls Übermittlungen außerhalb des EWR und deren Grundlage. Bestehende Vercel- und Supabase-Verträge wurden durch diese technische Prüfung nicht bestätigt.

Native Push-Mitteilungen sind in der aktuell geprüften Build-Konfiguration deaktiviert. Eine spätere Aktivierung über Apple APNs bzw. Google FCM muss in diesen Hinweisen und den Store-Angaben berücksichtigt werden.

## Rechtsgrundlagen und Aufbewahrung – Betreiberangaben offen

**Vor Veröffentlichung ergänzen:** die tatsächlich einschlägigen Rechtsgrundlagen für die Beschäftigtendatenverarbeitung und gesondert für Krankmeldungen/Gesundheitsdaten, einschließlich gegebenenfalls bestehender betrieblicher Regelungen. Betriebssystemberechtigungen ersetzen diese Festlegung nicht.

**Vor Veröffentlichung ergänzen:** konkrete Fristen oder belastbare Kriterien für Mitarbeiterdaten, Chatnachrichten einschließlich Standortangaben, Fotos/Audio/Dateien, Krankheitsnachweise, Protokolle und Backups; außerdem den tatsächlichen Ablauf bei Ausscheiden oder einem Löschersuchen. Im geprüften Datenmodell sind Kontosperrung, Löschung der Anmeldeidentität und Löschung fachlicher Datensätze unterschiedliche Vorgänge. Es wurde keine automatische vollständige Löschung zu einer erfundenen Frist eingerichtet.

## Anliegen und Rechte

Datenschutzanfragen können an den oben genannten Kontakt gerichtet werden. Dazu zählen Auskunft, Berichtigung und – soweit anwendbar – Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Bei Verarbeitung aufgrund einer Einwilligung kann diese für die Zukunft widerrufen werden. Ein Beschwerderecht bei der zuständigen Datenschutzaufsichtsbehörde besteht. Die konkrete Anwendung richtet sich nach dem Verarbeitungsvorgang und gesetzlichen Pflichten.

## Umsetzung für den App-Start

Nach Vervollständigung muss diese App-Ergänzung öffentlich erreichbar auf der Datenschutzseite oder einer eigenen App-Datenschutzseite stehen und aus der App verlinkt werden. Erst dann die endgültige URL und dazu passende Datentypen in App Store Connect hinterlegen. Die bestehende `/privacy`-Route der App enthält derzeit noch einen Platzhalter.

Technische Grundlage: Projektunterlage `docs/07_DATENSCHUTZ_STORE.md`, aktueller App-Quellstand, vom Betreiber bestätigtes Hosting und ausgelesene Supabase-Projektregion. [Apple verlangt Angaben auch zur tatsächlichen Datenverarbeitung durch eingebundene Drittanbieter](https://developer.apple.com/app-store/app-privacy-details/).
