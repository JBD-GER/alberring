import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useAuth } from "../../features/auth/AuthProvider";
import {
  androidUpdatePortal,
  checkAndroidUpdate,
} from "../../services/platform/android-update";

const snoozeKey = "alberring.android-update.snooze";
function readSnooze(): { build: number; until: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem(snoozeKey) ?? "null");
    return Number.isSafeInteger(value?.build) && Number.isFinite(value?.until)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function AndroidUpdate() {
  const { session, appSession } = useAuth();
  const enabled =
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    !!session &&
    appSession?.profile.status === "active";
  const [snooze, setSnooze] = useState(readSnooze);
  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["android-release"],
    queryFn: checkAndroidUpdate,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: 60 * 60_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refetch();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [enabled, refetch]);

  if (
    !enabled ||
    !data ||
    (snooze?.build === data.build && dataUpdatedAt < snooze.until)
  )
    return null;
  const dismiss = () => {
    const next = { build: data.build, until: Date.now() + 24 * 60 * 60_000 };
    setSnooze(next);
    try {
      localStorage.setItem(snoozeKey, JSON.stringify(next));
    } catch {
      /* In-memory snooze still works. */
    }
  };
  return (
    <aside
      className="pwa-update android-update"
      role="status"
      aria-label="Android-Update"
    >
      <div>
        <strong>Update verfügbar: {data.version}</strong>
        <span>
          Laden Sie die neue Version herunter und bestätigen Sie die
          Installation. Ihre Daten bleiben erhalten.
        </span>
      </div>
      <a
        className="primary"
        href={androidUpdatePortal}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download aria-hidden="true" /> Update herunterladen
      </a>
      <button
        className="icon-button"
        onClick={dismiss}
        aria-label="Morgen erinnern"
      >
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
