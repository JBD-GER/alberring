import { describe, expect, it } from "vitest";
import { storeLinksHtml, validateStoreLinks } from "./mobile-store-links.mjs";

const pending = {
  iosDistribution: "unlisted",
  iosAppStoreUrl: null,
  androidPlayStoreUrl: null,
};

describe("installation links in authentication emails", () => {
  it("does not create dead store buttons before approval", () => {
    const html = storeLinksHtml(pending);
    expect(html).not.toContain("href=");
    expect(html).toContain("iPhone / iPad");
    expect(html).toContain("Android");
  });
  it("allows iOS to be released while Android is pending", () => {
    const html = storeLinksHtml({
      ...pending,
      iosAppStoreUrl: "https://apps.apple.com/de/app/alberring/id1234567890",
    });
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html).toContain("Android</strong>");
    expect(html).not.toContain("ConfirmationURL");
  });
  it("accepts the production Android package", () => {
    expect(() =>
      validateStoreLinks({
        ...pending,
        androidPlayStoreUrl:
          "https://play.google.com/store/apps/details?id=de.alberring.connect",
      }),
    ).not.toThrow();
  });
  it.each([
    "https://apps.apple.com.evil.example/app/id1234567890",
    "https://apps.apple.com/app/id1234567890?token=secret",
    "https://apps.apple.com/app/id1234567890#access_token=secret",
    "https://user:password@apps.apple.com/app/id1234567890",
    "javascript:alert(1)",
    "{{ .Data.install_url }}",
  ])("rejects unsafe Apple links: %s", (iosAppStoreUrl) => {
    expect(() => validateStoreLinks({ ...pending, iosAppStoreUrl })).toThrow();
  });
  it.each([
    "https://play.google.com/store/apps/details?id=another.app",
    "https://play.google.com/store/apps/details?id=de.alberring.connect&token=secret",
  ])(
    "rejects wrong or credential-bearing Android URLs: %s",
    (androidPlayStoreUrl) => {
      expect(() =>
        validateStoreLinks({ ...pending, androidPlayStoreUrl }),
      ).toThrow();
    },
  );
});
