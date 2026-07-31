import { describe, expect, it } from "vitest";
import {
  calculateWeekdays,
  mileagePlausibility,
  shiftsOverlap,
  shouldDeliverNotification,
} from "./domain";
describe("Fachlogik", () => {
  it("berechnet Arbeitstage ohne Wochenende und Feiertag", () =>
    expect(
      calculateWeekdays("2026-07-06", "2026-07-10", 1, ["2026-07-08"]),
    ).toBe(4));
  it("berechnet halbe Tage", () =>
    expect(calculateWeekdays("2026-07-06", "2026-07-06", 0.5)).toBe(0.5));
  it("erkennt überlappende Schichten", () =>
    expect(
      shiftsOverlap(
        { startsAt: "2026-07-10T07:00:00Z", endsAt: "2026-07-10T14:00:00Z" },
        { startsAt: "2026-07-10T13:30:00Z", endsAt: "2026-07-10T20:00:00Z" },
      ),
    ).toBe(true));
  it("erkennt direkt anschließende Schichten nicht als Überlappung", () =>
    expect(
      shiftsOverlap(
        { startsAt: "2026-07-10T07:00:00Z", endsAt: "2026-07-10T14:00:00Z" },
        { startsAt: "2026-07-10T14:00:00Z", endsAt: "2026-07-10T20:00:00Z" },
      ),
    ).toBe(false));
  it("respektiert über Mitternacht laufende Ruhezeiten", () => {
    expect(
      shouldDeliverNotification(
        { enabled: true, quietStart: "22:00", quietEnd: "06:00" },
        "23:30",
      ),
    ).toBe(false);
    expect(
      shouldDeliverNotification(
        { enabled: true, quietStart: "22:00", quietEnd: "06:00" },
        "08:00",
      ),
    ).toBe(true);
  });
  it("blockiert rückläufige und markiert extreme Kilometerstände", () => {
    expect(mileagePlausibility(42000, 41999).valid).toBe(false);
    expect(mileagePlausibility(42000, 53000).extreme).toBe(true);
  });
});
