// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  native: true,
  values: new Map<string, string>(),
  listeners: new Map<string, (event: unknown) => void>(),
  rpc: vi.fn(),
  info: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  request: vi.fn(),
  check: vi.fn(),
  getSession: vi.fn(),
  badge: vi.fn(),
  delivered: vi.fn(),
  removeDelivered: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => state.native, getPlatform: () => "ios" },
}));
vi.mock("@capacitor/app", () => ({ App: { getInfo: state.info } }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: vi.fn(
      async (name: string, listener: (event: unknown) => void) => {
        state.listeners.set(name, listener);
        return { remove: vi.fn() };
      },
    ),
    getDeliveredNotifications: state.delivered,
    removeDeliveredNotifications: state.removeDelivered,
    register: state.register,
    unregister: state.unregister,
    requestPermissions: state.request,
    checkPermissions: state.check,
    createChannel: vi.fn(),
    removeAllDeliveredNotifications: vi.fn(async () => {}),
  },
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { rpc: state.rpc, auth: { getSession: state.getSession } },
}));
vi.mock("./storage", () => ({
  authStorage: {
    getItem: async (key: string) => state.values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      state.values.set(key, value);
    },
    removeItem: async (key: string) => {
      state.values.delete(key);
    },
  },
}));
vi.mock("./permissions", () => ({
  markPermissionRequested: vi.fn(async () => {}),
  setAppBadgeCount: state.badge,
}));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_PUSH_ENABLED", "true");
  state.native = true;
  state.values.clear();
  state.listeners.clear();
  state.info.mockResolvedValue({ version: "1.0.0" });
  state.getSession.mockResolvedValue({
    data: { session: { user: { id: "user-a" } } },
  });
  state.rpc.mockResolvedValue({
    error: null,
    data: { badge_count: 0, stale_ids: [] },
  });
  state.badge.mockResolvedValue(undefined);
  state.delivered.mockResolvedValue({ notifications: [] });
  state.removeDelivered.mockResolvedValue(undefined);
  state.request.mockResolvedValue({ receive: "granted" });
  state.check.mockResolvedValue({ receive: "granted" });
  state.unregister.mockResolvedValue(undefined);
  state.register.mockImplementation(async () => {
    state.listeners.get("registration")?.({ value: "a".repeat(64) });
  });
});
afterEach(() => vi.unstubAllEnvs());
it("does not prompt for push during startup or browser use", async () => {
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  await push.restorePushForUser("user-a");
  expect(state.request).not.toHaveBeenCalled();
  expect(state.register).not.toHaveBeenCalled();
  state.native = false;
  await push.disablePush();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("registers after explicit permission and never persists the provider token", async () => {
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  await push.enablePush();
  expect(state.rpc).toHaveBeenCalledWith(
    "register_push_device",
    expect.objectContaining({
      p_platform: "ios",
      p_push_token: "a".repeat(64),
      p_app_version: "1.0.0",
    }),
  );
  expect([...state.values.values()]).not.toContain("a".repeat(64));
  await push.disablePush();
  expect(state.rpc).toHaveBeenLastCalledWith("revoke_push_device", {
    p_installation_id: state.values.get("alberring.installation"),
  });
});
it("denied permission never registers a token", async () => {
  state.request.mockResolvedValue({ receive: "denied" });
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  await expect(push.enablePush()).rejects.toThrow("nicht erlaubt");
  expect(state.register).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("logout waits for an in-flight token write and revokes it afterwards", async () => {
  const write = deferred<{ error: null }>();
  state.rpc.mockImplementation((name: string) =>
    name === "register_push_device"
      ? write.promise
      : Promise.resolve({ error: null }),
  );
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  const enabled = push.enablePush().catch((error: Error) => error);
  await vi.waitFor(() =>
    expect(state.rpc).toHaveBeenCalledWith(
      "register_push_device",
      expect.anything(),
    ),
  );
  const disabled = push.disablePush();
  await Promise.resolve();
  expect(
    state.rpc.mock.calls.some(([name]) => name === "revoke_push_device"),
  ).toBe(false);
  write.resolve({ error: null });
  await disabled;
  expect(await enabled).toBeInstanceOf(Error);
  expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
    "register_push_device",
    "revoke_push_device",
  ]);
});
it("logout cancels a registration still awaiting native device details", async () => {
  const info = deferred<{ version: string }>();
  state.info.mockReturnValue(info.promise);
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  const enabled = push.enablePush().catch((error: Error) => error);
  await vi.waitFor(() => expect(state.info).toHaveBeenCalled());
  await push.disablePush();
  info.resolve({ version: "1.0.0" });
  expect(await enabled).toBeInstanceOf(Error);
  await vi.waitFor(() =>
    expect(state.values.has("alberring.installation")).toBe(true),
  );
  expect(
    state.rpc.mock.calls.some(([name]) => name === "register_push_device"),
  ).toBe(false);
});
it("reports failed server revocation and keeps installation identity for retry", async () => {
  state.values.set("alberring.installation", "installation-id");
  state.rpc.mockResolvedValue({ error: { message: "offline" } });
  const push = await import("./push");
  await expect(push.disablePush()).rejects.toThrow("nicht vollständig");
  expect(state.values.get("alberring.installation")).toBe("installation-id");
  state.rpc.mockResolvedValue({
    error: null,
    data: { badge_count: 0, stale_ids: [] },
  });
  state.badge.mockResolvedValue(undefined);
  state.delivered.mockResolvedValue({ notifications: [] });
  state.removeDelivered.mockResolvedValue(undefined);
  await push.disablePush();
  expect(state.rpc).toHaveBeenCalledTimes(2);
});
it("untrusted notification taps cannot navigate outside approved app screens", async () => {
  const push = await import("./push"),
    navigate = vi.fn();
  await push.initializePush(navigate, vi.fn());
  state.listeners.get("pushNotificationActionPerformed")?.({
    notification: { data: { target_path: "https://attacker.test" } },
  });
  expect(navigate).toHaveBeenLastCalledWith("/app/notifications");
  state.listeners.get("pushNotificationActionPerformed")?.({
    notification: { data: { target_path: "/app/messages" } },
  });
  expect(navigate).toHaveBeenLastCalledWith("/app/messages");
});

it("syncs actual unread badges and removes only server-confirmed read notifications", async () => {
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  await push.enablePush();
  const read = "10000000-0000-4000-8000-000000000001";
  const unread = "10000000-0000-4000-8000-000000000002";
  state.delivered.mockResolvedValue({
    notifications: [
      { id: "native-read", tag: read },
      { id: "native-unread", data: { notificationId: unread } },
    ],
  });
  state.rpc.mockResolvedValue({
    error: null,
    data: { badge_count: 4, stale_ids: [read] },
  });
  await push.syncPushBadge();
  expect(state.rpc).toHaveBeenLastCalledWith("my_push_state", {
    p_delivered_ids: [read, unread],
  });
  expect(state.removeDelivered).toHaveBeenLastCalledWith({
    notifications: [{ id: "native-read", tag: read }],
  });
  expect(state.badge).toHaveBeenLastCalledWith(4);
});
it("does not restore a stale badge after logout during a slow count request", async () => {
  const push = await import("./push");
  await push.initializePush(vi.fn(), vi.fn());
  await push.enablePush();
  const pending = deferred<{
    error: null;
    data: { badge_count: number; stale_ids: string[] };
  }>();
  state.rpc.mockImplementation((name: string) =>
    name === "my_push_state"
      ? pending.promise
      : Promise.resolve({ error: null }),
  );
  const syncing = push.syncPushBadge();
  await vi.waitFor(() =>
    expect(state.rpc).toHaveBeenLastCalledWith("my_push_state", {
      p_delivered_ids: [],
    }),
  );
  const logout = push.disablePush();
  pending.resolve({ error: null, data: { badge_count: 9, stale_ids: [] } });
  await Promise.all([syncing, logout]);
  expect(state.badge).not.toHaveBeenCalledWith(9);
  expect(state.badge).toHaveBeenLastCalledWith(0);
});

it("preserves delivered notifications while auth restoration is pending", async () => {
  const push = await import("./push");
  await push.syncPushBadge();
  expect(state.badge).not.toHaveBeenCalled();
  expect(state.delivered).not.toHaveBeenCalled();
});
