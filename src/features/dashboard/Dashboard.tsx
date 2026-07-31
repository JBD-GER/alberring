import {
  ArrowRight,
  Bell,
  CalendarDays,
  Car,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  MessageCircle,
  Newspaper,
  Package,
  Umbrella,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../../lib/supabase";

const actions = [
  {
    to: "/app/messages",
    label: "Nachricht schreiben",
    icon: MessageCircle,
    permission: "messages.use",
  },
  {
    to: "/app/sick-leave",
    label: "Krankmeldung",
    icon: CalendarDays,
    permission: "sick_leave.create_own",
  },
  {
    to: "/app/leave",
    label: "Urlaub beantragen",
    icon: Umbrella,
    permission: "leave.create_own",
  },
  {
    to: "/app/fleet",
    label: "Kilometerstand",
    icon: Car,
    permission: "mileage.submit_own",
  },
  {
    to: "/app/material-requests",
    label: "Material anfordern",
    icon: Package,
    permission: "materials.create_own",
  },
];
type Shift = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  teams: { name: string } | null;
};
type DashboardData = {
  shift: Shift | null;
  news: {
    id: string;
    title: string;
    summary: string;
    priority: string;
    acknowledgement_required: boolean;
    news_reads: Array<{ acknowledged_at: string | null }>;
  } | null;
  unread: number;
  messagesUnread: number;
  leave: { status: string; starts_on: string; ends_on: string } | null;
  approvals: number;
};

export function Dashboard() {
  const { appSession, has } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", appSession?.profile.id],
    enabled: Boolean(appSession),
    queryFn: async () => {
      if (!appSession) throw new Error("Sitzung fehlt");
      const now = new Date().toISOString(),
        canApprove = has("leave.approve") || has("leave.manage");
      const results = await Promise.all([
        supabase
          .from("shifts")
          .select(
            "id,title,starts_at,ends_at,status,teams(name),shift_assignments!inner(profile_id)",
          )
          .eq("shift_assignments.profile_id", appSession.profile.id)
          .gte("starts_at", now)
          .in("status", ["published", "changed"])
          .order("starts_at")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("news_posts")
          .select(
            "id,title,summary,priority,acknowledgement_required,news_reads(acknowledged_at,profile_id)",
          )
          .eq("status", "published")
          .eq("news_reads.profile_id", appSession.profile.id)
          .lte("published_at", now)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
        supabase
          .from("leave_requests")
          .select("status,starts_on,ends_on")
          .eq("profile_id", appSession.profile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        canApprove
          ? supabase
              .from("leave_requests")
              .select("id", { count: "exact", head: true })
              .in("status", ["submitted", "review"])
          : Promise.resolve({ count: 0, error: null }),
        has("messages.use")
          ? supabase.rpc("list_conversations")
          : Promise.resolve({ data: [], error: null }),
      ]);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      return {
        shift: (results[0].data as unknown as Shift | null) ?? null,
        news: (results[1].data as unknown as DashboardData["news"]) ?? null,
        unread: results[2].count ?? 0,
        leave: (results[3].data as DashboardData["leave"]) ?? null,
        approvals: results[4].count ?? 0,
        messagesUnread: (
          (results[5].data ?? []) as Array<{ unread_count: number }>
        ).reduce(
          (sum, conversation) => sum + Number(conversation.unread_count),
          0,
        ),
      } satisfies DashboardData;
    },
  });
  const hour = new Date().getHours(),
    greeting =
      hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend";
  const visibleActions = actions.filter((action) => has(action.permission));
  const firstName = appSession?.profile.display_name.split(" ")[0];
  const canApprove = has("leave.approve") || has("leave.manage");
  const openItems =
    (data?.messagesUnread ?? 0) + (data?.unread ?? 0) + (data?.approvals ?? 0);
  return (
    <div className="page-stack dashboard-page">
      <section className="dashboard-welcome" aria-labelledby="welcome-title">
        <div>
          <span className="dashboard-date">
            {format(new Date(), "EEEE, dd. MMMM yyyy", { locale: de })}
          </span>
          <h2 id="welcome-title">
            {greeting}, {firstName}.
          </h2>
          <p>Ihr Arbeitstag in der ambulanten Pflege auf einen Blick.</p>
        </div>
        {!isLoading && !error && (
          <div
            className={`dashboard-ready ${openItems > 0 ? "has-open-items" : ""}`}
          >
            {openItems > 0 ? (
              <Bell aria-hidden="true" />
            ) : (
              <CircleCheck aria-hidden="true" />
            )}
            <span>
              <strong>
                {openItems > 0
                  ? `${openItems} ${openItems === 1 ? "Punkt" : "Punkte"} offen`
                  : "Alles erledigt"}
              </strong>
              <small>
                {openItems > 0
                  ? "Bitte kurz prüfen"
                  : "Sie sind auf dem aktuellen Stand"}
              </small>
            </span>
          </div>
        )}
      </section>

      {isLoading ? (
        <div
          className="dashboard-skeleton"
          aria-label="Tagesübersicht wird geladen"
        >
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="alert error">
          Der persönliche Überblick konnte nicht vollständig geladen werden.
        </div>
      ) : (
        <section
          className="dashboard-priority-grid"
          aria-label="Ihre Tagesübersicht"
        >
          <article className="dashboard-card dashboard-shift-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-kicker">Als Nächstes</span>
                <h2>Nächster Dienst</h2>
              </div>
              <span className="dashboard-card-icon" aria-hidden="true">
                <CalendarDays />
              </span>
            </div>
            {data?.shift ? (
              <div className="dashboard-shift">
                <time
                  className="dashboard-date-tile"
                  dateTime={data.shift.starts_at}
                >
                  <span>
                    {format(new Date(data.shift.starts_at), "EEE", {
                      locale: de,
                    })}
                  </span>
                  <strong>
                    {format(new Date(data.shift.starts_at), "dd")}
                  </strong>
                  <small>
                    {format(new Date(data.shift.starts_at), "MMM", {
                      locale: de,
                    })}
                  </small>
                </time>
                <div className="dashboard-shift-details">
                  <span className="dashboard-shift-time">
                    <Clock3 aria-hidden="true" />
                    {format(new Date(data.shift.starts_at), "HH:mm")}–
                    {format(new Date(data.shift.ends_at), "HH:mm")} Uhr
                  </span>
                  <h3>{data.shift.title}</h3>
                  <p>
                    {data.shift.teams?.name
                      ? data.shift.teams.name
                      : "Persönlicher Dienstplan"}
                  </p>
                  <span
                    className={`status ${
                      data.shift.status === "changed" ? "warning" : "success"
                    }`}
                  >
                    {data.shift.status === "published"
                      ? "Bestätigter Plan"
                      : "Plan wurde geändert"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="dashboard-empty-state">
                <span className="dashboard-empty-icon" aria-hidden="true">
                  <CircleCheck />
                </span>
                <div>
                  <h3>Kein kommender Dienst</h3>
                  <p>
                    Aktuell ist kein veröffentlichter Einsatz für Sie
                    eingetragen.
                  </p>
                </div>
              </div>
            )}
            <Link to="/app/schedule" className="dashboard-card-action">
              Dienstplan öffnen <ArrowRight aria-hidden="true" />
            </Link>
          </article>

          <aside className="dashboard-card dashboard-inbox-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-kicker">Im Blick behalten</span>
                <h2>Für Sie wichtig</h2>
              </div>
            </div>
            <div className="dashboard-inbox-list">
              {has("messages.use") && (
                <Link to="/app/messages" className="dashboard-inbox-row">
                  <span className="dashboard-row-icon" aria-hidden="true">
                    <MessageCircle />
                  </span>
                  <span>
                    <strong>Nachrichten</strong>
                    <small>
                      {data?.messagesUnread
                        ? "Neue Chat-Nachrichten"
                        : "Keine ungelesenen Chats"}
                    </small>
                  </span>
                  <span
                    className={`dashboard-count ${
                      data?.messagesUnread ? "" : "is-empty"
                    }`}
                    aria-label={`${data?.messagesUnread ?? 0} ungelesene Nachrichten`}
                  >
                    {data?.messagesUnread ?? 0}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              )}
              <Link to="/app/notifications" className="dashboard-inbox-row">
                <span className="dashboard-row-icon" aria-hidden="true">
                  <Bell />
                </span>
                <span>
                  <strong>Hinweise</strong>
                  <small>
                    {data?.unread
                      ? "Neue interne Hinweise"
                      : "Keine neuen Hinweise"}
                  </small>
                </span>
                <span
                  className={`dashboard-count ${data?.unread ? "" : "is-empty"}`}
                  aria-label={`${data?.unread ?? 0} ungelesene Hinweise`}
                >
                  {data?.unread ?? 0}
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
              {canApprove && (
                <Link to="/app/admin/leave" className="dashboard-inbox-row">
                  <span className="dashboard-row-icon" aria-hidden="true">
                    <ClipboardCheck />
                  </span>
                  <span>
                    <strong>Freigaben</strong>
                    <small>
                      {data?.approvals
                        ? "Urlaubsanträge warten"
                        : "Keine offenen Anträge"}
                    </small>
                  </span>
                  <span
                    className={`dashboard-count ${
                      data?.approvals ? "" : "is-empty"
                    }`}
                    aria-label={`${data?.approvals ?? 0} offene Freigaben`}
                  >
                    {data?.approvals ?? 0}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              )}
            </div>
          </aside>
        </section>
      )}

      <section className="dashboard-section" aria-labelledby="quick-title">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-card-kicker">Direkter Zugriff</span>
            <h2 id="quick-title">Schnell erledigt</h2>
          </div>
        </div>
        <div className="dashboard-quick-grid">
          {visibleActions.map(({ to, label, icon: Icon }) => (
            <Link to={to} key={to} className="quick-action">
              <span className="quick-action-icon" aria-hidden="true">
                <Icon />
              </span>
              <span>{label}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {!isLoading && !error && (
        <section className="dashboard-info-grid" aria-label="Weitere Übersicht">
          <article className="dashboard-card dashboard-info-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-kicker">Aktuell</span>
                <h2>Interne Mitteilung</h2>
              </div>
              <span className="dashboard-card-icon" aria-hidden="true">
                <Newspaper />
              </span>
            </div>
            {data?.news ? (
              <div className="dashboard-news">
                {data.news.acknowledgement_required &&
                  !data.news.news_reads[0]?.acknowledged_at && (
                    <span className="status warning">Bestätigung offen</span>
                  )}
                <h3>{data.news.title}</h3>
                <p>{data.news.summary}</p>
              </div>
            ) : (
              <div className="dashboard-empty-copy">
                <h3>Keine neue Mitteilung</h3>
                <p>Veröffentlichte Informationen erscheinen hier.</p>
              </div>
            )}
            <Link
              to={data?.news ? `/app/news/${data.news.id}` : "/app/news"}
              className="dashboard-card-action"
            >
              News öffnen <ArrowRight aria-hidden="true" />
            </Link>
          </article>

          {data?.leave && (
            <article className="dashboard-card dashboard-info-card">
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-card-kicker">Mein Antrag</span>
                  <h2>Urlaub</h2>
                </div>
                <span className="dashboard-card-icon" aria-hidden="true">
                  <Umbrella />
                </span>
              </div>
              <div className="dashboard-leave">
                <span>Beantragter Zeitraum</span>
                <strong className="dashboard-leave-dates">
                  {format(
                    new Date(`${data.leave.starts_on}T12:00:00`),
                    "dd. MMMM",
                    { locale: de },
                  )}
                  {" – "}
                  {format(
                    new Date(`${data.leave.ends_on}T12:00:00`),
                    "dd. MMMM yyyy",
                    { locale: de },
                  )}
                </strong>
                <span className="status info">
                  {leaveStatus(data.leave.status)}
                </span>
              </div>
              <Link to="/app/leave" className="dashboard-card-action">
                Anträge öffnen <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          )}
        </section>
      )}
    </div>
  );
}
const leaveStatus = (status: string) =>
  ({
    submitted: "Eingereicht",
    review: "In Prüfung",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
    withdrawn: "Zurückgezogen",
    cancelled: "Storniert",
  })[status] ?? status;
