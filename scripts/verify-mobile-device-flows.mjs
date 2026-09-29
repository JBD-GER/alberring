/**
 * Real browser -> local Supabase -> private Storage verification.
 * Browser GPS and microphone signals are synthetic test inputs; APIs are not mocked.
 * MOBILE_TEST_ACCESS_FILE points to a chmod 600 JSON file with a local test
 * account's { url, anonKey, email, password, conversationId }. Never commit it.
 */
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const accessPath = process.env.MOBILE_TEST_ACCESS_FILE;
if (!accessPath)
  throw new Error(
    "Set MOBILE_TEST_ACCESS_FILE to the private local test access JSON.",
  );
if ((await stat(accessPath)).mode & 0o077)
  throw new Error("The test access file must have mode 0600.");
const access = JSON.parse(await readFile(accessPath, "utf8"));
const baseUrl = process.env.MOBILE_TEST_BASE_URL || "http://127.0.0.1:5174";
for (const address of [baseUrl, access.url]) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(address).hostname))
    throw new Error("This fixture writes only to local development services.");
}
const screenshots = resolve(
  process.env.MOBILE_TEST_SCREENSHOT_DIR || "docs/screenshots",
);
await mkdir(screenshots, { recursive: true });
const client = createClient(access.url, access.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: loginError } = await client.auth.signInWithPassword({
  email: access.email,
  password: access.password,
});
if (loginError) throw new Error("The local test account cannot sign in.");
const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  geolocation: { latitude: 52.520008, longitude: 13.404954, accuracy: 15 },
  permissions: ["geolocation", "microphone"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
const sent = [];
async function tools(open) {
  const button = page.getByRole("button", {
    name: /^Foto, Standort oder Sprachnachricht/,
  });
  if ((await button.getAttribute("aria-expanded")) !== String(open))
    await button.click();
}
async function saveScreenshot(name) {
  const width = await page.evaluate(() => ({
    content: globalThis.document.documentElement.scrollWidth,
    viewport: globalThis.document.documentElement.clientWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await page.screenshot({ path: resolve(screenshots, name), fullPage: true });
}
async function attachment(name) {
  let found;
  await expect
    .poll(
      async () => {
        const { data, error } = await client
          .from("message_attachments")
          .select("id,message_id,mime_type,size_bytes,original_name")
          .eq("conversation_id", access.conversationId)
          .eq("original_name", name);
        if (error)
          throw new Error(
            "Attachment metadata cannot be read with the test user's RLS scope.",
          );
        found = data?.at(-1);
        return Boolean(found);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  sent.push(found.message_id);
  return found;
}
try {
  await page.goto(`${baseUrl}/login`);
  await page
    .getByRole("textbox", { name: "Dienstliche E-Mail" })
    .fill(access.email);
  await page.getByLabel("Passwort", { exact: true }).fill(access.password);
  await page.getByRole("button", { name: "Sicher anmelden" }).click();
  await page.waitForURL("**/app/dashboard");
  await page.goto(`${baseUrl}/app/messages/${access.conversationId}`);
  await expect(
    page.getByRole("textbox", { name: "Nachricht", exact: true }),
  ).toBeVisible();
  await tools(true);

  const choosing = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Foto auswählen", exact: true })
    .click();
  await (await choosing).setFiles(resolve("public/icon-192.png"));
  await expect(page.locator(".selected-file strong")).toContainText("Foto-");
  const photoName = await page.locator(".selected-file strong").innerText();
  await tools(false);
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes("/storage/v1/object/upload/sign/"),
  );
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  expect((await uploadResponse).ok()).toBe(true);
  await expect(page.locator(".selected-file")).toHaveCount(0);
  const image = page.getByRole("img", { name: photoName, exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  const photoMetadata = await attachment(photoName);
  expect(photoMetadata.mime_type).toBe("image/jpeg");
  expect(photoMetadata.size_bytes).toBeGreaterThan(0);
  await saveScreenshot("13-photo-upload.png");
  checks.push({
    name: "photo",
    result: "pass",
    detail:
      "System browser file chooser -> JPEG compression -> real signed upload -> RLS metadata -> signed image download rendered",
    mimeType: photoMetadata.mime_type,
    bytes: photoMetadata.size_bytes,
  });

  await tools(true);
  await page
    .getByRole("button", { name: "Aufnahme starten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Aufnahme stoppen", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Aufnahme läuft · [2-9] \/ 120 s/)).toBeVisible({
    timeout: 10_000,
  });
  await page
    .getByRole("button", { name: "Aufnahme stoppen", exact: true })
    .scrollIntoViewIfNeeded();
  await saveScreenshot("14-audio-recording.png");
  await page
    .getByRole("button", { name: "Aufnahme stoppen", exact: true })
    .click();
  await expect(page.locator(".selected-file strong")).toContainText(
    "Sprachnachricht-",
  );
  const audioName = await page.locator(".selected-file strong").innerText();
  const preview = page.getByLabel("Sprachnachricht vor dem Senden anhören");
  await expect
    .poll(() => preview.evaluate((element) => element.readyState >= 1))
    .toBe(true);
  await tools(false);
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(page.locator(".selected-file")).toHaveCount(0);
  const audioMetadata = await attachment(audioName);
  expect(["audio/mp4", "audio/webm", "audio/ogg", "audio/aac"]).toContain(
    audioMetadata.mime_type,
  );
  const audioMessage = page.locator(`#message-${audioMetadata.message_id}`);
  await audioMessage
    .getByRole("button", { name: "Sprachnachricht laden", exact: true })
    .click();
  const player = audioMessage.getByLabel("Sprachnachricht abspielen");
  // Native browser controls have no portable play-button locator. Invoke the
  // same media element's standard playback API, never a product API mock.
  await player.evaluate((element) => element.play());
  await expect
    .poll(() => player.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await player.evaluate((element) => element.pause());
  checks.push({
    name: "audio",
    result: "pass",
    detail:
      "Synthetic Chromium microphone -> real MediaRecorder -> reviewable draft -> real Storage and metadata -> signed audio playback",
    mimeType: audioMetadata.mime_type,
    bytes: audioMetadata.size_bytes,
  });

  await tools(true);
  const before = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", access.conversationId);
  await page
    .getByRole("button", {
      name: "Standort zum Entwurf hinzufügen",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nachricht", exact: true }),
  ).toHaveValue(/Mein Standort: 52\.520008, 13\.404954/);
  const after = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", access.conversationId);
  expect(after.count).toBe(before.count);
  await tools(false);
  await saveScreenshot("15-location-draft.png");
  checks.push({
    name: "location",
    result: "pass",
    detail:
      "Synthetic browser position with 15 m accuracy is inserted into the real chat draft; database message count remains unchanged until explicit send",
  });
  expect(errors).toEqual([]);
  const result = {
    testedAt: new Date().toISOString(),
    backend: "local Supabase, no mocked APIs",
    viewport: "390x844",
    sensorInput:
      "Synthetic Chromium microphone and browser geolocation, not physical-device proof",
    checks,
    pageErrors: errors,
    createdLocalTestMessageCount: sent.length,
  };
  await writeFile(
    process.env.MOBILE_TEST_RESULT_FILE ||
      "/tmp/alberring-device-flow-results.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({
    path: "/tmp/alberring-device-flow-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await client.auth.signOut();
}
