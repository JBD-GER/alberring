import { AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  passwordChangeErrorMessage,
  passwordResetRequestErrorMessage,
} from "./auth-errors";

describe("passwordChangeErrorMessage", () => {
  it("asks for a different password when leaked-password protection rejects it", () => {
    const error = new AuthWeakPasswordError("Password is compromised", 422, [
      "pwned",
    ]);

    expect(passwordChangeErrorMessage(error, "Link ungültig")).toContain(
      "Datenlecks",
    );
  });

  it("keeps the invalid-link message for an expired session", () => {
    expect(
      passwordChangeErrorMessage({ code: "session_expired" }, "Link ungültig"),
    ).toBe("Link ungültig");
  });

  it("does not mistake a temporary network failure for an invalid link", () => {
    expect(
      passwordChangeErrorMessage(new Error("offline"), "Link ungültig"),
    ).toContain("Verbindung");
  });

  it("explains when the previous password is reused", () => {
    expect(
      passwordChangeErrorMessage({ code: "same_password" }, "Link ungültig"),
    ).toContain("anderes Passwort");
  });
});

describe("passwordResetRequestErrorMessage", () => {
  it("identifies mail sending limits separately from connection errors", () => {
    expect(
      passwordResetRequestErrorMessage({ code: "over_email_send_rate_limit" }),
    ).toContain("Versandlimit");
  });

  it("directs restricted recipient and mail service failures to administration", () => {
    for (const error of [
      { code: "email_address_not_authorized" },
      { status: 500, code: "unexpected_failure" },
    ]) {
      expect(passwordResetRequestErrorMessage(error)).toContain(
        "Administration",
      );
    }
  });
});
