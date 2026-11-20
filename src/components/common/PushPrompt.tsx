import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../features/auth/AuthProvider";
import { authStorage } from "../../services/platform/storage";
import {
  enablePush,
  pushAvailable,
  pushEnabledForUser,
} from "../../services/platform/push";

export function PushPrompt() {
  const { session, has } = useAuth();
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userId = session?.user.id;
  const allowed = has("messages.use");
  const key = `alberring.push-prompt:${userId}`;
  useEffect(() => {
    let alive = true;
    if (pushAvailable && userId && allowed)
      void Promise.all([pushEnabledForUser(userId), authStorage.getItem(key)])
        .then(([enabled, deferred]) => {
          if (alive) setVisible(!enabled && !deferred);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, key, allowed]);
  if (!pushAvailable || !userId || !allowed || !visible) return null;
  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      await enablePush();
      await client.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      setVisible(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Push konnte nicht aktiviert werden.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="settings-card"
      aria-label="Chat-Mitteilungen aktivieren"
    >
      <h3>Neue Chatnachrichten nicht verpassen</h3>
      <p>
        Erhalten Sie einen Hinweis und ein Kennzeichen am App-Symbol, auch wenn
        Alberring geschlossen ist. Nachrichteninhalte bleiben in der App.
      </p>
      <div className="form-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void activate()}
        >
          {busy ? "Wird eingerichtet …" : "Chat-Push aktivieren"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void authStorage.setItem(key, "deferred").catch(() => {});
            setVisible(false);
          }}
        >
          Später in Einstellungen
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
