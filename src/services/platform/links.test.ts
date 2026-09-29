import { describe, expect, it } from "vitest";
import { parseNativeLink, safeAppPath } from "./links";
describe("native links", () => {
  it("accepts PKCE callback and a bounded return route", () => {
    expect(
      parseNativeLink(
        "de.alberring.connect://auth/callback?code=one-time-code&next=%2Freset-password",
      ),
    ).toEqual({ code: "one-time-code", path: "/reset-password" });
    expect(
      parseNativeLink("de.alberring.connect.dev://app/notifications"),
    ).toEqual({ code: null, path: "/app/notifications" });
  });
  it.each([
    "https://attacker.example/auth/callback?code=secret",
    "de.alberring.connect://evil/callback?code=a",
    "de.alberring.connect://auth/callback#access_token=secret",
    "de.alberring.connect://user@auth/callback?code=a",
    "de.alberring.connect://auth/callback",
    "de.alberring.connect://app/admin/users",
    "de.alberring.connect://app/messages?redirect=https://attacker.example",
  ])("rejects untrusted link %s", (url) =>
    expect(parseNativeLink(url)).toBeNull(),
  );
  it("does not accept open redirects or query-driven actions from notifications", () => {
    for (const path of [
      "//evil.example",
      "javascript:alert(1)",
      "/app/../admin",
      "/app/messages?delete=1",
      "/app/admin/users",
    ])
      expect(safeAppPath(path)).toBeNull();
    expect(
      safeAppPath("/app/messages/7e6d6b3c-b461-4e0b-a4b2-1059b4b8210d"),
    ).toBeTruthy();
  });
});
