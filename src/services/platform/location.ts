import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  assertPermissionCanBeRequested,
  DeviceAccessError,
  getPermissionStatus,
  markPermissionRequested,
} from "./permissions";

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  precise: boolean;
};

export function mapLocationError(error: unknown): DeviceAccessError {
  if (error instanceof DeviceAccessError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "1" || code === "OS-PLUG-GLOC-0003")
    return new DeviceAccessError(
      "permission",
      "Der Standortzugriff wurde abgelehnt. Erlauben Sie ihn in den App- oder Website-Einstellungen.",
      "denied",
    );
  if (code === "OS-PLUG-GLOC-0008")
    return new DeviceAccessError(
      "restricted",
      "Der Standortzugriff ist durch die Geräteverwaltung eingeschränkt.",
      "restricted",
    );
  if (
    ["OS-PLUG-GLOC-0007", "OS-PLUG-GLOC-0009", "OS-PLUG-GLOC-0017"].includes(
      code,
    )
  )
    return new DeviceAccessError(
      "disabled",
      "Die Ortungsdienste sind ausgeschaltet. Aktivieren Sie den Standort am Gerät und versuchen Sie es erneut.",
    );
  if (code === "3" || code === "OS-PLUG-GLOC-0010")
    return new DeviceAccessError(
      "timeout",
      "Die Standortermittlung hat zu lange gedauert. Gehen Sie an einen Ort mit besserem GPS-Empfang und versuchen Sie es erneut.",
    );
  return new DeviceAccessError(
    "unavailable",
    "Der Standort ist nicht verfügbar. Prüfen Sie GPS-Empfang, Ortungsdienste und gegebenenfalls die Internetverbindung.",
  );
}

/** One explicit foreground request; no watchers, history or background tracking. */
export async function getCurrentLocation(): Promise<CurrentLocation> {
  try {
    let precise = true;
    if (Capacitor.isNativePlatform()) {
      const status = await getPermissionStatus("location");
      if (status.locationServicesEnabled === false)
        throw new DeviceAccessError(
          "disabled",
          "Die Ortungsdienste sind ausgeschaltet. Aktivieren Sie den Standort am Gerät.",
        );
      assertPermissionCanBeRequested(status, "Der Standortzugriff");
      if (status.status !== "granted") {
        await markPermissionRequested("location");
        const result = await Geolocation.requestPermissions({
          permissions: ["location", "coarseLocation"],
        });
        if (
          result.location !== "granted" &&
          result.coarseLocation !== "granted"
        ) {
          const denied = await getPermissionStatus("location");
          throw new DeviceAccessError(
            "permission",
            "Der Standortzugriff wurde nicht erlaubt. Sie können die Berechtigung in den App-Einstellungen ändern.",
            denied.status,
          );
        }
      }
      precise = (await getPermissionStatus("location")).precise !== false;
    } else if (!navigator.geolocation) {
      throw new DeviceAccessError(
        "unavailable",
        "Dieser Browser unterstützt keine Standortermittlung.",
      );
    }
    const options = {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    };
    const position = Capacitor.isNativePlatform()
      ? await Geolocation.getCurrentPosition(options)
      : await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, options),
        );
    const { latitude, longitude, accuracy } = position.coords;
    if (
      ![latitude, longitude, accuracy].every(Number.isFinite) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      accuracy < 0
    )
      throw new DeviceAccessError(
        "unavailable",
        "Das Gerät hat keinen gültigen Standort geliefert. Bitte erneut versuchen.",
      );
    return {
      latitude,
      longitude,
      accuracy,
      timestamp: position.timestamp,
      precise,
    };
  } catch (error) {
    throw mapLocationError(error);
  }
}

export function formatLocationMessage(location: CurrentLocation): string {
  return `Mein Standort: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (Genauigkeit ca. ${Math.round(location.accuracy)} m; ${new Date(location.timestamp).toLocaleString("de-DE")})`;
}
