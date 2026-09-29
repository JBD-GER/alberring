import { supabase } from "../../lib/supabase";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** Only the configured Storage origin and the precise signed-upload path. */
export function validateUploadUrl(
  value: string,
  backendUrl: string,
  bucket: string,
  path: string,
): URL {
  const target = new URL(value);
  const backend = new URL(backendUrl);
  const expected = `${backend.pathname.replace(/\/$/, "")}/storage/v1/object/upload/sign/${bucket}/${path}`;
  if (
    target.origin !== backend.origin ||
    decodeURIComponent(target.pathname) !== expected ||
    target.username ||
    target.password ||
    !target.searchParams.get("token") ||
    !["https:", "http:"].includes(target.protocol)
  )
    throw new UploadError("Der Upload konnte nicht sicher vorbereitet werden.");
  return target;
}

export async function uploadPrivateFile(
  bucket: "message-attachments" | "vehicle-files",
  path: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted)
    throw new UploadError(
      "Der Upload wurde abgebrochen. Die Datei bleibt zum erneuten Senden ausgewählt.",
    );
  if (!navigator.onLine)
    throw new UploadError(
      "Keine Internetverbindung. Die Datei bleibt ausgewählt; versuchen Sie es wieder, sobald Sie online sind.",
    );
  onProgress(0);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data)
    throw new UploadError(
      "Der Upload konnte nicht vorbereitet werden. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.",
    );
  const target = validateUploadUrl(
    data.signedUrl,
    import.meta.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321",
    bucket,
    path,
  );
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const clean = () => signal.removeEventListener("abort", abort);
    const fail = (message: string) => {
      clean();
      reject(new UploadError(message));
    };
    xhr.open("PUT", target.href);
    xhr.timeout = 120_000;
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100)),
        );
    };
    xhr.onerror = () =>
      fail(
        "Die Verbindung ist beim Upload unterbrochen worden. Bitte erneut versuchen.",
      );
    xhr.ontimeout = () =>
      fail(
        "Der Upload hat zu lange gedauert. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.",
      );
    xhr.onabort = () =>
      fail(
        "Der Upload wurde abgebrochen. Die Datei bleibt zum erneuten Senden ausgewählt.",
      );
    xhr.onload = () => {
      clean();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else
        reject(
          new UploadError(
            xhr.status === 413
              ? "Die Datei ist für diesen Upload zu groß."
              : "Der Server konnte die Datei nicht speichern. Bitte erneut versuchen.",
          ),
        );
    };
    if (signal.aborted) {
      fail("Der Upload wurde abgebrochen.");
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    // Match storage-js uploadToSignedUrl's multipart protocol. The URL is a
    // short-lived credential and is never logged or persisted.
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}
