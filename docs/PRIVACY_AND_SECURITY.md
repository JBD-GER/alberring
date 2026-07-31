# Datenschutz und Sicherheit

Verarbeitet werden dienstliche Stammdaten, interne Kommunikation, Schichten, Urlaubs- und Abwesenheitszeiträume, Dokumente, Fahrzeug- und Materialprozesse. Diagnosen, Patientendaten und Pflegedokumentation sind ausgeschlossen. Atteste liegen in einem eigenen privaten Bucket und sind nur für Betroffene und explizit berechtigte HR-Funktionen abrufbar.

Service-Role-Keys bleiben in Edge Functions. Signed URLs sollen kurzlebig sein; Downloads sensibler Dokumente müssen auditiert werden. Pushtexte enthalten standardmäßig keine Inhalte. Auditdatensätze enthalten keine Tokens, Nachrichten- oder Attestinhalte.

Vor Produktivbetrieb muss der Betreiber Lösch- und Aufbewahrungsfristen, Berechtigungsmatrix, Backup-/Restore-Test, AV-Vertrag, TOM, MFA-Pflicht, Incident-Prozess und Auskunfts-/Löschprozesse verbindlich festlegen. Diese technische Umsetzung ist keine Rechtsberatung und darf nicht pauschal als „vollständig DSGVO-konform“ bezeichnet werden.
