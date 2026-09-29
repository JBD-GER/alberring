import { useEffect, useId, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorAudioRecorder } from "@capgo/capacitor-audio-recorder";
import {
  Camera,
  ChevronDown,
  Image as ImageIcon,
  MapPin,
  Mic,
  Square,
  X,
} from "lucide-react";
import {
  createAudioRecording,
  maxRecordingSeconds,
} from "../../services/platform/audio";
import {
  formatLocationMessage,
  getCurrentLocation,
} from "../../services/platform/location";
import { pickPhoto } from "../../services/platform/media";
import {
  deviceErrorMessage,
  openAppSettings,
} from "../../services/platform/permissions";
import "./device-actions.css";

export function DeviceError({ message }: { message: string }) {
  const [settingsError, setSettingsError] = useState("");
  if (!message) return null;
  return (
    <div className="device-error" role="alert">
      <span>{message}</span>
      {Capacitor.isNativePlatform() ? (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            void openAppSettings().catch(() =>
              setSettingsError(
                "Die App-Einstellungen konnten nicht geöffnet werden. Öffnen Sie die Einstellungen Ihres Geräts.",
              ),
            )
          }
        >
          App-Einstellungen öffnen
        </button>
      ) : (
        <small>
          Berechtigungen verwalten Sie über das Symbol neben der Browseradresse.
        </small>
      )}
      {settingsError && <span>{settingsError}</span>}
    </div>
  );
}

export function PhotoActions({
  onSelect,
  disabled = false,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = async (source: "camera" | "photos") => {
    setError("");
    setBusy(true);
    try {
      const photo = await pickPhoto(source);
      if (photo && mounted.current) onSelect(photo);
    } catch (err) {
      if (mounted.current) setError(deviceErrorMessage(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="device-photo-actions">
      <p>
        Wählen Sie ein einzelnes Foto oder nehmen Sie eines auf. Das Foto wird
        erst mit dem Formular gesendet; eingebettete Standortdaten werden
        entfernt.
      </p>
      <div className="device-action-buttons">
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy}
          onClick={() => void choose("camera")}
        >
          <Camera size={18} /> Foto aufnehmen
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy}
          onClick={() => void choose("photos")}
        >
          <ImageIcon size={18} /> Foto auswählen
        </button>
      </div>
      {busy && <span role="status">Foto wird vorbereitet …</span>}
      <DeviceError message={error} />
    </div>
  );
}

export function AudioPreview({ file }: { file: File }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  useEffect(() => {
    const value = URL.createObjectURL(file);
    if (audio.current) audio.current.src = value;
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return (
    <>
      <audio
        ref={audio}
        className="device-audio"
        controls
        preload="metadata"
        aria-label="Sprachnachricht vor dem Senden anhören"
        onError={() => setFailedFile(file)}
      />
      {failedFile === file && (
        <p className="device-error" role="alert">
          Dieses Audioformat kann auf diesem Gerät nicht wiedergegeben werden.
          Sie können die Aufnahme entfernen und erneut aufnehmen.
        </p>
      )}
    </>
  );
}

export function ChatDeviceActions({
  onFile,
  onLocation,
  disabled = false,
}: {
  onFile: (file: File) => void;
  onLocation: (text: string) => void;
  disabled?: boolean;
}) {
  const toolsId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const session = useRef<ReturnType<typeof createAudioRecording> | null>(null);
  const alive = useRef(true);
  const operation = useRef(0);
  const recordingStarted = useRef(false);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  const discard = async (message = "") => {
    operation.current += 1;
    const current = session.current;
    session.current = null;
    recordingStarted.current = false;
    try {
      await current?.cancel();
    } catch {
      if (alive.current)
        setError(
          "Die Aufnahme konnte nicht ordnungsgemäß beendet werden. Bitte schließen Sie die App.",
        );
    } finally {
      if (alive.current) {
        setRecording(false);
        setBusy(false);
        setNotice(message);
      }
    }
  };
  const discardRef = useRef(discard);
  discardRef.current = discard;

  useEffect(() => {
    alive.current = true;
    const background = () => {
      if (recordingStarted.current)
        void discardRef.current(
          "Die Aufnahme wurde beim Verlassen der App verworfen.",
        );
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") background();
    };
    document.addEventListener("visibilitychange", visibility);
    const listeners = Capacitor.isNativePlatform()
      ? [
          App.addListener("appStateChange", ({ isActive }) => {
            if (!isActive) background();
          }),
          CapacitorAudioRecorder.addListener("recordingPaused", () => {
            if (recordingStarted.current)
              void discardRef.current(
                "Die Aufnahme wurde unterbrochen und verworfen. Bitte erneut aufnehmen.",
              );
          }),
          CapacitorAudioRecorder.addListener("recordingError", () => {
            if (recordingStarted.current)
              void discardRef.current(
                "Das Mikrofon ist nicht mehr verfügbar. Die Aufnahme wurde verworfen.",
              );
          }),
        ].map((listener) => listener.catch(() => null))
      : [];
    return () => {
      alive.current = false;
      void discardRef.current();
      document.removeEventListener("visibilitychange", visibility);
      listeners.forEach(
        (listener) =>
          void listener
            .then((handle) => handle?.remove())
            .catch(() => undefined),
      );
    };
  }, []);

  const stop = async () => {
    const current = session.current;
    if (!current) return;
    const token = operation.current;
    setBusy(true);
    recordingStarted.current = false;
    try {
      const file = await current.stop();
      if (alive.current && operation.current === token) {
        onFileRef.current(file);
        setNotice(
          "Aufnahme bereit. Hören Sie sie an und senden Sie sie anschließend bewusst ab.",
        );
      }
    } catch (err) {
      if (alive.current && operation.current === token)
        setError(deviceErrorMessage(err));
    } finally {
      if (session.current === current) session.current = null;
      if (alive.current) {
        setRecording(false);
        setBusy(false);
      }
    }
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.min(
        maxRecordingSeconds,
        Math.floor((Date.now() - start) / 1000),
      );
      setSeconds(elapsed);
      if (elapsed >= maxRecordingSeconds) {
        window.clearInterval(timer);
        void stopRef.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const start = async () => {
    const token = ++operation.current;
    const current = createAudioRecording();
    session.current = current;
    setError("");
    setNotice("");
    setBusy(true);
    setSeconds(0);
    try {
      await current.start((message) => {
        if (alive.current) {
          setError(message);
          setRecording(false);
          setBusy(false);
          recordingStarted.current = false;
        }
      });
      if (!alive.current || operation.current !== token) {
        await current.cancel();
        return;
      }
      recordingStarted.current = true;
      setRecording(true);
    } catch (err) {
      if (alive.current && operation.current === token)
        setError(deviceErrorMessage(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const locate = async () => {
    const token = ++operation.current;
    setBusy(true);
    setError("");
    setNotice("Standort wird einmalig ermittelt …");
    try {
      const position = await getCurrentLocation();
      if (alive.current && operation.current === token) {
        onLocation(formatLocationMessage(position));
        setNotice(
          `${position.precise ? "Standort" : "Ungefährer Standort"} als Entwurf eingefügt. Genauigkeit ca. ${Math.round(position.accuracy)} m. Prüfen Sie ihn vor dem Senden.`,
        );
      }
    } catch (err) {
      if (alive.current && operation.current === token) {
        setError(deviceErrorMessage(err));
        setNotice("");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="chat-device-actions">
      <button
        type="button"
        className="device-tools-toggle"
        aria-expanded={open}
        aria-controls={toolsId}
        aria-label={`Foto, Standort oder Sprachnachricht ${open ? "schließen" : "hinzufügen"}`}
        onClick={() => setOpen(!open)}
        disabled={recording || busy}
      >
        <span>Foto, Standort &amp; Audio</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="device-tools" id={toolsId}>
          <PhotoActions
            onSelect={onFile}
            disabled={disabled || busy || recording}
          />
          <p>
            Ihr Standort wird nur auf Ihren Wunsch einmalig ermittelt und erst
            beim Senden mit diesem Chat geteilt. Ohne Internet kann GPS
            funktionieren; zum Senden ist eine Verbindung erforderlich.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={disabled || busy || recording}
            onClick={() => void locate()}
          >
            <MapPin size={18} /> Standort zum Entwurf hinzufügen
          </button>
          <p>
            Eine Sprachnachricht startet erst mit „Aufnahme starten“. Maximal
            zwei Minuten. Beim App-Wechsel wird sie verworfen.
          </p>
          {recording ? (
            <div className="device-action-buttons">
              <span className="recording-indicator" role="status">
                Aufnahme läuft · {seconds} / 120 s
              </span>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void stop()}
              >
                <Square size={17} /> Aufnahme stoppen
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void discard("Die Aufnahme wurde verworfen.")}
              >
                <X size={17} /> Verwerfen
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={disabled || busy}
              onClick={() => void start()}
            >
              <Mic size={18} /> Aufnahme starten
            </button>
          )}
          {busy && <span role="status">Gerätefunktion wird vorbereitet …</span>}
          {notice && <p role="status">{notice}</p>}
          <DeviceError message={error} />
        </div>
      )}
    </div>
  );
}
