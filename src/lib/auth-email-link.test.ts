import { describe, expect, it } from "vitest";
import { parseEmailLinkToken } from "./auth-email-link";

const token = "a".repeat(64);

describe("email link tokens", () => {
  it("accepts query and fragment tokens without consuming them", () => {
    expect(
      parseEmailLinkToken(
        `?token_hash=${token}&type=invite`,
        "",
        "/accept-invite",
      ),
    ).toEqual({ tokenHash: token, type: "invite" });
    expect(
      parseEmailLinkToken(
        "",
        `#token_hash=${token}&type=recovery`,
        "/reset-password",
      ),
    ).toEqual({ tokenHash: token, type: "recovery" });
  });

  it("allows recovery links to finish interrupted invitations", () => {
    expect(
      parseEmailLinkToken(
        `?token_hash=${token}&type=recovery`,
        "",
        "/accept-invite",
      ),
    ).toEqual({ tokenHash: token, type: "recovery" });
  });

  it.each([
    `?token_hash=${token}&type=invite`,
    `?token_hash=${token}&type=signup`,
    `?token_hash=${token}&type=email`,
    `?token_hash=${token}`,
    `?token_hash=${token}&type=recovery&type=invite`,
    `?token_hash=${token}&token_hash=${token}&type=recovery`,
    "?token_hash=&type=recovery",
    "?token_hash=has%20spaces&it=is%2Fa%2Fpath&type=recovery",
    `?token_hash=${token}&type=recovery&code=pkce-code`,
    `?token_hash=${token}&type=recovery&access_token=other-session`,
  ])("rejects incompatible or ambiguous recovery parameters: %s", (search) => {
    expect(parseEmailLinkToken(search, "", "/reset-password")).toBeNull();
  });

  it("rejects tokens duplicated across the query and fragment", () => {
    expect(
      parseEmailLinkToken(
        `?token_hash=${token}&type=recovery`,
        `#token_hash=${token}`,
        "/reset-password",
      ),
    ).toBeNull();
  });

  it.each([
    ["", ""],
    ["?code=old-pkce-code", ""],
    ["", "#access_token=old-session&refresh_token=refresh&type=recovery"],
    ["", "#error=access_denied&error_code=otp_expired"],
  ])("leaves established implicit/PKCE handling unchanged", (search, hash) => {
    expect(
      parseEmailLinkToken(search, hash, "/reset-password"),
    ).toBeUndefined();
  });
});
