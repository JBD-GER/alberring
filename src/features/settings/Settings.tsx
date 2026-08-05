import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Car,
  FileText,
  KeyRound,
  LogOut,
  Newspaper,
  Package,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Umbrella,
  User,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase";
import { passwordSchema } from "../../lib/validation";
import { useAuth } from "../auth/AuthProvider";
type ProfileData = {
  display_name: string;
  email: string;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  work_phone: string | null;
  employee_number: string | null;
  start_date: string | null;
};
export function Profile() {
  const { appSession } = useAuth();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["own-profile"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_profile").single();
      if (error) throw error;
      return data as unknown as ProfileData;
    },
    enabled: Boolean(appSession),
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const { error } = await supabase.rpc("update_own_profile", {
        p_display_name: String(fd.get("displayName")).trim(),
        p_work_phone: String(fd.get("workPhone")).trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["own-profile"] });
      await supabase.auth.refreshSession();
    },
  });
  if (isLoading)
    return (
      <div className="skeleton-list">
        <span />
        <span />
      </div>
    );
  if (error || !data)
    return (
      <div className="alert error">Profil konnte nicht geladen werden.</div>
    );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Mein Profil</h2>
          <p>Ihre freigegebenen dienstlichen Angaben.</p>
        </div>
      </section>
      <section className="settings-card">
        <div className="profile-hero">
          <span className="avatar profile-avatar">
            {data.display_name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h3>{data.display_name}</h3>
            <p>
              {data.job_title ?? "Mitarbeiter/in"} · {data.email}
            </p>
          </div>
        </div>
        <form
          className="form two-column"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(e.currentTarget);
          }}
        >
          <label>
            Anzeigename
            <input
              name="displayName"
              defaultValue={data.display_name}
              required
            />
          </label>
          <label>
            Dienstliche Telefonnummer
            <input name="workPhone" defaultValue={data.work_phone ?? ""} />
          </label>
          <label>
            Vorname
            <input value={data.first_name ?? ""} disabled />
          </label>
          <label>
            Nachname
            <input value={data.last_name ?? ""} disabled />
          </label>
          <label>
            Mitarbeiternummer
            <input
              value={data.employee_number ?? "Nicht hinterlegt"}
              disabled
            />
          </label>
          <label>
            Eintrittsdatum
            <input value={data.start_date ?? "Nicht hinterlegt"} disabled />
          </label>
          {save.error && (
            <div className="alert error full">
              Änderung konnte nicht gespeichert werden.
            </div>
          )}
          {save.isSuccess && (
            <div className="alert success full">Profil wurde aktualisiert.</div>
          )}
          <div className="form-actions full">
            <button className="primary" disabled={save.isPending}>
              <Save /> Änderungen speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function Settings() {
  const { signOut } = useAuth();
  const password = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form),
        value = String(fd.get("password")),
        confirm = String(fd.get("confirm"));
      if (value !== confirm)
        throw new Error("Die Passwörter stimmen nicht überein.");
      const parsed = passwordSchema.safeParse(value);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { error } = await supabase.auth.updateUser({ password: value });
      if (error) throw error;
    },
  });
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Einstellungen</h2>
          <p>Konto, Sicherheit und Benachrichtigungen.</p>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <KeyRound />
          <div>
            <h3>Passwort ändern</h3>
            <p>
              Mindestens 12 Zeichen, Groß- und Kleinbuchstaben sowie eine Zahl.
            </p>
          </div>
        </div>
        <form
          className="form two-column"
          onSubmit={(e) => {
            e.preventDefault();
            password.mutate(e.currentTarget);
            e.currentTarget.reset();
          }}
        >
          <label>
            Neues Passwort
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Wiederholen
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          {password.error && (
            <div className="alert error full">
              {password.error instanceof Error
                ? password.error.message
                : "Änderung fehlgeschlagen."}
            </div>
          )}
          {password.isSuccess && (
            <div className="alert success full">Passwort wurde geändert.</div>
          )}
          <div className="form-actions full">
            <button className="primary" disabled={password.isPending}>
              <ShieldCheck /> Passwort aktualisieren
            </button>
          </div>
        </form>
      </section>
      <div className="alert">
        E-Mail- und Push-Präferenzen werden gespeichert. Die tatsächliche
        Zustellung startet erst, sobald ein Betreiber-Provider konfiguriert
        wurde.
      </div>
      <NotificationPreferences />
      <section className="settings-card danger-zone">
        <div className="settings-title">
          <User />
          <div>
            <h3>Sitzung</h3>
            <p>Melden Sie sich auf diesem Gerät sicher ab.</p>
          </div>
        </div>
        <button className="secondary" onClick={() => void signOut()}>
          <LogOut /> Abmelden
        </button>
      </section>
    </div>
  );
}

type Preference = {
  category: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  show_sensitive_preview: boolean;
};
const preferenceCategories = [
  ["messages", "Nachrichten"],
  ["news", "News"],
  ["schedule", "Dienstplan"],
  ["leave", "Urlaub"],
  ["documents", "Dokumente"],
  ["fleet", "Fuhrpark"],
  ["materials", "Material"],
] as const;
function NotificationPreferences() {
  const { appSession } = useAuth();
  const client = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select(
          "category,in_app_enabled,email_enabled,push_enabled,show_sensitive_preview",
        );
      if (error) throw error;
      return data as Preference[];
    },
    enabled: Boolean(appSession),
  });
  const save = useMutation({
    mutationFn: async (input: {
      category: string;
      field: "email_enabled" | "push_enabled";
      value: boolean;
    }) => {
      if (!appSession) throw new Error();
      const existing = data.find((p) => p.category === input.category);
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          organization_id: appSession.profile.organization_id,
          profile_id: appSession.profile.id,
          category: input.category,
          in_app_enabled: true,
          email_enabled: existing?.email_enabled ?? false,
          push_enabled: existing?.push_enabled ?? false,
          show_sensitive_preview: false,
          [input.field]: input.value,
        },
        { onConflict: "profile_id,category" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
  return (
    <section className="settings-card">
      <div className="settings-title">
        <Bell />
        <div>
          <h3>Benachrichtigungen</h3>
          <p>
            In-App-Hinweise bleiben aktiv; weitere Kanäle wählen Sie bewusst
            aus.
          </p>
        </div>
      </div>
      <div className="preference-table">
        <div className="preference-head">
          <span>Kategorie</span>
          <span>E-Mail</span>
          <span>Push</span>
        </div>
        {preferenceCategories.map(([key, label]) => {
          const value = data.find((p) => p.category === key);
          return (
            <div className="preference-item" key={key}>
              <strong>{label}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={value?.email_enabled ?? false}
                  onChange={(e) =>
                    save.mutate({
                      category: key,
                      field: "email_enabled",
                      value: e.target.checked,
                    })
                  }
                />
                <span className="sr-only">E-Mail für {label}</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={value?.push_enabled ?? false}
                  onChange={(e) =>
                    save.mutate({
                      category: key,
                      field: "push_enabled",
                      value: e.target.checked,
                    })
                  }
                />
                <span className="sr-only">Push für {label}</span>
              </label>
            </div>
          );
        })}
      </div>
      <div className="preference-row">
        <span>
          <strong>Datensparsame Pushtexte</strong>
          <small>
            Nachrichteninhalte erscheinen nicht auf dem Sperrbildschirm.
          </small>
        </span>
        <span className="status success">Aktiv</span>
      </div>
      {save.error && (
        <div className="alert error">
          Einstellung konnte nicht gespeichert werden.
        </div>
      )}
    </section>
  );
}

export function More() {
  const { has } = useAuth();
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
  const links = [
    {
      to: "/app/news",
      label: "News",
      description: "Interne Mitteilungen und Pflichtinfos",
      icon: Newspaper,
      permissions: ["news.view"],
      group: "daily",
    },
    {
      to: "/app/leave",
      label: "Urlaub",
      description: "Anträge und Status",
      icon: Umbrella,
      permissions: [
        "leave.create_own",
        "leave.view_team",
        "leave.approve",
        "leave.manage",
      ],
      group: "daily",
    },
    {
      to: "/app/sick-leave",
      label: "Krankmeldung",
      description: "Abwesenheit sicher melden",
      icon: FileText,
      permissions: [
        "sick_leave.create_own",
        "sick_leave.view_status",
        "sick_leave.manage",
      ],
      group: "daily",
    },
    {
      to: "/app/fleet",
      label: "Fuhrpark",
      description: "Fahrzeug und Kilometerstand",
      icon: Car,
      permissions: ["fleet.view_own", "fleet.view_all", "fleet.manage"],
      group: "daily",
    },
    {
      to: "/app/material-requests",
      label: "Material",
      description: "Anforderungen verfolgen",
      icon: Package,
      permissions: [
        "materials.create_own",
        "materials.view_team",
        "materials.manage",
        "materials.approve",
      ],
      group: "daily",
    },
    {
      to: "/app/directory",
      label: "Team",
      description: "Mitarbeiterverzeichnis",
      icon: Users,
      permissions: ["directory.view"],
      group: "organization",
    },
    {
      to: "/app/notifications",
      label: "Benachrichtigungen",
      description: "Hinweise und Aktualisierungen",
      icon: Bell,
      permissions: [],
      group: "organization",
    },
    {
      to: "/app/profile",
      label: "Mein Profil",
      description: "Kontaktdaten und persönliche Angaben",
      icon: User,
      permissions: [],
      group: "account",
    },
    {
      to: "/app/settings",
      label: "Einstellungen",
      description: "Konto und Sicherheit",
      icon: SettingsIcon,
      permissions: [],
      group: "account",
    },
    {
      to: "/app/admin",
      label: "Administration",
      description: "Benutzer, Rollen und System",
      icon: ShieldCheck,
      permissions: [],
      show: admin,
      group: "account",
    },
  ];
  const visibleLinks = links.filter(
    (link) =>
      (link.permissions.length === 0 || link.permissions.some(has)) &&
      link.show !== false,
  );
  const groups = [
    {
      id: "daily",
      title: "Pflegealltag",
      description: "Alles Wichtige für Ihren Arbeitstag",
    },
    {
      id: "organization",
      title: "Organisation",
      description: "Team und interne Informationen",
    },
    {
      id: "account",
      title: "Konto",
      description: "Profil, Sicherheit und Verwaltung",
    },
  ];
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Mehr</h2>
          <p>Weitere Funktionen und Einstellungen.</p>
        </div>
      </section>
      <div className="more-sections">
        {groups.map((group) => {
          const groupLinks = visibleLinks.filter(
            (link) => link.group === group.id,
          );
          if (groupLinks.length === 0) return null;
          return (
            <section className="more-section" key={group.id}>
              <header>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
              </header>
              <div className="more-grid">
                {groupLinks.map(({ to, label, description, icon: Icon }) => (
                  <Link to={to} key={to}>
                    <span>
                      <Icon />
                    </span>
                    <div>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
