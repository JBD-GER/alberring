import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "@capacitor/app";
import { checkAndroidUpdate } from "./android-update";

vi.mock("@capacitor/app", () => ({ App: { getInfo: vi.fn() } }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(App.getInfo).mockResolvedValue({
    id: "de.alberring.connect",
    name: "Alberring",
    version: "1.0.4",
    build: "12",
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each([11, 12, 13])(
  "compares build numbers without prompting for a downgrade (%i)",
  async (build) => {
    fetchMock.mockResolvedValue(Response.json({ version: "1.0.5", build }));
    expect(await checkAndroidUpdate()).toEqual(
      build > 12 ? { version: "1.0.5", build } : null,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.alberring.de/android-release.json",
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
  },
);
it("rejects an HTML fallback instead of advertising a broken update", async () => {
  fetchMock.mockResolvedValue(
    new Response("<html>Login</html>", {
      headers: { "content-type": "text/html" },
    }),
  );
  await expect(checkAndroidUpdate()).rejects.toThrow("metadata unavailable");
});
it.each([
  { version: "1.0.5", build: -1 },
  { version: "invalid", build: 13 },
  { version: "1.0.5", build: "13" },
])("rejects malformed metadata %j", async (metadata) => {
  fetchMock.mockResolvedValue(Response.json(metadata));
  await expect(checkAndroidUpdate()).rejects.toThrow();
});
it("does not send development apps to the production installer", async () => {
  vi.mocked(App.getInfo).mockResolvedValue({
    id: "de.alberring.connect.dev",
    name: "Alberring Dev",
    version: "1.0.4",
    build: "12",
  });
  expect(await checkAndroidUpdate()).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
