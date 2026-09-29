// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DevicePermissions } from "./DevicePermissions";

const check = vi.hoisted(() =>
  vi.fn(async ({ permission }: { permission: string }) => ({
    status: (
      {
        location: "granted",
        camera: "restricted",
        microphone: "permanentlyDenied",
        notifications: "notDetermined",
      } as Record<string, string>
    )[permission],
    precise: false,
  })),
);
const mark = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    permissionStatus: check,
    markPermissionRequested: mark,
  }),
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: async () => ({ remove: vi.fn() }) },
}));
afterEach(cleanup);
it("shows exact restrictions without asking for permissions on the settings screen", async () => {
  render(<DevicePermissions />);
  await screen.findByText("Vom Gerät eingeschränkt");
  expect(screen.getByText("In den Einstellungen gesperrt")).toBeTruthy();
  expect(screen.getByText("Erlaubt · ungefähr")).toBeTruthy();
  expect(screen.getByText("Noch nicht angefragt")).toBeTruthy();
  expect(check).toHaveBeenCalledTimes(4);
  expect(mark).not.toHaveBeenCalled();
});
