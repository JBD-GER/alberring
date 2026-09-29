import { useEffect, useState } from "react";
import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  type PluginListenerHandle,
} from "@capacitor/core";
import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "../../app/router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { parseNativeLink } from "../../services/platform/links";
import {
  initializePush,
  restorePushForUser,
} from "../../services/platform/push";

export function PlatformRuntime() {
  const { session, sessionError } = useAuth();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [pushReady, setPushReady] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    let removePush = () => {};
    let handlingLink = false;
    const navigate = (path: string) => {
      if (!disposed) void router.navigate(path);
    };
    const handleUrl = async (url: string) => {
      if (handlingLink || disposed) return;
      const link = parseNativeLink(url);
      if (!link) return;
      handlingLink = true;
      try {
        if (link.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            link.code,
          );
          if (error) throw error;
        }
        navigate(link.path);
      } catch {
        if (!disposed)
          setNotice(
            "Der Anmeldelink ist ungültig, abgelaufen oder wurde auf einem anderen Gerät angefordert. Bitte fordern Sie ihn in dieser App erneut an.",
          );
      } finally {
        handlingLink = false;
      }
    };
    const add = async (promise: Promise<PluginListenerHandle>) => {
      const handle = await promise;
      if (disposed) await handle.remove();
      else handles.push(handle);
    };
    const initialize = async () => {
      document.documentElement.classList.add("native-app");
      await add(
        App.addListener("appUrlOpen", ({ url }) => {
          void handleUrl(url);
        }),
      );
      await add(
        App.addListener("appRestoredResult", ({ pluginId }) => {
          if (pluginId === "Camera" && !disposed)
            setNotice(
              "Die App wurde nach der Kameraaufnahme neu geöffnet. Bitte wählen Sie das Foto erneut aus und prüfen Sie es vor dem Senden.",
            );
        }),
      );
      await add(
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            supabase.auth.startAutoRefresh();
            window.dispatchEvent(new Event("focus"));
            void client.invalidateQueries();
          } else supabase.auth.stopAutoRefresh();
        }),
      );
      if (Capacitor.getPlatform() === "android") {
        await add(
          App.addListener("backButton", () => {
            const event = new Event("alberring:back", { cancelable: true });
            if (!window.dispatchEvent(event)) return;
            if (document.documentElement.classList.contains("keyboard-open")) {
              void Keyboard.hide();
              (document.activeElement as HTMLElement | null)?.blur();
              return;
            }
            const dialog =
              document.querySelector<HTMLDialogElement>("dialog[open]");
            if (dialog) {
              dialog.close();
              return;
            }
            const path = router.state.location.pathname;
            if (window.history.state?.idx > 0) void router.navigate(-1);
            else if (path !== "/app/dashboard" && path.startsWith("/app/"))
              navigate("/app/dashboard");
            else void App.minimizeApp();
          }),
        );
      }
      await add(
        Keyboard.addListener("keyboardDidShow", () =>
          document.documentElement.classList.add("keyboard-open"),
        ),
      );
      await add(
        Keyboard.addListener("keyboardDidHide", () =>
          document.documentElement.classList.remove("keyboard-open"),
        ),
      );
      await SystemBars.setStyle({ style: SystemBarsStyle.Light });
      await SplashScreen.hide();
      const launch = await App.getLaunchUrl();
      if (launch?.url) await handleUrl(launch.url);
      try {
        removePush = await initializePush(navigate, () => {
          void client.invalidateQueries({ queryKey: ["notifications"] });
        });
        if (disposed) removePush();
        else setPushReady(true);
      } catch {
        if (!disposed)
          setNotice(
            "Push ist noch nicht eingerichtet. Ihre In-App-Benachrichtigungen bleiben verfügbar.",
          );
      }
    };
    void initialize().catch(() => {
      if (!disposed)
        setNotice(
          "Eine Gerätefunktion konnte nicht gestartet werden. Bitte öffnen Sie die App erneut.",
        );
    });
    return () => {
      disposed = true;
      removePush();
      for (const handle of handles) void handle.remove();
      document.documentElement.classList.remove("keyboard-open");
    };
  }, [client]);
  useEffect(() => {
    if (!pushReady) return;
    void restorePushForUser(session?.user.id ?? null).catch(() =>
      setNotice(
        "Push konnte nicht erneuert werden. Aktivieren Sie es bei bestehender Verbindung erneut in den Einstellungen.",
      ),
    );
  }, [session?.user.id, pushReady]);
  const text = sessionError || notice;
  if (!text) return null;
  return (
    <aside className="runtime-notice" role="alert">
      <span>{text}</span>
      {!sessionError && (
        <button onClick={() => setNotice("")}>Schließen</button>
      )}
    </aside>
  );
}
