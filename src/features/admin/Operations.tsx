import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, Database, PlugZap, Search } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
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
type CurasoftStatus = {
  status: "not_configured" | "mapping_required";
  synchronizationEnabled: false;
  checks: {
    organization: boolean;
    environment: boolean;
    apiKey: boolean;
    accessKey: boolean;
  };
};
export function Integrations() {
  const { has } = useAuth();
  const status = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "curasoft-readiness",
        { body: {} },
      );
      if (error) throw error;
      return data as CurasoftStatus;
    },
  });
  if (!has("integrations.manage"))
    return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Integrationen</h2>
          <p>
            Verbindungen zu Ihrer Pflegesoftware und deren Einrichtungsstand.
          </p>
        </div>
      </section>
      <div className="integration-grid">
        <article>
          <span className="integration-icon">
            <Database />
          </span>
          <div>
            <h3>Alberring</h3>
            <p>
              Webanwendung, iOS und Android verwenden gemeinsam dieselben
              Mitarbeiterdaten und Vorgänge.
            </p>
            <span className="status success">Aktiv</span>
          </div>
        </article>
        <article>
          <span className="integration-icon">
            <PlugZap />
          </span>
          <div>
            <h3>CuraSoft / CuraGo</h3>
            <p>
              Die Anbindung ist vorbereitet. Es werden noch keine Daten mit
              CuraSoft ausgetauscht.
            </p>
            <span className="status neutral">Einrichtung ausstehend</span>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={status.isPending}
            onClick={() => status.mutate()}
          >
            {status.isPending ? "Wird geprüft …" : "Einrichtungsstand prüfen"}
          </button>
        </article>
      </div>
      {status.error && (
        <div className="alert error" role="alert">
          Der Einrichtungsstand konnte nicht abgefragt werden. Bitte erneut
          versuchen.
        </div>
      )}
      {status.data && (
        <div className="alert" role="status">
          {status.data.status === "mapping_required"
            ? "Die Zugangsdaten sind hinterlegt. Als Nächstes müssen die Datenzuordnung und der Datenaustausch mit CuraSoft im Testsystem abgestimmt und geprüft werden."
            : "Die Einrichtung ist noch nicht vollständig. Bitte lassen Sie die Freischaltung und die Zugangsdaten durch Ihre technische Betreuung hinterlegen."}
        </div>
      )}
      <section className="settings-card">
        <h3>Für die Anbindung benötigen wir</h3>
        <ul>
          <li>Eine freigeschaltete CuraGo-/REST-API für Ihren Betrieb.</li>
          <li>
            Die von CuraSoft bestätigte Kundenzuordnung und einen Testzugang.
          </li>
          <li>
            Einen API-Schlüssel und einen Zugriffsschlüssel mit den vereinbarten
            Berechtigungen.
          </li>
          <li>
            Eine Abstimmung, welche Mitarbeiterdaten und Urlaubsinformationen in
            welche Richtung übertragen werden sollen.
          </li>
        </ul>
        <p>
          Zugangsschlüssel werden durch die technische Betreuung geschützt auf
          dem Server hinterlegt. Bitte nicht per E-Mail versenden oder in die
          App eintragen.
        </p>
        <a
          href="https://docs.curasoft.dev/cura-go.de"
          target="_blank"
          rel="noreferrer"
        >
          Offizielle CuraSoft-API-Dokumentation
        </a>
      </section>
    </div>
  );
}
