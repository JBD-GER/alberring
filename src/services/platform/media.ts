import { Capacitor } from "@capacitor/core";
import { Camera, MediaTypeSelection } from "@capacitor/camera";
import {
  assertPermissionCanBeRequested,
  DeviceAccessError,
  getPermissionStatus,
  markPermissionRequested,
} from "./permissions";

export function pickWebFile(
  accept: string[],
  capture = false,
): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.hidden = true;
    if (capture) input.setAttribute("capture", "environment");
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), {
      once: true,
    });
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export function photoDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || width * height > 50_000_000)
    throw new DeviceAccessError(
      "file",
      "Das Bild ist zu groß oder beschädigt. Bitte wählen Sie ein kleineres Foto.",
    );
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Re-encoding copies pixels only: no EXIF, embedded GPS or original filename. */
export async function preparePhoto(source: Blob): Promise<File> {
  if (!source.size || source.size > 20 * 1024 * 1024)
    throw new DeviceAccessError(
      "file",
      "Bitte wählen Sie ein Foto zwischen 1 Byte und 20 MB.",
    );
  if (
    source.type &&
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(source.type)
  )
    throw new DeviceAccessError(
      "file",
      "Bitte wählen Sie ein JPG-, PNG- oder unterstütztes Kamerafoto.",
    );
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = photoDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new DeviceAccessError(
        "file",
        "Die Bildverarbeitung ist auf diesem Gerät nicht verfügbar.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(
                new DeviceAccessError(
                  "file",
                  "Das Foto konnte nicht verarbeitet werden.",
                ),
              ),
        "image/jpeg",
        0.85,
      ),
    );
    canvas.width = canvas.height = 0;
    if (blob.size > 10 * 1024 * 1024)
      throw new DeviceAccessError(
        "file",
        "Das Foto bleibt zu groß. Bitte wählen Sie ein kleineres Bild.",
      );
    return new File([blob], `Foto-${Date.now()}.jpg`, { type: "image/jpeg" });
  } catch (error) {
    if (error instanceof DeviceAccessError) throw error;
    throw new DeviceAccessError(
      "file",
      "Das Foto konnte nicht gelesen werden. Speichern Sie es als JPG oder PNG und versuchen Sie es erneut.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isPhotoCancelled(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return [
    "OS-PLUG-CAMR-0006",
    "OS-PLUG-CAMR-0013",
    "OS-PLUG-CAMR-0020",
  ].includes(code);
}

export async function pickPhoto(
  source: "camera" | "photos",
): Promise<File | null> {
  try {
    if (!Capacitor.isNativePlatform()) {
      const file = await pickWebFile(
        ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        source === "camera",
      );
      return file ? preparePhoto(file) : null;
    }
    if (source === "camera") {
      const status = await getPermissionStatus("camera");
      assertPermissionCanBeRequested(status, "Die Kamera");
      await markPermissionRequested("camera");
    }
    // Never request broad photo-library access: the OS picker grants one image.
    const result =
      source === "camera"
        ? await Camera.takePhoto({
            quality: 85,
            targetWidth: 2048,
            targetHeight: 2048,
            correctOrientation: true,
            saveToGallery: false,
            includeMetadata: false,
          })
        : (
            await Camera.chooseFromGallery({
              mediaType: MediaTypeSelection.Photo,
              allowMultipleSelection: false,
              limit: 1,
              includeMetadata: false,
            })
          ).results[0];
    if (!result) return null;
    const path =
      result.webPath ??
      (result.uri ? Capacitor.convertFileSrc(result.uri) : null);
    if (!path)
      throw new DeviceAccessError(
        "file",
        "Das ausgewählte Foto konnte nicht geöffnet werden.",
      );
    const response = await fetch(path);
    if (!response.ok)
      throw new DeviceAccessError(
        "file",
        "Das ausgewählte Foto konnte nicht geöffnet werden.",
      );
    return await preparePhoto(await response.blob());
  } catch (error) {
    if (isPhotoCancelled(error)) return null;
    if (error instanceof DeviceAccessError) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (["OS-PLUG-CAMR-0003", "OS-PLUG-CAMR-0005"].includes(code)) {
      const status = await getPermissionStatus("camera");
      throw new DeviceAccessError(
        "permission",
        "Der Zugriff auf Kamera oder Foto wurde nicht erlaubt. Prüfen Sie die App-Einstellungen.",
        status.status,
      );
    }
    throw new DeviceAccessError(
      "unavailable",
      "Kamera oder Fotoauswahl ist gerade nicht verfügbar. Bitte versuchen Sie es erneut oder wählen Sie eine Datei.",
    );
  }
}
