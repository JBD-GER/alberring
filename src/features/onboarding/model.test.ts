import { describe, expect, it } from "vitest";
import {
  activeInvites,
  normalizeTeamNames,
  parseNumberList,
  prioritizeTeamNames,
  validateInvites,
  type InviteRole,
  type PlannedInvite,
} from "./model";

const roles: InviteRole[] = [
  { id: "employee-role", name: "Mitarbeiter", systemKey: "employee" },
];
const invite = (overrides: Partial<PlannedInvite> = {}): PlannedInvite => ({
  id: "invite-1",
  firstName: "Erika",
  lastName: "Muster",
  email: "erika@example.test",
  roleId: "employee-role",
  teamName: "Pflege",
  ...overrides,
});

describe("Onboarding-Modell", () => {
  it("normalisiert eindeutige Teams", () => {
    expect(normalizeTeamNames([" Pflege ", "Verwaltung"])).toEqual([
      "Pflege",
      "Verwaltung",
    ]);
    expect(() => normalizeTeamNames(["Pflege", "pflege"])).toThrow(
      "nur einmal",
    );
  });

  it("behält das bisherige Primärteam an erster Stelle", () => {
    expect(
      prioritizeTeamNames(
        ["Standort Münster", "Team Nord", "Team Süd"],
        "team süd",
      ),
    ).toEqual(["Team Süd", "Standort Münster", "Team Nord"]);
  });

  it("validiert und dedupliziert Erinnerungslisten", () => {
    expect(parseNumberList("25, 28, 25", 1, 31)).toEqual([25, 28]);
    expect(() => parseNumberList("0", 1, 31)).toThrow("zwischen 1 und 31");
  });

  it("ignoriert vollständig leere Einladungszeilen", () => {
    expect(
      activeInvites([invite({ firstName: "", lastName: "", email: "" })]),
    ).toEqual([]);
  });

  it("akzeptiert nur vollständige, eindeutige Einladungen", () => {
    expect(validateInvites([invite()], roles, ["Pflege"])[0]).toMatchObject({
      email: "erika@example.test",
      teamName: "Pflege",
    });
    expect(() =>
      validateInvites(
        [invite(), invite({ id: "invite-2", email: "ERIKA@example.test" })],
        roles,
        ["Pflege"],
      ),
    ).toThrow("nur einmal eingeladen");
    expect(() =>
      validateInvites([invite({ roleId: "unknown" })], roles, ["Pflege"]),
    ).toThrow("gültige Rolle");
    expect(() =>
      validateInvites([invite({ firstName: "" })], roles, ["Pflege"]),
    ).toThrow("Vorname, Nachname");
    expect(() =>
      validateInvites([invite({ email: "keine-adresse" })], roles, ["Pflege"]),
    ).toThrow("gültige E-Mail-Adresse");
    expect(() =>
      validateInvites([invite({ teamName: "Unbekannt" })], roles, ["Pflege"]),
    ).toThrow("vorhandenes Team");
  });
});
