// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  native: true,
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => state.native },
  registerPlugin: () => state,
}));
import { authStorage } from "./storage";
afterEach(() => {
  state.native = true;
  vi.clearAllMocks();
  localStorage.clear();
});
it("routes native auth tokens exclusively to the vault", async () => {
  state.get.mockResolvedValue({ value: "session" });
  await authStorage.setItem("key", "session");
  expect(state.set).toHaveBeenCalledWith({ key: "key", value: "session" });
  expect(await authStorage.getItem("key")).toBe("session");
  await authStorage.removeItem("key");
  expect(state.remove).toHaveBeenCalledWith({ key: "key" });
  expect(localStorage.length).toBe(0);
});
it("fails closed on locked or broken native storage", async () => {
  localStorage.setItem("key", "unsafe-old-session");
  state.get.mockRejectedValue(new Error("Keychain locked"));
  state.set.mockRejectedValue(new Error("Keystore unavailable"));
  await expect(authStorage.getItem("key")).rejects.toThrow();
  await expect(authStorage.setItem("new", "secret")).rejects.toThrow();
  expect(localStorage.getItem("new")).toBeNull();
});
it("preserves browser session storage", async () => {
  state.native = false;
  await authStorage.setItem("key", "web-session");
  expect(await authStorage.getItem("key")).toBe("web-session");
  await authStorage.removeItem("key");
  expect(await authStorage.getItem("key")).toBeNull();
});
