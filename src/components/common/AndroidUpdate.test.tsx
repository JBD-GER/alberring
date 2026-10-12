// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  platform: "android",
  active: true,
  signedIn: true,
  check: vi.fn(),
  listener: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => state.platform !== "web",
    getPlatform: () => state.platform,
  },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: state.listener } }));
vi.mock("../../features/auth/AuthProvider", () => ({
  useAuth: () => ({
    session: state.signedIn ? {} : null,
    appSession: { profile: { status: state.active ? "active" : "suspended" } },
  }),
}));
vi.mock("../../services/platform/android-update", () => ({
  checkAndroidUpdate: state.check,
  androidUpdatePortal: "https://app.alberring.de/android",
}));
import { AndroidUpdate } from "./AndroidUpdate";
let client: QueryClient;
beforeEach(() => {
  localStorage.clear();
  state.platform = "android";
  state.active = true;
  state.signedIn = true;
  state.check.mockReset().mockResolvedValue({ version: "1.0.5", build: 13 });
  state.listener.mockReset().mockResolvedValue({ remove: state.remove });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function show() {
  render(
    <QueryClientProvider client={client}>
      <AndroidUpdate />
    </QueryClientProvider>,
  );
}
it("shows an update and opens only the protected portal", async () => {
  show();
  const link = await screen.findByRole("link", {
    name: "Update herunterladen",
  });
  expect(link).toHaveAttribute("href", "https://app.alberring.de/android");
  fireEvent.click(screen.getByRole("button", { name: "Morgen erinnern" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  const callback = state.listener.mock.calls[0][1];
  await act(async () => {
    callback({ isActive: true });
  });
  await waitFor(() => expect(state.check).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  state.check.mockResolvedValue({ version: "1.0.6", build: 14 });
  await act(async () => {
    callback({ isActive: true });
  });
  expect(await screen.findByRole("status")).toHaveTextContent("1.0.6");
});
it.each(["web", "ios"])("never checks or prompts on %s", async (platform) => {
  state.platform = platform;
  show();
  expect(state.check).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it.each(["signedOut", "suspended"])(
  "does not prompt an inaccessible account (%s)",
  async (mode) => {
    state.signedIn = mode !== "signedOut";
    state.active = mode !== "suspended";
    show();
    expect(state.check).not.toHaveBeenCalled();
  },
);
it.each(["current", "offline"])("does not block work when %s", async (mode) => {
  if (mode === "current") state.check.mockResolvedValue(null);
  else state.check.mockRejectedValue(new Error("offline"));
  show();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
