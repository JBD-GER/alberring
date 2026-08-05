import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  Bell,
  CalendarDays,
  Car,
  FileText,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Newspaper,
  Package,
  Settings,
  ShieldCheck,
  Umbrella,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../features/auth/AuthProvider";
import { supabase } from "../lib/supabase";
const primary = [
  {
    to: "/app/dashboard",
    label: "Start",
    icon: Home,
    permission: "dashboard.view",
  },
  {
    to: "/app/messages",
    label: "Chat",
    icon: MessageCircle,
    permission: "messages.use",
  },
  {
    to: "/app/schedule",
    label: "Planung",
    icon: CalendarDays,
    permission: ["schedule.view_own", "schedule.view_team"],
  },
  {
    to: "/app/documents",
    label: "Dokumente",
    icon: FolderOpen,
    permission: [
      "documents.view_own",
      "documents.view_shared",
      "documents.manage",
    ],
  },
];
const more = [
  { to: "/app/news", label: "News", icon: Newspaper, permission: "news.view" },
  {
    to: "/app/leave",
    label: "Urlaub",
    icon: Umbrella,
    permission: [
      "leave.create_own",
      "leave.view_team",
      "leave.approve",
      "leave.manage",
    ],
  },
  {
    to: "/app/sick-leave",
    label: "Krankmeldung",
    icon: FileText,
    permission: [
      "sick_leave.create_own",
      "sick_leave.view_status",
      "sick_leave.manage",
    ],
  },
  {
    to: "/app/fleet",
    label: "Fuhrpark",
    icon: Car,
    permission: ["fleet.view_own", "fleet.view_all", "fleet.manage"],
  },
  {
    to: "/app/material-requests",
    label: "Material",
    icon: Package,
    permission: [
      "materials.create_own",
      "materials.view_team",
      "materials.manage",
      "materials.approve",
    ],
  },
  {
    to: "/app/directory",
    label: "Team",
    icon: Users,
    permission: "directory.view",
  },
  { to: "/app/settings", label: "Einstellungen", icon: Settings },
];
export function AppShell() {
  const { appSession, signOut, has } = useAuth();
  const loc = useLocation();
  const permitted = (permission?: string | string[]) =>
    !permission ||
    (Array.isArray(permission) ? permission.some(has) : has(permission));
  const visiblePrimary = primary.filter((n) => permitted(n.permission));
  const visibleMore = more.filter((n) => permitted(n.permission));
  const admin = [
    "users.view",
    "users.manage",
    "roles.view",
    "roles.manage",
    "teams.manage",
    "schedule.manage",
    "leave.approve",
    "leave.manage",
    "sick_leave.manage",
    "documents.manage",
    "fleet.manage",
    "materials.manage",
    "materials.approve",
    "audit.view",
    "integrations.manage",
    "settings.manage",
  ].some(has);
  const all = [
    ...visiblePrimary,
    ...visibleMore,
    ...(admin
      ? [{ to: "/app/admin", label: "Administration", icon: ShieldCheck }]
      : []),
  ];
  const label = loc.pathname.startsWith("/app/more")
    ? "Mehr"
    : (all.find(({ to }) => loc.pathname.startsWith(to))?.label ??
      "Alberring Mitarbeiter-App");
  const { data: unread = 0, refetch: refetchUnread } = useQuery({
    queryKey: ["notification-count", appSession?.profile.id],
    enabled: Boolean(appSession),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  const canUseMessages = has("messages.use");
  const { data: messagesUnread = 0, refetch: refetchMessagesUnread } = useQuery(
    {
      queryKey: ["shell-message-count", appSession?.profile.id],
      enabled: Boolean(appSession && canUseMessages),
      queryFn: async () => {
        const { data, error } = await supabase.rpc("list_conversations");
        if (error) throw error;
        return (
          (data ?? []) as Array<{
            unread_count: number | string | null;
          }>
        ).reduce(
          (total, conversation) =>
            total + Number(conversation.unread_count ?? 0),
          0,
        );
      },
      refetchInterval: 60_000,
    },
  );
  useEffect(() => {
    if (!appSession) return;
    const channel = supabase
      .channel(`shell-notifications:${appSession.profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${appSession.profile.id}`,
        },
        () => void refetchUnread(),
      );
    if (canUseMessages) {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => void refetchMessagesUnread(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "message_read_receipts" },
          () => void refetchMessagesUnread(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversation_members" },
          () => void refetchMessagesUnread(),
        );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appSession, canUseMessages, refetchMessagesUnread, refetchUnread]);
  const badge = (count: number, label: string) =>
    count > 0 ? (
      <span className="nav-badge" aria-label={`${count} ungelesene ${label}`}>
        {count > 99 ? "99+" : count}
      </span>
    ) : null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink
          className="logo"
          to="/app/dashboard"
          aria-label="Alberring Startseite"
        >
          <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
        </NavLink>
        <span className="sidebar-section-label">Mitarbeiter-App</span>
        <nav aria-label="Hauptnavigation">
          {all.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <span className="nav-icon">
                <Icon size={19} strokeWidth={1.9} />
              </span>
              <span>{label}</span>
              {to === "/app/messages" && badge(messagesUnread, "Nachrichten")}
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-profile"
          onClick={() => void signOut()}
          aria-label={`${appSession?.profile.display_name ?? "Profil"} abmelden`}
        >
          <span className="avatar">
            {appSession?.profile.display_name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            {appSession?.profile.display_name}
            <small>Abmelden</small>
          </span>
          <LogOut size={18} />
        </button>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <div className="topbar-leading">
            <img
              className="topbar-logo"
              src="/alberring-logo.png"
              alt=""
              aria-hidden="true"
            />
            <div className="topbar-copy">
              <span className="eyebrow">Alberring Mitarbeiter-App</span>
              <h1>{label}</h1>
            </div>
          </div>
          <div className="top-actions">
            <NavLink
              className="icon-button notification-button"
              to="/app/notifications"
              aria-label={`${unread} ungelesene Benachrichtigungen`}
            >
              <Bell />
              {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
            </NavLink>
            <NavLink className="avatar" to="/app/profile" aria-label="Profil">
              {appSession?.profile.display_name.slice(0, 2).toUpperCase()}
            </NavLink>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Mobile Hauptnavigation">
          {visiblePrimary.slice(0, 4).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <span className="bottom-nav-icon">
                <Icon strokeWidth={1.9} />
                {to === "/app/messages" && badge(messagesUnread, "Nachrichten")}
              </span>
              <span className="bottom-nav-label">{label}</span>
            </NavLink>
          ))}
          <NavLink to="/app/more">
            <span className="bottom-nav-icon">
              <Menu strokeWidth={1.9} />
            </span>
            <span className="bottom-nav-label">Mehr</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
