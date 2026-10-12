import { Capacitor } from "@capacitor/core";

/** Run before React can focus a control, including the first login field. */
export function initializeNativeViewport() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add("native-app");
  if (Capacitor.getPlatform() !== "ios") return;
  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  if (!viewport) return;
  // WKWebView ignoresViewportScaleLimits permits user pinch zoom while WebKit
  // respects this limit for automatic input focus zoom. Never limit Android or
  // browser zoom: they do not have that separate native accessibility override.
  viewport.content =
    "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
}
