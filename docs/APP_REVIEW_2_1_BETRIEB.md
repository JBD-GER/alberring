# Bearbeitung von Meldungen und Kontolöschanträgen

Die neuen Funktionen gelten organisationsbezogen. Nur ein aktiver Super Admin sieht die Verwaltungslisten unter **Einstellungen**. Neu eingegangene Anträge und Inhaltsmeldungen erzeugen eine interne Benachrichtigung. E-Mail-Zustellung hängt von den eingerichteten Benachrichtigungspräferenzen ab und wird durch diese Änderung nicht pauschal zugesichert.

## Inhaltsmeldungen

Die Administration prüft eingehende Meldungen zeitnah. Sie sieht ausschließlich den gemeldeten Nachrichtentext, den Meldegrund und während einer offenen Prüfung die Anhänge genau dieser Nachricht. Der Zugriff auf weitere private Nachrichten bleibt gesperrt. Das Ergebnis wird dokumentiert; die betroffene Nachricht kann entfernt werden. Bei wiederholten Verstößen kann das gemeldete Konto über die Benutzerverwaltung gesperrt werden. Die meldende Person bekommt eine interne Abschlussbenachrichtigung.

Blockierungen blenden Nachrichten des blockierten Absenders auch in Gruppen aus; neue Direktnachrichten werden in beiden Richtungen abgewiesen. Neue Gruppenbenachrichtigungen dieses Absenders werden nicht mehr an die blockierende Person erzeugt. Bereits zugestellte Benachrichtigungen und bereits heruntergeladene Dateien werden nicht nachträglich vom Gerät entfernt. Signierte Dateilinks laufen entsprechend der bestehenden Download-Konfiguration ab.

Die serverseitige Textprüfung erfasst eine begrenzte Liste eindeutiger verbotener Formulierungen. Sie ist keine umfassende semantische Erkennung und klassifiziert keine Bilder oder Audioaufnahmen. Meldungen und die menschliche Moderation bleiben erforderlich.

## Kontolöschung: verbindlich innerhalb von 7 Tagen

Die Frist wurde vom Auftraggeber am 4. Oktober 2026 bestätigt. Die Administration muss die Liste regelmäßig prüfen. Der Antrag selbst erfolgt vollständig in der App und benötigt keine zusätzliche Kontaktaufnahme.

1. Den Antrag und die dort gespeicherte Bestätigungsadresse prüfen. Das Fälligkeitsdatum ergibt sich aus dem Eingang plus sieben Tagen.
2. Personenbezogene Daten des Kontos ermitteln: Profil und Personalangaben, Chatnachrichten und Bearbeitungshistorie, Anhänge und Speicherobjekte, Dokumente, Abwesenheiten, Planungen, Material-/Fuhrparkdaten sowie Protokolle. Reine App-Kontosperrung erfüllt den Antrag nicht.
3. Vorhandene gesetzliche Aufbewahrungspflichten konkret prüfen. Nicht mehr erforderliche Daten löschen bzw. irreversibel anonymisieren. Erforderlich aufzubewahrende Daten auf das nötige Maß beschränken, Zugriffe einschränken und Rechtsgrund sowie Frist dokumentieren. Technische Datenerasure muss gegebenenfalls durch die autorisierte Backend-Administration erfolgen; die App stellt keine automatische pauschale Löschung aller Betriebsdaten bereit.
4. Den Kontozugang über die bestehende Benutzerverwaltung löschen. Die bisherige Zugangslöschung erhält betriebliche Verweise und ist deshalb nur ein Teil des vollständigen Vorgangs. Die Löschung des letzten Super Admins erfordert vorher eine berechtigte Nachfolge.
5. Eine Abschlussbestätigung an die im Antrag genannte E-Mail-Adresse senden. Etwaige gesetzlich aufzubewahrende Daten und ihre Fristen erläutern. Der Versand erfolgt durch die Administration; die App versendet diese Bestätigung nicht automatisch.
6. Erst nach tatsächlicher Datenbearbeitung und Versand in der App den Abschlussvermerk und die Versandbestätigung speichern. Der Server verweigert diesen Schritt, solange der Profilzugang noch besteht oder Angaben fehlen. Eine Checkbox ersetzt keine tatsächlich durchgeführte Datenlöschung.

Löschantragsnachweise enthalten personenbezogene Angaben. Auch diese Nachweise, gemeldete Textkopien, Moderationsvermerke und Backups gehören in das Aufbewahrungs- und Löschkonzept und dürfen nicht unbegrenzt für andere Zwecke weitergenutzt werden.

## Testorganisation

Die Apple-Zugänge greifen nur auf `Alberring – Apple-Prüfung (Testdaten)` zu. Das separate Konto `apple-review-deletion@alberring.de` ist für die spätere physische Aufnahme des Löschantrags vorgesehen. Der Reviewer-Hauptzugang, Verwaltungszugang und Teamleitungszugang müssen während der Prüfung funktionsfähig bleiben.
