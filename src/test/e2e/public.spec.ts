import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Login ist mobil ohne horizontales Scrollen bedienbar", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sicher anmelden" }),
  ).toBeVisible();
  const benefits = page.locator(".auth-benefits");
  await expect(benefits).toHaveAttribute("role", "list");
  await expect(benefits).toHaveAttribute(
    "aria-label",
    "Vorteile der Mitarbeiter-App",
  );
  await expect(benefits.locator(":scope > [role=listitem]")).toHaveCount(3);
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
test("Passwort-Reset zeigt neutralen Flow", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Passwort zurücksetzen" }),
  ).toBeVisible();
});
test("Einladungsseite akzeptiert keine beliebige Sitzung", async ({ page }) => {
  await page.goto("/accept-invite");
  await expect(
    page.getByRole("heading", { name: "Einladung annehmen" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("ungültig");
});
test("es gibt keine öffentliche Registrierung", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/app\/dashboard|\/login/);
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück" }),
  ).toBeVisible();
});
test("Onboarding ist ohne exklusive Admin-Sitzung nicht erreichbar", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück" }),
  ).toBeVisible();
});
test("Login hat keine automatisiert erkennbaren WCAG-Verstöße", async ({
  page,
}) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
