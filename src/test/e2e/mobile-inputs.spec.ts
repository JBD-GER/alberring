import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Exercise the real screens and their CSS cascade with synthetic API data.
// No production session, employee data or write requests are needed.
async function mockEmployee(page: Page) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "mobile-input-test@example.invalid",
    aud: "authenticated",
    role: "authenticated",
  };
  await page.routeWebSocket(/\/realtime\//, (socket) => socket.close());
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: {
        access_token: "synthetic-browser-test-token",
        refresh_token: "synthetic-browser-test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      },
    }),
  );
  const responses: Record<string, unknown> = {
    get_my_profile: {
      ...user,
      display_name: "Alex Beispiel",
      status: "active",
      organization_id: "00000000-0000-4000-8000-000000000002",
    },
    my_permissions: ["messages.use", "leave.create", "leave.view_own"].map(
      (permission_key) => ({ permission_key }),
    ),
    get_my_onboarding_state: { required: false, eligible: false },
    get_my_product_tour_state: { required: false, eligible: false },
  };
  await page.route("**/rest/v1/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({
      json: responses[name] ?? [],
      headers: { "content-range": "0-0/0" },
    });
  });
  await page.goto("/app/messages");
  await page.getByLabel("Dienstliche E-Mail").fill(user.email);
  await page.getByLabel("Passwort", { exact: true }).fill("SyntheticTest123!");
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await page.waitForURL(/\/app\//);
  await page.locator('a[href="/app/messages"]:visible').click();
  await expect(page.getByRole("button", { name: "Neue Gruppe" })).toBeVisible();
}

async function expectReadableControls(page: Page) {
  const controls = page.locator(
    "input:visible:not([type=checkbox]):not([type=radio]), select:visible, textarea:visible",
  );
  expect(await controls.count()).toBeGreaterThan(0);
  const tooSmall = await controls.evaluateAll((elements) =>
    elements
      .map((element) => ({
        name:
          element.getAttribute("name") ?? element.getAttribute("aria-label"),
        size: parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter(({ size }) => size < 16),
  );
  expect(
    tooSmall,
    "Focus must not encounter text below iOS's zoom threshold",
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 1366 },
]) {
  test(`Formulare bleiben ohne Fokus-Zoom lesbar bei ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "Mobile/touch regression");
    await page.setViewportSize(viewport);
    await mockEmployee(page);
    await expectReadableControls(page);
    await page.getByRole("button", { name: "Neue Gruppe" }).click();
    const name = page.getByPlaceholder("z. B. Frühdienst Nord");
    await expect(name).toBeFocused();
    await expectReadableControls(page);
    await name.fill("Frühdienst Test");
    await page.getByLabel("Gesprächsart").focus();
    await expectReadableControls(page);
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();

    // Navigation loads the workflow CSS after the global interaction styles.
    await page.goto("/app/leave");
    await page
      .getByRole("button", { name: "Urlaubsantrag erfassen", exact: true })
      .click();
    await expect(page.locator(".wf-form textarea")).toBeVisible();
    await expectReadableControls(page);
    await page.locator(".wf-form textarea").fill("Synthetische Notiz");
    await expectReadableControls(page);
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  });
}

test("Native Formulare bleiben auch mit Maus und großer Textgröße lesbar", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Wide native tablet with pointer",
  );
  await page.setViewportSize({ width: 1366, height: 1024 });
  await mockEmployee(page);
  await page.evaluate(() =>
    document.documentElement.classList.add("native-app"),
  );
  await page.getByRole("button", { name: "Neue Gruppe" }).click();
  await expectReadableControls(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(page.getByPlaceholder("z. B. Frühdienst Nord")).toHaveCSS(
    "font-size",
    "20px",
  );
});
