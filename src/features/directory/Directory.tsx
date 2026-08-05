import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, MapPin, MessageCircle, Search, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
type Employee = {
  id: string;
  display_name: string;
  email: string;
  work_phone: string | null;
  job_title: string | null;
  department_name: string | null;
  location_name: string | null;
  teams: Array<{ id: string; name: string; location_name: string | null }>;
};
export function Directory() {
  const { appSession, has } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory_entries", {
        p_search: null,
      });
      if (error) throw error;
      return data as unknown as Employee[];
    },
  });
  const start = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        "get_or_create_direct_conversation",
        { other_profile_id: id },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => nav(`/app/messages/${id}`),
  });
  const filtered = data.filter((p) =>
    `${p.display_name} ${p.job_title ?? ""} ${p.teams.map((t) => t.name).join(" ")}`
      .toLocaleLowerCase("de")
      .includes(search.toLocaleLowerCase("de")),
  );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Mitarbeiterverzeichnis</h2>
          <p>Dienstliche Kontakte innerhalb Ihrer Organisation.</p>
        </div>
      </section>
      <label className="search">
        <Search />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, Funktion oder Team …"
          aria-label="Mitarbeitende durchsuchen"
        />
      </label>
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="empty">
          <h3>Verzeichnis nicht verfügbar</h3>
          <p>Bitte laden Sie die Seite erneut.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <div className="empty-icon">
            <Users />
          </div>
          <h3>Keine Mitarbeitenden gefunden</h3>
          <p>Versuchen Sie einen anderen Suchbegriff.</p>
        </section>
      ) : (
        <div className="directory-grid">
          {filtered.map((person) => {
            const team = person.teams[0];
            return (
              <article className="person-card" key={person.id}>
                <div className="person-heading">
                  <span className="avatar large">
                    {person.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h3>{person.display_name}</h3>
                    <p>{person.job_title ?? "Mitarbeiter/in"}</p>
                  </div>
                </div>
                {team && (
                  <p className="person-meta">
                    <MapPin />
                    {team.name}
                    {team.location_name ? ` · ${team.location_name}` : ""}
                  </p>
                )}
                {has("directory.view") && (
                  <p className="person-meta">
                    <Mail />
                    {person.email}
                  </p>
                )}
                {person.id !== appSession?.profile.id &&
                  has("messages.use") && (
                    <button
                      className="secondary"
                      onClick={() => start.mutate(person.id)}
                      disabled={start.isPending}
                    >
                      <MessageCircle /> Nachricht schreiben
                    </button>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
