import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorAudioRecorder } from "@capgo/capacitor-audio-recorder";
import { Filesystem } from "@capacitor/filesystem";
import {
  assertPermissionCanBeRequested,
  DeviceAccessError,
  getPermissionStatus,
  markPermissionRequested,
} from "./permissions";

export const audioMimeTypes = [
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/aac",
];
export const messageMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  ...audioMimeTypes,
];
export const maxRecordingSeconds = 120;

export function audioFile(blob: Blob): File {
  const type = blob.type.split(";")[0].toLowerCase();
  if (
    !audioMimeTypes.includes(type) ||
    blob.size === 0 ||
    blob.size > 10 * 1024 * 1024
  )
    throw new DeviceAccessError(
      "file",
      "Die Aufnahme ist leer, zu groß oder nicht unterstützt. Bitte nehmen Sie höchstens zwei Minuten auf.",
    );
  const extension: Record<string, string> = {
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
  };
  return new File([blob], `Sprachnachricht-${Date.now()}.${extension[type]}`, {
    type,
  });
}

/** A session belongs to one mounted composer and cannot restart after cancel. */
export function createAudioRecording() {
  const native = Capacitor.isNativePlatform();
  let cancelled = false;
  let started = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    clearTimeout(limitTimer);
  };
  const cancel = async () => {
    cancelled = true;
    clearTimeout(limitTimer);
    const wasStarted = started;
    started = false;
    try {
      if (native && wasStarted) await CapacitorAudioRecorder.cancelRecording();
      else if (recorder?.state === "recording") recorder.stop();
    } finally {
      release();
      chunks = [];
    }
  };
  return {
    async start(onInterrupted: (message: string) => void) {
      try {
        if (native) {
          const status = await getPermissionStatus("microphone");
          assertPermissionCanBeRequested(status, "Das Mikrofon");
          if (status.status !== "granted") {
            await markPermissionRequested("microphone");
            const permission =
              await CapacitorAudioRecorder.requestPermissions();
            if (permission.recordAudio !== "granted")
              throw new DeviceAccessError(
                "permission",
                "Das Mikrofon wurde nicht freigegeben. Sie können den Zugriff in den App-Einstellungen erlauben.",
                (await getPermissionStatus("microphone")).status,
              );
          }
          if (cancelled) return;
          if (!(await App.getState()).isActive)
            throw new DeviceAccessError(
              "cancelled",
              "Kehren Sie zur App zurück, um eine Aufnahme zu starten.",
            );
          await CapacitorAudioRecorder.startRecording({
            bitRate: 64_000,
            sampleRate: 44_100,
          });
          started = true;
          if (cancelled) {
            await cancel();
            return;
          }
          if (!(await App.getState()).isActive) {
            await cancel();
            throw new DeviceAccessError(
              "cancelled",
              "Die Aufnahme wurde beim Verlassen der App verworfen.",
            );
          }
        } else {
          if (
            !navigator.mediaDevices?.getUserMedia ||
            typeof MediaRecorder === "undefined"
          )
            throw new DeviceAccessError(
              "unavailable",
              "Dieser Browser unterstützt keine Audioaufnahme. Nutzen Sie einen aktuellen Browser mit HTTPS.",
            );
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          if (cancelled) {
            release();
            return;
          }
          if (document.visibilityState === "hidden") {
            release();
            throw new DeviceAccessError(
              "cancelled",
              "Kehren Sie zur App zurück, um eine Aufnahme zu starten.",
            );
          }
          const type = [
            "audio/mp4",
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
          ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
          recorder = new MediaRecorder(
            stream,
            type ? { mimeType: type, audioBitsPerSecond: 64_000 } : undefined,
          );
          recorder.ondataavailable = (event) => {
            if (!cancelled && event.data.size) chunks.push(event.data);
          };
          recorder.onerror = () => {
            void cancel().finally(() =>
              onInterrupted(
                "Die Aufnahme wurde unterbrochen. Bitte erneut aufnehmen.",
              ),
            );
          };
          stream.getAudioTracks().forEach((track) =>
            track.addEventListener(
              "ended",
              () => {
                if (started)
                  void cancel().finally(() =>
                    onInterrupted(
                      "Das Mikrofon ist nicht mehr verfügbar. Die Aufnahme wurde verworfen.",
                    ),
                  );
              },
              { once: true },
            ),
          );
          recorder.start(1000);
          started = true;
        }
        // Also enforce the limit when a view timer is suspended.
        limitTimer = setTimeout(
          () => {
            void cancel().finally(() =>
              onInterrupted(
                "Die maximale Aufnahmedauer von zwei Minuten wurde erreicht. Die Aufnahme wurde verworfen; bitte nehmen Sie eine kürzere Nachricht auf.",
              ),
            );
          },
          (maxRecordingSeconds + 1) * 1000,
        );
      } catch (error) {
        if (native && started) await cancel();
        release();
        if (error instanceof DeviceAccessError) throw error;
        if (
          error instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(error.name)
        )
          throw new DeviceAccessError(
            "permission",
            "Der Mikrofonzugriff wurde abgelehnt. Erlauben Sie ihn in den Website-Einstellungen.",
            "denied",
          );
        throw new DeviceAccessError(
          "unavailable",
          "Die Audioaufnahme konnte nicht gestartet werden. Prüfen Sie, ob eine andere App das Mikrofon verwendet.",
        );
      }
    },
    async stop(): Promise<File> {
      if (!started || cancelled)
        throw new DeviceAccessError(
          "cancelled",
          "Die Aufnahme wurde abgebrochen.",
        );
      clearTimeout(limitTimer);
      if (native) {
        let result;
        try {
          result = await CapacitorAudioRecorder.stopRecording();
        } catch (error) {
          await cancel();
          throw error;
        } finally {
          started = false;
        }
        if (!result.uri)
          throw new DeviceAccessError(
            "file",
            "Die Aufnahme konnte nicht gelesen werden.",
          );
        try {
          const response = await fetch(Capacitor.convertFileSrc(result.uri));
          if (!response.ok)
            throw new DeviceAccessError(
              "file",
              "Die Aufnahme konnte nicht gelesen werden.",
            );
          const blob = await response.blob();
          if (cancelled)
            throw new DeviceAccessError(
              "cancelled",
              "Die Aufnahme wurde abgebrochen.",
            );
          // Both native implementations write MPEG-4/AAC containers (.m4a).
          return audioFile(new Blob([blob], { type: "audio/mp4" }));
        } finally {
          await Filesystem.deleteFile({ path: result.uri });
        }
      }
      const activeRecorder = recorder!;
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          activeRecorder.onstop = () =>
            resolve(new Blob(chunks, { type: activeRecorder.mimeType }));
          activeRecorder.onerror = () =>
            reject(
              new DeviceAccessError(
                "file",
                "Die Aufnahme konnte nicht abgeschlossen werden.",
              ),
            );
          activeRecorder.stop();
        });
        if (cancelled)
          throw new DeviceAccessError(
            "cancelled",
            "Die Aufnahme wurde abgebrochen.",
          );
        return audioFile(blob);
      } finally {
        started = false;
        release();
        chunks = [];
      }
    },
    cancel,
  };
}
