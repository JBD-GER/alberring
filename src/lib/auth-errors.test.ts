import { AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { passwordChangeErrorMessage } from "./auth-errors";

describe("passwordChangeErrorMessage", () => {
  it("asks for a different password when leaked-password protection rejects it", () => {
    const error = new AuthWeakPasswordError("Password is compromised", 422, [
      "pwned",
    ]);

    expect(passwordChangeErrorMessage(error, "Link ungültig")).toContain(
      "Datenlecks",
    );
  });

  it("keeps the invalid-link message for other failures", () => {
    expect(
      passwordChangeErrorMessage(new Error("expired"), "Link ungültig"),
    ).toBe("Link ungültig");
  });
});
