import { describe, expect, it } from "vitest";
import { storeLinksHtml, validateStoreLinks } from "./mobile-store-links.mjs";

const pending = {
  iosDistribution: "unlisted",
  iosAppStoreUrl: null,
  androidPlayStoreUrl: null,
};

describe("installation links in authentication emails", () => {
  it("only links to the authenticated installation portal", () => {
    const html = storeLinksHtml(pending);
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html).toContain('href="https://app.alberring.de/installation"');
    expect(html).toContain("Android");
    expect(html).toContain("iPhone");
    expect(html).not.toContain("ConfirmationURL");
  });
  it("never exposes direct store links even after a store is approved", () => {
    const html = storeLinksHtml({
      ...pending,
      iosAppStoreUrl: "https://apps.apple.com/de/app/alberring/id1234567890",
    });
    expect(html).not.toContain("apps.apple.com");
    expect(html).not.toContain("play.google.com");
    expect(html).not.toContain(".apk");
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
