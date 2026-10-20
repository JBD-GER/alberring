import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type DeletedMembership = {
  id: string;
  deleted_at: string;
  chat_count: number;
  team_count: number;
};

export function DeletedMemberships() {
  const { has } = useAuth();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["deleted-memberships"],
    enabled: has("users.manage") && expanded,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_list_deleted_memberships",
      );
      if (error) throw error;
      return data as DeletedMembership[];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_remove_deleted_memberships", {
        p_profile_id: id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "deleted-memberships",
          "conversations",
          "conversation",
          "admin-teams",
          "admin-team-people",
          "directory",
          "conversation-people",
        ].map((queryKey) => client.invalidateQueries({ queryKey: [queryKey] })),
      );
    },
  });
  if (!has("users.manage")) return null;
  return (
    <section className="settings-card">
      <button
        type="button"
        className="secondary"
        aria-expanded={expanded}
        aria-controls="deleted-memberships"
        onClick={() => setExpanded((value) => !value)}
      >
        Gelöschte Benutzer aus Gruppen entfernen
      </button>
      {expanded && (
        <div id="deleted-memberships" className="page-stack">
          <p>
            Hier können Sie verbliebene Gruppen- und Teamzuordnungen gelöschter
            Konten entfernen. Nachrichten, Vorgänge und vergangene
            Teamzuordnungen bleiben erhalten. Aktive und nur archivierte Konten
            werden nicht verändert.
          </p>
          {remove.isSuccess && (
            <div className="alert success" role="status">
              Gruppenzuordnungen entfernt. Der bisherige Verlauf bleibt
              erhalten.
            </div>
          )}
          {remove.error && (
            <div className="alert error" role="alert">
              Die Zuordnungen konnten nicht entfernt werden. Bitte erneut
              versuchen.
            </div>
          )}
          {query.isLoading ? (
            <p role="status">Zuordnungen werden geladen …</p>
          ) : query.error ? (
            <div className="alert error" role="alert">
              Die Liste konnte nicht geladen werden.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => void query.refetch()}
              >
                Erneut versuchen
              </button>
            </div>
          ) : query.data?.length ? (
            query.data.map((person) => (
              <article key={person.id} className="admin-user">
                <div>
                  <strong>Gelöschter Benutzer · {person.id.slice(0, 8)}</strong>
                  <p>
                    Gelöscht am{" "}
                    {new Date(person.deleted_at).toLocaleDateString("de-DE")} ·{" "}
                    {person.chat_count} Chatgruppen · {person.team_count}{" "}
                    Teamzuordnungen
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Dieses gelöschte Konto aus allen Chatgruppen und aktuellen Teams entfernen? Nachrichten und Vorgänge bleiben erhalten.",
                      )
                    )
                      remove.mutate(person.id);
                  }}
                >
                  {remove.isPending && remove.variables === person.id
                    ? "Wird entfernt …"
                    : "Aus Gruppen entfernen"}
                </button>
              </article>
            ))
          ) : (
            <p>
              Keine verbliebenen Gruppenzuordnungen gelöschter Konten vorhanden.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
