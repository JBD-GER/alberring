import { useEffect, useState } from "react";
import { Network } from "@capacitor/network";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
export function NetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [checking, setChecking] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    let disposed = false;
    const update = (connected: boolean) => {
      if (disposed) return;
      setOnline(connected);
      onlineManager.setOnline(connected);
    };
    const listener = Network.addListener("networkStatusChange", (s) =>
      update(s.connected),
    );
    void Network.getStatus()
      .then((s) => update(s.connected))
      .catch(() => update(navigator.onLine));
    return () => {
      disposed = true;
      void listener.then((l) => l.remove());
    };
  }, []);
  if (online) return null;
  return (
    <aside className="network-status" role="status">
      <span>
        Keine Internetverbindung. Änderungen können gerade nicht gesendet
        werden.
      </span>
      <button
        disabled={checking}
        onClick={async () => {
          setChecking(true);
          try {
            const { connected } = await Network.getStatus();
            setOnline(connected);
            onlineManager.setOnline(connected);
            if (connected) await client.invalidateQueries();
          } catch {
            setOnline(false);
          } finally {
            setChecking(false);
          }
        }}
      >
        {checking ? "Wird geprüft …" : "Erneut versuchen"}
      </button>
    </aside>
  );
}
