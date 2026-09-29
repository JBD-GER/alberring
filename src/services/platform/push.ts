import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../../lib/supabase";
import { authStorage } from "./storage";
import { safeAppPath } from "./links";

const installationKey = "alberring.installation";
const enabledKey = "alberring.push-user";
export const pushAvailable =
  Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH_ENABLED === "true";
let activeUser: string | null = null;
let generation = 0;
let registryQueue: Promise<void> = Promise.resolve();
function queueRegistry<T>(action: () => Promise<T>): Promise<T> {
  const next = registryQueue.then(action, action);
  registryQueue = next.then(
    () => {},
    () => {},
  );
  return next;
}
let registration: Promise<void> | null = null;
let settleRegistration: {
  resolve: () => void;
  reject: (error: Error) => void;
} | null = null;

async function installationId(): Promise<string> {
  const stored = await authStorage.getItem(installationKey);
  if (stored) return stored;
  const id = crypto.randomUUID();
  await authStorage.setItem(installationKey, id);
  return id;
}
function status(message: string) {
  window.dispatchEvent(
    new CustomEvent("alberring:push-status", { detail: message }),
  );
}
export async function initializePush(
  navigate: (path: string) => void,
  refresh: () => void,
): Promise<() => void> {
  if (!pushAvailable) return () => {};
  const handles: PluginListenerHandle[] = [];
  try {
    handles.push(
      await PushNotifications.addListener("registration", ({ value }) => {
        const userId = activeUser;
        const tokenGeneration = generation;
        void queueRegistry(async () => {
          if (!userId || (await authStorage.getItem(enabledKey)) !== userId)
            return;
          const { data } = await supabase.auth.getSession();
          if (data.session?.user.id !== userId) return;
          const info = await App.getInfo();
          const id = await installationId();
          if (tokenGeneration !== generation || activeUser !== userId) return;
          const { error } = await supabase.rpc("register_push_device", {
            p_installation_id: id,
            p_platform: Capacitor.getPlatform(),
            p_push_token: value,
            p_push_environment:
              import.meta.env.VITE_PUSH_ENVIRONMENT ?? "production",
            p_app_version: info.version,
          });
          if (tokenGeneration !== generation || activeUser !== userId) return;
          if (error)
            throw new Error(
              "Das Gerät konnte nicht für Push registriert werden. Bitte erneut versuchen.",
            );
          status(
            "Push ist für dieses Gerät aktiviert. Die Kategorien wählen Sie unten aus.",
          );
          settleRegistration?.resolve();
        }).catch(() => {
          if (tokenGeneration !== generation || activeUser !== userId) return;
          const error = new Error(
            "Push konnte nicht aktiviert werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
          );
          status(error.message);
          settleRegistration?.reject(error);
        });
      }),
    );
    handles.push(
      await PushNotifications.addListener("registrationError", () => {
        const error = new Error(
          "Push ist auf diesem Gerät noch nicht verfügbar. Die In-App-Hinweise bleiben aktiv.",
        );
        status(error.message);
        settleRegistration?.reject(error);
      }),
    );
    handles.push(
      await PushNotifications.addListener("pushNotificationReceived", () =>
        refresh(),
      ),
    );
    handles.push(
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        ({ notification }) => {
          const path =
            safeAppPath(notification.data?.target_path) ?? "/app/notifications";
          navigate(path);
          refresh();
        },
      ),
    );
    if (Capacitor.getPlatform() === "android")
      await PushNotifications.createChannel({
        id: "alberring-updates",
        name: "Alberring Hinweise",
        description:
          "Dienstliche Benachrichtigungen ohne vertrauliche Vorschau",
        importance: 3,
        visibility: -1,
      });
  } catch {
    await Promise.all(handles.map((h) => h.remove()));
    throw new Error("Push konnte nicht initialisiert werden.");
  }
  return () => {
    void Promise.all(handles.map((h) => h.remove()));
  };
}
async function register(): Promise<void> {
  if (registration) return registration;
  registration = new Promise<void>((resolve, reject) => {
    settleRegistration = { resolve, reject };
    void PushNotifications.register().catch(() =>
      reject(new Error("Push-Registrierung nicht möglich.")),
    );
  });
  const timeout = setTimeout(
    () =>
      settleRegistration?.reject(
        new Error(
          "Die Push-Registrierung dauert zu lange. Bitte erneut versuchen.",
        ),
      ),
    20_000,
  );
  try {
    await registration;
  } finally {
    clearTimeout(timeout);
    registration = null;
    settleRegistration = null;
  }
}
export async function restorePushForUser(userId: string | null): Promise<void> {
  if (activeUser !== userId) generation += 1;
  activeUser = userId;
  if (
    !pushAvailable ||
    !userId ||
    (await authStorage.getItem(enabledKey)) !== userId
  )
    return;
  if ((await PushNotifications.checkPermissions()).receive === "granted")
    await register();
}
export async function enablePush(): Promise<void> {
  if (!pushAvailable)
    throw new Error(
      "Push wird nach der Betreiber-Einrichtung in der nativen App verfügbar.",
    );
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Bitte zuerst anmelden.");
  const { markPermissionRequested } = await import("./permissions");
  await markPermissionRequested("notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted")
    throw new Error(
      "Benachrichtigungen sind nicht erlaubt. Sie können die Berechtigung in den App-Einstellungen ändern.",
    );
  generation += 1;
  activeUser = data.session.user.id;
  await authStorage.setItem(enabledKey, activeUser);
  await register();
}
export async function disablePush(): Promise<void> {
  activeUser = null;
  generation += 1;
  settleRegistration?.reject(
    new Error("Push-Registrierung wurde abgebrochen."),
  );
  if (!Capacitor.isNativePlatform()) return;
  await authStorage.removeItem(enabledKey);
  const id = await authStorage.getItem(installationKey);
  let failed = false;
  if (id) {
    await queueRegistry(async () => {
      const { error } = await supabase.rpc("revoke_push_device", {
        p_installation_id: id,
      });
      failed = Boolean(error);
    });
  }
  if (pushAvailable) {
    await PushNotifications.unregister().catch(() => {
      failed = true;
    });
    await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
  }
  if (failed)
    throw new Error(
      "Push konnte serverseitig nicht vollständig abgemeldet werden. Bitte bei bestehender Verbindung erneut versuchen.",
    );
}
