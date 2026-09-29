import { Capacitor, registerPlugin } from "@capacitor/core";

export type DevicePermission =
  "location" | "camera" | "microphone" | "notifications";
export type PermissionState =
  "notDetermined" | "granted" | "denied" | "restricted" | "permanentlyDenied";
export type DevicePermissionStatus = {
  status: PermissionState;
  precise?: boolean;
  locationServicesEnabled?: boolean;
  canCheck?: boolean;
};

interface SettingsPlugin {
  openSettings(): Promise<void>;
  permissionStatus(options: {
    permission: DevicePermission;
  }): Promise<DevicePermissionStatus>;
  markPermissionRequested(options: {
    permission: DevicePermission;
  }): Promise<void>;
}

const settings = registerPlugin<SettingsPlugin>("AlberringSettings");

export const permissionLabels: Record<PermissionState, string> = {
  notDetermined: "Noch nicht angefragt",
  granted: "Erlaubt",
  denied: "Abgelehnt",
  restricted: "Vom Gerät eingeschränkt",
  permanentlyDenied: "In den Einstellungen gesperrt",
};

/** Read only: opening settings must never trigger OS permission prompts. */
export async function getPermissionStatus(
  permission: DevicePermission,
): Promise<DevicePermissionStatus> {
  if (Capacitor.isNativePlatform())
    return settings.permissionStatus({ permission });
  if (permission === "notifications") {
    if (!("Notification" in globalThis))
      return { status: "notDetermined", canCheck: false };
    return {
      status:
        Notification.permission === "default"
          ? "notDetermined"
          : Notification.permission,
    };
  }
  try {
    const name = permission === "location" ? "geolocation" : permission;
    const result = await navigator.permissions.query({
      name: name as PermissionName,
    });
    return {
      status: result.state === "prompt" ? "notDetermined" : result.state,
    };
  } catch {
    // Safari does not expose every permission via the Permissions API.
    return { status: "notDetermined", canCheck: false };
  }
}

export async function markPermissionRequested(
  permission: DevicePermission,
): Promise<void> {
  if (Capacitor.isNativePlatform())
    await settings.markPermissionRequested({ permission });
}

export async function openAppSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) await settings.openSettings();
  else
    throw new Error(
      "Öffnen Sie die Website-Berechtigungen über das Symbol neben der Browseradresse.",
    );
}

export type DeviceErrorCode =
  | "permission"
  | "restricted"
  | "disabled"
  | "timeout"
  | "unavailable"
  | "file"
  | "cancelled";
export class DeviceAccessError extends Error {
  readonly code: DeviceErrorCode;
  readonly permissionStatus?: PermissionState;
  constructor(
    code: DeviceErrorCode,
    message: string,
    permissionStatus?: PermissionState,
  ) {
    super(message);
    this.name = "DeviceAccessError";
    this.code = code;
    this.permissionStatus = permissionStatus;
  }
}

export function assertPermissionCanBeRequested(
  status: DevicePermissionStatus,
  label: string,
): void {
  if (status.status === "restricted") {
    throw new DeviceAccessError(
      "restricted",
      `${label} ist durch eine Gerätebeschränkung gesperrt. Bitte wenden Sie sich an die Geräteverwaltung.`,
      "restricted",
    );
  }
  if (status.status === "permanentlyDenied") {
    throw new DeviceAccessError(
      "permission",
      `${label} ist gesperrt. Sie können den Zugriff in den App-Einstellungen erlauben.`,
      "permanentlyDenied",
    );
  }
}

export function deviceErrorMessage(error: unknown): string {
  return error instanceof DeviceAccessError
    ? error.message
    : "Die Gerätefunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.";
}
