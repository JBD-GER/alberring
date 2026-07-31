import { describe, expect, it } from "vitest";
import { fileAllowed, mileageSchema, passwordSchema } from "./validation";
describe("Validierung", () => {
  it("verhindert rückläufige Kilometerstände", () =>
    expect(
      mileageSchema.safeParse({ mileage: 999, previous: 1000 }).success,
    ).toBe(false));
  it("akzeptiert starke Passwörter", () =>
    expect(passwordSchema.safeParse("SicheresPasswort2026").success).toBe(
      true,
    ));
  it("weist ausführbare und zu große Anhänge ab", () => {
    expect(
      fileAllowed(
        { type: "application/x-msdownload", size: 1000 },
        ["application/pdf"],
        10,
      ),
    ).toBe(false);
    expect(
      fileAllowed(
        { type: "application/pdf", size: 11 * 1024 * 1024 },
        ["application/pdf"],
        10,
      ),
    ).toBe(false);
  });
});
