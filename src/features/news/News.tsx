import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Check,
  CircleAlert,
  Newspaper,
  Pencil,
  Plus,
  Send,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type NewsPost = {
  id: string;
  title: string;
  summary: string;
  body: string;
  status: "draft" | "scheduled" | "published" | "archived";
  priority: "normal" | "important" | "critical";
  published_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
  acknowledgement_required: boolean;
  author_id: string;
  created_at: string;
  profiles: { display_name: string } | null;
  news_reads: Array<{ opened_at: string; acknowledged_at: string | null }>;
  news_audiences: Array<{ audience_type: string; team_id: string | null }>;
};

export function NewsFeed() {
  const { has, appSession } = useAuth();
  const [editor, setEditor] = useState(false);
  const [statusFilter, setStatusFilter] = useState("current");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const canWrite = has("news.create");
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["news"],
    queryFn: async () => {
      let query = supabase
        .from("news_posts")
        .select(
          "id,title,summary,body,status,priority,published_at,scheduled_for,expires_at,acknowledgement_required,author_id,created_at,profiles!news_posts_author_id_fkey(display_name),news_reads(opened_at,acknowledged_at,profile_id),news_audiences(audience_type,team_id)",
        )
        .order("published_at", { ascending: false, nullsFirst: false });
      if (appSession)
        query = query.eq("news_reads.profile_id", appSession.profile.id);
      if (!has("news.manage") && !has("news.create"))
        query = query.eq("status", "published");
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as NewsPost[];
    },
  });
  const filtered = data.filter(
    (post) =>
      (statusFilter === "all" ||
        (statusFilter === "current" && post.status !== "archived") ||
        post.status === statusFilter) &&
      (priorityFilter === "all" || post.priority === priorityFilter),
  );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>News und Mitteilungen</h2>
          <p>Offizielle Informationen für Ihr Alberring-Team.</p>
        </div>
        {canWrite && (
          <button
            className="primary compact"
            onClick={() => setEditor((v) => !v)}
          >
            <Plus /> Mitteilung erstellen
          </button>
        )}
      </section>
      {editor && <NewsEditor onClose={() => setEditor(false)} />}{" "}
      <div className="news-filters">
        {(has("news.manage") || has("news.create")) && (
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="current">Aktuelle</option>
              <option value="all">Alle</option>
              <option value="draft">Entwürfe</option>
              <option value="scheduled">Geplant</option>
              <option value="archived">Archiv</option>
            </select>
          </label>
        )}
        <label>
          <span>Priorität</span>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">Alle</option>
            <option value="normal">Information</option>
            <option value="important">Wichtig</option>
            <option value="critical">Kritisch</option>
          </select>
        </label>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorBox />
      ) : filtered.length === 0 ? (
        <section className="empty">
          <div className="empty-icon">
            <Newspaper />
          </div>
          <h3>Noch keine Mitteilungen</h3>
          <p>Veröffentlichte Informationen erscheinen hier.</p>
        </section>
      ) : (
        <div className="news-grid">
          {filtered.map((post) => (
            <Link
              className={`news-card priority-${post.priority}`}
              to={`/app/news/${post.id}`}
              key={post.id}
            >
              <div className="news-card-top">
                <span
                  className={`status ${post.priority === "critical" ? "danger" : post.priority === "important" ? "warning" : "info"}`}
                >
                  {post.priority === "critical"
                    ? "Kritisch"
                    : post.priority === "important"
                      ? "Wichtig"
                      : "Information"}
                </span>
                {post.status !== "published" && (
                  <span className="status neutral">
                    {post.status === "draft"
                      ? "Entwurf"
                      : post.status === "scheduled"
                        ? "Geplant"
                        : "Archiviert"}
                  </span>
                )}
              </div>
              <h3>{post.title}</h3>
              <p>{post.summary}</p>
              <footer>
                <span>
                  <Calendar />
                  {format(
                    new Date(
                      post.published_at ??
                        post.scheduled_for ??
                        post.created_at,
                    ),
                    "dd.MM.yyyy",
                    { locale: de },
                  )}
                </span>
                {post.acknowledgement_required &&
                  !post.news_reads[0]?.acknowledged_at && (
                    <strong>
                      <CircleAlert /> Bestätigung offen
                    </strong>
                  )}
              </footer>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsEditor({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: NewsPost;
}) {
  const { has } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const { data: teams = [] } = useQuery({
    queryKey: ["news-target-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });
  const mutation = useMutation({
    mutationFn: async (input: { form: HTMLFormElement; action: string }) => {
      const fd = new FormData(input.form),
        teamId = String(fd.get("teamId") ?? "");
      const { error } = await supabase.rpc("save_news_post", {
        p_title: String(fd.get("title")).trim(),
        p_summary: String(fd.get("summary")).trim(),
        p_body: String(fd.get("body")).trim(),
        p_priority: String(fd.get("priority")),
        p_ack_required: fd.get("ack") === "on",
        p_action: input.action,
        p_team_id: teamId || null,
        p_news_id: initial?.id ?? null,
        p_scheduled_for: fd.get("scheduledFor")
          ? new Date(String(fd.get("scheduledFor"))).toISOString()
          : null,
        p_expires_at: fd.get("expiresAt")
          ? new Date(String(fd.get("expiresAt"))).toISOString()
          : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["news"] });
      if (initial)
        void client.invalidateQueries({ queryKey: ["news", initial.id] });
      onClose();
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen."),
  });
  return (
    <section className="editor-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REDAKTION</span>
          <h2>{initial ? "Mitteilung bearbeiten" : "Neue Mitteilung"}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Editor schließen"
        >
          ×
        </button>
      </div>
      <form
        className="form two-column"
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          mutation.mutate({
            form: e.currentTarget,
            action: submitter?.value ?? "draft",
          });
        }}
      >
        <label className="full">
          Titel
          <input
            name="title"
            defaultValue={initial?.title}
            maxLength={160}
            required
          />
        </label>
        <label className="full">
          Kurzbeschreibung
          <textarea
            name="summary"
            defaultValue={initial?.summary}
            maxLength={300}
            rows={2}
            required
          />
        </label>
        <label className="full">
          Inhalt
          <textarea
            name="body"
            defaultValue={initial?.body}
            maxLength={20000}
            rows={7}
            required
          />
        </label>
        <label>
          Priorität
          <select name="priority" defaultValue={initial?.priority ?? "normal"}>
            <option value="normal">Normal</option>
            <option value="important">Wichtig</option>
            <option value="critical">Kritisch</option>
          </select>
        </label>
        <label>
          Zielgruppe
          <select
            name="teamId"
            defaultValue={
              initial?.news_audiences.find(
                (audience) => audience.audience_type === "team",
              )?.team_id ?? ""
            }
          >
            <option value="">Gesamte Organisation</option>
            {teams.map((team) => (
              <option value={team.id} key={team.id}>
                Team: {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Geplante Veröffentlichung
          <input
            type="datetime-local"
            name="scheduledFor"
            defaultValue={
              initial?.scheduled_for
                ? format(new Date(initial.scheduled_for), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
          />
        </label>
        <label>
          Sichtbar bis (optional)
          <input
            type="datetime-local"
            name="expiresAt"
            defaultValue={
              initial?.expires_at
                ? format(new Date(initial.expires_at), "yyyy-MM-dd'T'HH:mm")
                : ""
            }
          />
        </label>
        <label className="check full">
          <input
            type="checkbox"
            name="ack"
            defaultChecked={initial?.acknowledgement_required}
          />{" "}
          Lesebestätigung erforderlich
        </label>
        {error && <div className="alert error full">{error}</div>}
        <div className="form-actions full">
          <button
            type="submit"
            value={initial?.status === "published" ? "publish" : "draft"}
            className={
              initial?.status === "published" ? "primary" : "secondary"
            }
          >
            {initial?.status === "published"
              ? "Änderungen speichern"
              : "Als Entwurf speichern"}
          </button>
          {has("news.publish") && initial?.status !== "published" && (
            <button type="submit" value="schedule" className="secondary">
              <Calendar /> Planen
            </button>
          )}
          {has("news.publish") && initial?.status !== "published" && (
            <button type="submit" value="publish" className="primary">
              <Send /> Veröffentlichen
            </button>
          )}
          {initial && has("news.manage") && initial.status !== "archived" && (
            <button type="submit" value="archive" className="secondary">
              Archivieren
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export function NewsDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["news", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_posts")
        .select(
          "id,title,summary,body,status,priority,published_at,scheduled_for,expires_at,acknowledgement_required,author_id,created_at,profiles!news_posts_author_id_fkey(display_name),news_reads(opened_at,acknowledged_at),news_audiences(audience_type,team_id)",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as NewsPost;
    },
    enabled: Boolean(id),
  });
  const { data: readStats } = useQuery({
    queryKey: ["news-stats", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("news_read_stats", {
        p_news_id: id!,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as {
        target_count: number;
        opened_count: number;
        acknowledged_count: number;
      } | null;
    },
    enabled: Boolean(id) && has("news.manage"),
  });
  useQuery({
    queryKey: ["news-open", id],
    queryFn: async () => {
      if (!appSession || !id) return true;
      const { error } = await supabase.rpc("mark_news_opened", {
        p_news_id: id,
      });
      if (error) throw error;
      return true;
    },
    enabled: Boolean(data?.status === "published" && appSession),
  });
  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!appSession || !id) throw new Error();
      const { error } = await supabase.rpc("acknowledge_news", {
        p_news_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["news", id] });
      void client.invalidateQueries({ queryKey: ["news"] });
    },
  });
  if (isLoading) return <LoadingRows />;
  if (error || !data) return <ErrorBox />;
  const acknowledged = Boolean(data.news_reads[0]?.acknowledged_at);
  const canEdit =
    has("news.manage") ||
    (has("news.create") && data.author_id === appSession?.profile.id);
  return (
    <div className="page-stack">
      {editing && (
        <NewsEditor initial={data} onClose={() => setEditing(false)} />
      )}
      <article className="news-detail">
        <div className="news-detail-actions">
          <button className="back-link" onClick={() => nav("/app/news")}>
            <ArrowLeft /> Zurück zu News
          </button>
          {canEdit && (
            <button
              className="secondary compact"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil /> {editing ? "Editor schließen" : "Bearbeiten"}
            </button>
          )}
        </div>
        <header>
          <span
            className={`status ${data.priority === "critical" ? "danger" : data.priority === "important" ? "warning" : "info"}`}
          >
            {data.priority === "critical"
              ? "Kritisch"
              : data.priority === "important"
                ? "Wichtig"
                : "Information"}
          </span>
          <h2>{data.title}</h2>
          <p className="lead">{data.summary}</p>
          <div className="byline">
            {data.profiles?.display_name ?? "Alberring"} ·{" "}
            {format(
              new Date(data.published_at ?? data.created_at),
              "dd. MMMM yyyy, HH:mm",
              { locale: de },
            )}
            {data.status === "scheduled" && data.scheduled_for
              ? ` · geplant für ${format(new Date(data.scheduled_for), "dd.MM.yyyy, HH:mm")}`
              : ""}
          </div>
        </header>
        <div className="news-body">
          {data.body.split("\n").map((paragraph, index) => (
            <p key={index}>{paragraph || "\u00a0"}</p>
          ))}
        </div>
        {has("news.manage") && readStats && (
          <section className="news-read-stats" aria-label="Reichweite">
            <div>
              <strong>{readStats.target_count}</strong>
              <span>Zielpersonen</span>
            </div>
            <div>
              <strong>{readStats.opened_count}</strong>
              <span>Geöffnet</span>
            </div>
            <div>
              <strong>{readStats.acknowledged_count}</strong>
              <span>Bestätigt</span>
            </div>
          </section>
        )}
        {data.status === "published" && data.acknowledgement_required && (
          <footer className="ack-box">
            {acknowledged ? (
              <div className="ack-done">
                <Check /> Als gelesen bestätigt
              </div>
            ) : (
              <>
                <div>
                  <strong>Lesebestätigung erforderlich</strong>
                  <p>
                    Bitte bestätigen Sie, dass Sie diese Mitteilung gelesen
                    haben.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => acknowledge.mutate()}
                  disabled={acknowledge.isPending}
                >
                  <Check /> Als gelesen bestätigen
                </button>
              </>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="skeleton-list" aria-label="Wird geladen">
      <span />
      <span />
      <span />
    </div>
  );
}
function ErrorBox() {
  return (
    <section className="empty">
      <h3>Mitteilungen konnten nicht geladen werden</h3>
      <p>Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.</p>
    </section>
  );
}
