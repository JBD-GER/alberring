// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { initializeNativeViewport } from "./viewport";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(), getPlatform: vi.fn() },
}));

const normalViewport =
  "width=device-width, initial-scale=1, viewport-fit=cover";
beforeEach(() => {
  document.documentElement.className = "";
  document.head.innerHTML = `<meta name="viewport" content="${normalViewport}">`;
});

describe("native input viewport", () => {
  it.each(["web", "android", "ios"])(
    "preserves deliberate zoom on %s",
    (platform) => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(platform !== "web");
      vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
      initializeNativeViewport();
      initializeNativeViewport();
      const content = document.querySelector<HTMLMetaElement>(
        'meta[name="viewport"]',
      )!.content;
      expect(document.documentElement.classList.contains("native-app")).toBe(
        platform !== "web",
      );
      expect(content).not.toContain("user-scalable=no");
      if (platform === "ios") {
        expect(content.match(/maximum-scale=1/g)).toHaveLength(1);
      } else {
        expect(content).toBe(normalViewport);
      }
    },
  );
});
