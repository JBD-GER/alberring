import { describe, expect, it } from "vitest";
import { humanizeError } from "./WorkflowUI";

const fallback = "Die Änderung konnte nicht gespeichert werden.";

describe("humanizeError", () => {
  it.each([
    [
      "self_approval_not_allowed",
      "Eigene Urlaubsanträge muss eine andere berechtigte Person bearbeiten.",
    ],
    [
      "second_approver_required",
      "Sie haben diesen Antrag bereits freigegeben. Für die zweite Freigabe ist eine andere berechtigte Person erforderlich.",
    ],
    [
      "request_not_decidable",
      "Dieser Urlaubsantrag ist nicht mehr offen. Laden Sie die Übersicht neu.",
    ],
    [
      "rejection_reason_required",
      "Bitte geben Sie einen Grund für die Ablehnung an.",
    ],
    [
      "assignee_not_available",
      "Die ausgewählte Person ist nicht mehr für eine Fahrzeugzuweisung verfügbar.",
    ],
    [
      'duplicate key value violates unique constraint "vehicles_organization_id_license_plate_key"',
      "Dieses Kennzeichen ist bereits im Fuhrpark vorhanden.",
    ],
    [
      "mileage_cannot_decrease",
      "Der Kilometerstand darf nicht unter dem zuletzt gemeldeten Wert liegen.",
    ],
    ["permission_denied", "Sie haben für diese Aktion keine Berechtigung."],
  ])("übersetzt Supabase-Fehler %s", (message, expected) => {
    expect(humanizeError({ message, code: "42501" }, fallback)).toBe(expected);
    expect(humanizeError(new Error(message), fallback)).toBe(expected);
  });

  it.each([null, undefined, {}, { message: 42 }, "permission_denied"])(
    "verwendet für ungültige Fehler den vorgesehenen Hinweis: %s",
    (error) => {
      expect(humanizeError(error, fallback)).toBe(fallback);
    },
  );

  it("zeigt unbekannte Datenbankdetails nicht direkt an", () => {
    expect(
      humanizeError(
        { message: "internal database detail", details: "private value" },
        fallback,
      ),
    ).toBe(fallback);
  });
});
