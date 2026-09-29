import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const schemes = new Set(["de.alberring.connect:", "de.alberring.connect.dev:"]);
const uuid = "[0-9a-fA-F-]{36}";
const appRoute = new RegExp(
  `^/app/(?:dashboard|messages(?:/${uuid})?|news(?:/${uuid})?|documents(?:/${uuid})?|schedule|leave|sick-leave|fleet|material-requests|notifications|settings|profile|more)$`,
);

/** Notification data cannot navigate to an arbitrary URL or privileged action. */
export function safeAppPath(value: unknown): string | null {
  return typeof value === "string" && appRoute.test(value) ? value : null;
}
export function parseNativeLink(
  raw: string,
): { code: string | null; path: string } | null {
  try {
    const url = new URL(raw);
    if (
      !schemes.has(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null;
    if (url.hostname === "auth" && url.pathname === "/callback") {
      const next = url.searchParams.get("next");
      const path =
        next === "/reset-password" || next === "/accept-invite"
          ? next
          : "/app/dashboard";
      const code = url.searchParams.get("code");
      if (!code || code.length > 2048 || /\s/.test(code)) return null;
      return { code, path };
    }
    if (url.hostname === "app" && !url.search) {
      const path = safeAppPath(`/app${url.pathname}`);
      return path ? { code: null, path } : null;
    }
  } catch {
    /* Malformed links are ignored without logging credentials. */
  }
  return null;
}
export async function authRedirect(
  path: "/reset-password" | "/accept-invite",
): Promise<string> {
  if (!Capacitor.isNativePlatform()) return `${location.origin}${path}`;
  const { id } = await App.getInfo();
  if (!schemes.has(`${id}:`)) throw new Error("Ungültige App-Kennung.");
  return `${id}://auth/callback?next=${encodeURIComponent(path)}`;
}
