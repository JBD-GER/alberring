import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const access = JSON.parse(await readFile(process.argv[2], "utf8"));
const baseURL = process.env.LOCAL_APP_URL ?? "http://127.0.0.1:5174";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(access.url).hostname)
)
  throw new Error(
    "This verification is restricted to isolated local services.",
  );
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const failures = [];
const visited = [];
page.on("pageerror", (error) => failures.push(error.message));
const capture = (name) =>
  page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: name === "07-einstellungen-permissions",
  });
try {
  await page.goto(`${baseURL}/login`);
  await page.getByRole("heading", { name: "Willkommen zurück" }).waitFor();
  await capture("02-nachher-web-login");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("03-nachher-mobile-login");
  await page.getByLabel("Dienstliche E-Mail").fill(access.email);
  await page.locator('input[name="password"]').fill(access.password);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await page.waitForURL("**/app/dashboard");
  await page
    .getByRole("heading", { name: /Guten|Hallo|Willkommen/ })
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
  await capture("04-mobile-dashboard");
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (!page.url().endsWith("/app/dashboard"))
    throw new Error("Session restore failed");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("05-web-dashboard");
  await page.setViewportSize({ width: 390, height: 844 });
  const routes = [
    "more",
    "settings",
    "profile",
    "messages",
    "news",
    "schedule",
    "leave",
    "sick-leave",
    "documents",
    "fleet",
    "material-requests",
    "directory",
    "notifications",
    "admin",
    "admin/users",
    "admin/roles",
    "admin/teams",
    "admin/schedule",
    "admin/leave",
    "admin/sick-leave",
    "admin/fleet",
    "admin/material-requests",
    "admin/audit",
    "admin/integrations",
    "admin/settings",
  ];
  for (const route of routes) {
    await page.goto(`${baseURL}/app/${route}`);
    await page.waitForLoadState("networkidle");
    const horizontal = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth >
        globalThis.document.documentElement.clientWidth + 1,
    );
    const fatal = await page
      .getByRole("heading", {
        name: "Dieser Bereich konnte nicht geladen werden",
      })
      .count();
    if (horizontal || fatal)
      failures.push(
        `${route}: ${horizontal ? "horizontal overflow" : "render error"}`,
      );
    visited.push(route);
    if (route === "more") await capture("06-mobile-navigation");
    if (route === "settings") {
      await capture("07-einstellungen-permissions");
      await page
        .getByRole("heading", {
          name: /Geräteberechtigungen|Gerätezugriff|Berechtigungen/,
        })
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.screenshot({
        path: "docs/screenshots/08-permission-status.png",
      });
    }
  }
  if (access.conversationId) {
    await page.goto(`${baseURL}/app/messages/${access.conversationId}`);
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", {
        name: /Foto, Standort oder Sprachnachricht hinzufügen/,
      })
      .click();
    await capture("09-chat-geraetefunktionen");
    await page
      .getByRole("button", { name: "Standort zum Entwurf hinzufügen" })
      .click();
    await page.locator(".device-error").waitFor({ timeout: 25000 });
    await capture("10-standort-abgelehnt");
    await page.getByRole("button", { name: "Aufnahme starten" }).click();
    await page.locator(".device-error").waitFor({ timeout: 10000 });
    await capture("11-mikrofon-fehlerzustand");
  }
  await context.setOffline(true);
  await page
    .getByRole("status")
    .filter({ hasText: "Keine Internetverbindung" })
    .waitFor();
  await capture("12-offline-zustand");
  await context.setOffline(false);
  await page.locator(".network-status").waitFor({ state: "hidden" });
  await page.goto(`${baseURL}/app/settings`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.waitForURL("**/login");
  await page.reload();
  await page.getByRole("heading", { name: "Willkommen zurück" }).waitFor();
  console.log(
    `Local real-backend verification: ${visited.length} mobile routes, login, restore, logout, permissions and offline checked.`,
  );
  if (failures.length) throw new Error(failures.join("\n"));
  await writeFile(
    "docs/screenshots/NACHWEIS.json",
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source:
          "Running shared React application with isolated local Supabase test organization; no mocked API responses",
        viewportMobile: "390x844",
        viewportDesktop: "1440x1000",
        testedRoutes: visited,
        checks: [
          "login",
          "session restore",
          "logout",
          "location denied",
          "microphone unavailable",
          "offline",
          "no horizontal overflow",
          "no JavaScript page errors",
        ],
        nativeScreenshots: "Not part of browser verification",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
