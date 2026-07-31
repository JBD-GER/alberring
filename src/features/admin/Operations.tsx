import { useQuery } from "@tanstack/react-query";
import { Activity, Database, PlugZap, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
type Audit = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles: { display_name: string } | null;
};
export function AuditLog() {
  const { has } = useAuth();
  const [search, setSearch] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(
          "id,action,entity_type,entity_id,request_id,metadata,created_at,profiles!audit_logs_actor_id_fkey(display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as Audit[];
    },
    enabled: has("audit.view"),
  });
  if (!has("audit.view")) return <Navigate to="/app/dashboard" replace />;
  const shown = data.filter((row) =>
    `${row.action} ${row.entity_type} ${row.profiles?.display_name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Audit-Protokoll</h2>
          <p>
            Nachvollziehbare sicherheitsrelevante Aktionen ohne sensible
            Inhalte.
          </p>
        </div>
      </section>
      <label className="search">
        <Search />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Aktion oder Akteur …"
        />
      </label>
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="alert error">
          Audit-Daten konnten nicht geladen werden.
        </div>
      ) : (
        <div className="audit-list">
          {shown.map((row) => (
            <article key={row.id}>
              <span className="audit-icon">
                <Activity />
              </span>
              <div>
                <strong>{row.action}</strong>
                <p>
                  {row.entity_type}
                  {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}
                </p>
                <small>
                  {row.profiles?.display_name ?? "System"} ·{" "}
                  {format(new Date(row.created_at), "dd.MM.yyyy, HH:mm:ss")} ·
                  Request {row.request_id.slice(0, 8)}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
type Connection = {
  id: string;
  provider: "manual" | "careville";
  status: string;
  updated_at: string;
};
export function Integrations() {
  const { has } = useAuth();
  const [result, setResult] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_connections")
        .select("id,provider,status,updated_at")
        .order("provider");
      if (error) throw error;
      return data as Connection[];
    },
    enabled: has("integrations.manage"),
  });
  if (!has("integrations.manage"))
    return <Navigate to="/app/dashboard" replace />;
  const test = async (provider: string) => {
    if (provider === "manual") {
      setResult(
        "Der manuelle Provider ist aktiv und benötigt keine Verbindung.",
      );
      return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke(
      "careville-test-connection",
      { body: {} },
    );
    setResult(
      invokeError
        ? "Careville ist noch nicht konfiguriert. Offizielle API-Unterlagen und Zugangsdaten fehlen."
        : (data?.error?.message ?? "Verbindungstest abgeschlossen."),
    );
  };
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Integrationen</h2>
          <p>
            Externe Systeme werden ausschließlich über dokumentierte Adapter
            angebunden.
          </p>
        </div>
      </section>
      {result && <div className="alert">{result}</div>}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="alert error">
          Integrationen konnten nicht geladen werden.
        </div>
      ) : (
        <div className="integration-grid">
          {data.map((connection) => (
            <article key={connection.id}>
              <span className="integration-icon">
                {connection.provider === "manual" ? <Database /> : <PlugZap />}
              </span>
              <div>
                <h3>
                  {connection.provider === "manual"
                    ? "Manuelle Verwaltung"
                    : "Careville"}
                </h3>
                <p>
                  {connection.provider === "manual"
                    ? "Aktiver Standardprovider ohne externen Datenaustausch."
                    : "Vorbereitet; keine API-Endpunkte ohne offizielle Dokumentation."}
                </p>
                <span
                  className={`status ${connection.status === "active" ? "success" : "neutral"}`}
                >
                  {connection.status === "active"
                    ? "Aktiv"
                    : "Nicht konfiguriert"}
                </span>
              </div>
              <button
                className="secondary"
                onClick={() => void test(connection.provider)}
              >
                Verbindung testen
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="alert">
        <ShieldAlert /> Eine MediFox-Anbindung ist bewusst nicht implementiert.
      </div>
    </div>
  );
}
