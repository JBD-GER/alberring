import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Exercise the real screens and their CSS cascade with synthetic API data.
// No production session, employee data or write requests are needed.
async function mockEmployee(page: Page, ownLeave = false, admin = false) {
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
    my_permissions: [
      "messages.use",
      ownLeave ? "leave.create_own" : "leave.create",
      "leave.view_own",
      ...(admin ? ["leave.manage"] : []),
    ].map((permission_key) => ({ permission_key })),
    list_leave_requests: admin
      ? [
          {
            id: "00000000-0000-4000-8000-000000000003",
            profile_id: "00000000-0000-4000-8000-000000000004",
            leave_type: "annual",
            starts_on: "2030-01-07",
            ends_on: "2030-01-12",
            day_fraction: 1,
            workdays: 6,
            note: "Synthetischer Antrag",
            status: "submitted",
            decided_by: null,
            decided_at: null,
            decision_note: null,
            created_at: "2030-01-01T10:00:00Z",
            profiles: {
              id: "00000000-0000-4000-8000-000000000004",
              display_name: "Erika Beispiel",
            },
          },
        ]
      : [],
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
  { width: 320, height: 640 },
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
    const dates = page.locator('.wf-form input[type="date"]');
    await expect(dates).toHaveCount(2);
    for (const date of await dates.all()) {
      await date.fill("2030-11-12");
      await date.focus();
      await expect(date).toHaveValue("2030-11-12");
      const bounds = await date.evaluate((element) => {
        const input = element.getBoundingClientRect();
        const field = element.closest("label")!.getBoundingClientRect();
        return {
          inputLeft: input.left,
          inputRight: input.right,
          fieldLeft: field.left,
          fieldRight: field.right,
          viewport: window.innerWidth,
        };
      });
      expect(bounds.inputLeft).toBeGreaterThanOrEqual(bounds.fieldLeft - 1);
      expect(bounds.inputRight).toBeLessThanOrEqual(bounds.fieldRight + 1);
      expect(bounds.inputRight).toBeLessThanOrEqual(bounds.viewport);
    }
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

test("Mitarbeitende beantragen Urlaub auch auf schmalen Touch-Bildschirmen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockEmployee(page, true);
  await page.goto("/app/leave");
  await page
    .getByRole("button", { name: "Urlaub beantragen", exact: true })
    .click();
  await expect(page.getByLabel("Mitarbeiter/in")).toHaveCount(0);
  await page.getByLabel("Von", { exact: true }).fill("2030-01-07");
  await page.getByLabel("Bis", { exact: true }).fill("2030-01-13");
  await expect(page.getByText("6 Arbeitstage", { exact: true })).toBeVisible();
  await expectReadableControls(page);
  const request = page.waitForRequest((request) =>
    request.url().endsWith("/rpc/submit_leave_request"),
  );
  await page
    .getByRole("button", { name: "Antrag speichern", exact: true })
    .click();
  expect((await request).postDataJSON()).toEqual({
    p_leave_type: "annual",
    p_starts_on: "2030-01-07",
    p_ends_on: "2030-01-13",
    p_day_fraction: 1,
    p_note: null,
  });
  await expect(
    page.getByText(
      "Der Urlaubsantrag wurde eingereicht und wartet auf Freigabe.",
    ),
  ).toBeVisible();
});

test("Verwaltung bearbeitet Teamurlaub direkt im sichtbaren mobilen Dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockEmployee(page, false, true);
  await expect(page.locator('a[href="/app/leave"]:visible')).toBeVisible();
  await expect(page.locator('a[href="/app/schedule"]:visible')).toHaveCount(0);
  await page.goto("/app/admin/leave");
  await page.getByRole("button", { name: "Antrag bearbeiten" }).click();
  const dialog = page.getByRole("dialog", { name: "Urlaubsantrag bearbeiten" });
  await expect(dialog).toBeVisible();
  await expectReadableControls(page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await dialog
    .getByRole("button", { name: "Genehmigen", exact: true })
    .scrollIntoViewIfNeeded();
  const saved = page.waitForRequest((request) =>
    request.url().includes("/rpc/decide_leave_request"),
  );
  await dialog.getByRole("button", { name: "Genehmigen", exact: true }).click();
  expect((await saved).postDataJSON().p_status).toBe("approved");
  await expect(dialog).toHaveCount(0);
});
