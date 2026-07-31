import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Circle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
type Notice = {
  id: string;
  type: string;
  title: string;
  body: string;
  target_path: string | null;
  read_at: string | null;
  created_at: string;
};
export function Notifications() {
  const { appSession } = useAuth();
  const client = useQueryClient();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,target_path,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Notice[];
    },
  });
  useEffect(() => {
    if (!appSession) return;
    const channel = supabase
      .channel(`notifications:${appSession.profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${appSession.profile.id}`,
        },
        () => {
          void client.invalidateQueries({ queryKey: ["notifications"] });
          void client.invalidateQueries({ queryKey: ["notification-count"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appSession, client]);
  const mark = useMutation({
    mutationFn: async (id?: string) => {
      if (!appSession) throw new Error();
      const { error } = id
        ? await supabase.rpc("mark_notification_read", {
            p_notification_id: id,
          })
        : await supabase.rpc("mark_all_notifications_read");
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications"] });
      void client.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });
  const unread = data.filter((n) => !n.read_at).length;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Benachrichtigungen</h2>
          <p>{unread ? `${unread} ungelesene Hinweise` : "Alles gelesen"}</p>
        </div>
        {unread > 0 && (
          <button
            className="secondary"
            onClick={() => mark.mutate(undefined)}
            disabled={mark.isPending}
          >
            <CheckCheck /> Alle als gelesen
          </button>
        )}
      </section>
      {mark.error && (
        <div className="alert error" role="alert">
          Der Lesestatus konnte nicht gespeichert werden.
        </div>
      )}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="empty">
          <h3>Benachrichtigungen nicht verfügbar</h3>
          <p>Bitte versuchen Sie es erneut.</p>
        </section>
      ) : data.length === 0 ? (
        <section className="empty">
          <div className="empty-icon">
            <Bell />
          </div>
          <h3>Keine neuen Benachrichtigungen</h3>
          <p>Aufgaben und wichtige Änderungen erscheinen hier.</p>
        </section>
      ) : (
        <div className="notification-list">
          {data.map((notice) => {
            const content = (
              <>
                <span className={`notice-dot ${notice.read_at ? "read" : ""}`}>
                  {notice.read_at ? <CheckCheck /> : <Circle />}
                </span>
                <span>
                  <strong>{notice.title}</strong>
                  <small>{notice.body}</small>
                  <time>
                    {formatDistanceToNow(new Date(notice.created_at), {
                      addSuffix: true,
                      locale: de,
                    })}
                  </time>
                </span>
                {notice.target_path && <ExternalLink />}
              </>
            );
            return notice.target_path ? (
              <Link
                key={notice.id}
                to={notice.target_path}
                className={`notice ${notice.read_at ? "read" : ""}`}
                onClick={() => !notice.read_at && mark.mutate(notice.id)}
              >
                {content}
              </Link>
            ) : (
              <button
                key={notice.id}
                className={`notice ${notice.read_at ? "read" : ""}`}
                onClick={() => !notice.read_at && mark.mutate(notice.id)}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
