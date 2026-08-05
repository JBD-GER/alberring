import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  KeyRound,
  MailPlus,
  PlugZap,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { functionErrorMessage } from "../../lib/function-errors";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
type UserRow = {
  id: string;
  display_name: string;
  email: string;
  status: "invited" | "active" | "suspended" | "archived";
  first_name?: string | null;
  last_name?: string | null;
  employee_number?: string | null;
  work_phone?: string | null;
  job_title: string | null;
  employment_status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  birth_date?: string | null;
  weekly_hours?: number | null;
  roles: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
};
type Role = {
  id: string;
  name: string;
  system_key: string | null;
  role_permissions: Array<{ permission_key: string }>;
};
type Team = { id: string; name: string };
type InviteDelivery = {
  delivery?: "email" | "manual_link";
  manualInviteUrl?: string | null;
  warning?: { message?: string };
};

function ManualInviteLink({ url }: { url: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };
  return (
    <div className="manual-invite-link full">
      <label>
        Einmaliger Einladungslink
        <input
          aria-label="Einmaliger Einladungslink"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={copy}>
          Link kopieren
        </button>
        {copyState === "copied" && <span role="status">Link kopiert.</span>}
        {copyState === "error" && (
          <span role="alert">Bitte markieren und manuell kopieren.</span>
        )}
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { has } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState(false);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data as unknown as UserRow[];
    },
    enabled: has("users.view") || has("users.manage"),
  });
  const status = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-update-user-status",
        { body: { profileId: input.id, status: input.status } },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Der Benutzerstatus konnte nicht geändert werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-resend-invite",
        { body: { profileId: id } },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Die Einladung konnte nicht erneut versendet werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
      return data as InviteDelivery;
    },
  });
  if (!has("users.view") && !has("users.manage"))
    return <Navigate to="/app/dashboard" replace />;
  const filtered = data.filter((u) =>
    `${u.display_name} ${u.email}`
      .toLocaleLowerCase("de")
      .includes(search.toLocaleLowerCase("de")),
  );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Benutzerverwaltung</h2>
          <p>Mitarbeitende einladen, Rollen prüfen und Zugänge steuern.</p>
        </div>
        {has("users.manage") && (
          <button
            className="primary compact"
            onClick={() => setInvite((v) => !v)}
          >
            <MailPlus /> Mitarbeiter einladen
          </button>
        )}
      </section>
      {invite && (
        <InviteForm
          onDone={() => {
            setInvite(false);
            void client.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
      <label className="search">
        <Search />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name oder E-Mail …"
          aria-label="Benutzer durchsuchen"
        />
      </label>
      {(status.error || resend.error) && (
        <div className="alert error">
          {(status.error ?? resend.error)?.message ??
            "Administrative Aktion konnte nicht ausgeführt werden."}
        </div>
      )}
      {resend.isSuccess && (
        <>
          <div className={`alert ${resend.data?.warning ? "" : "success"}`}>
            {resend.data?.warning?.message ??
              "Einladung wurde erneut versendet."}
          </div>
          {resend.data?.manualInviteUrl && (
            <ManualInviteLink url={resend.data.manualInviteUrl} />
          )}
        </>
      )}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="empty">
          <h3>Benutzer konnten nicht geladen werden</h3>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <h3>Keine passenden Benutzer gefunden</h3>
          <p>
            Passen Sie den Suchbegriff an oder laden Sie eine neue Person ein.
          </p>
        </section>
      ) : (
        <div className="admin-table">
          {filtered.map((user) => (
            <article className="admin-user" key={user.id}>
              <span className="avatar">
                {user.display_name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h3>
                  <Link to={`/app/admin/users/${user.id}`}>
                    {user.display_name}
                  </Link>
                </h3>
                <p>{user.email}</p>
                <small>
                  {user.job_title ?? "Keine Funktion hinterlegt"} ·{" "}
                  {user.roles.map((r) => r.name).join(", ") || "Keine Rolle"}
                </small>
              </div>
              <span
                className={`status ${user.status === "active" ? "success" : user.status === "suspended" ? "danger" : "neutral"}`}
              >
                {statusLabel(user.status)}
              </span>
              {has("users.manage") && (
                <div className="user-controls">
                  <select
                    aria-label={`Status von ${user.display_name}`}
                    value={user.status}
                    onChange={(e) => {
                      const next = e.target.value;
                      const destructive =
                        next === "suspended" || next === "archived";
                      if (
                        destructive &&
                        !window.confirm(
                          next === "archived"
                            ? `${user.display_name} wirklich archivieren? Der Zugang wird gesperrt.`
                            : `${user.display_name} wirklich sperren?`,
                        )
                      )
                        return;
                      status.mutate({ id: user.id, status: next });
                    }}
                    disabled={status.isPending}
                  >
                    {user.status === "invited" ? (
                      <option value="invited">Eingeladen</option>
                    ) : (
                      <option value="active">Aktiv</option>
                    )}
                    {user.status !== "invited" && (
                      <option value="suspended">Gesperrt</option>
                    )}
                    <option value="archived">Archiviert</option>
                  </select>
                  {user.status === "invited" && (
                    <button
                      className="icon-button"
                      onClick={() => resend.mutate(user.id)}
                      disabled={resend.isPending}
                      aria-label={`Einladung an ${user.display_name} erneut senden`}
                    >
                      <RotateCcw />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminUserDetail() {
  const { userId } = useParams();
  const { has } = useAuth();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data as unknown as UserRow[];
    },
    enabled: Boolean(userId) && (has("users.view") || has("users.manage")),
  });
  const { data: roleOptions = [] } = useQuery({
    queryKey: ["admin-user-role-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: has("users.manage"),
  });
  const { data: teamOptions = [] } = useQuery({
    queryKey: ["admin-user-team-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
    enabled: has("users.manage"),
  });
  const assignment = useMutation({
    mutationFn: async (input: {
      kind: "role" | "team";
      id: string;
      enabled: boolean;
    }) => {
      if (!userId) throw new Error("Benutzer fehlt.");
      const { error } =
        input.kind === "role"
          ? await supabase.rpc("set_user_role", {
              p_profile_id: userId,
              p_role_id: input.id,
              p_enabled: input.enabled,
            })
          : await supabase.rpc("set_user_team", {
              p_profile_id: userId,
              p_team_id: input.id,
              p_enabled: input.enabled,
            });
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  if (!has("users.view") && !has("users.manage"))
    return <Navigate to="/app/dashboard" replace />;
  if (isLoading)
    return (
      <div className="skeleton-list">
        <span />
        <span />
      </div>
    );
  const user = data?.find((candidate) => candidate.id === userId);
  if (error || !user)
    return (
      <section className="empty">
        <h2>Benutzer nicht verfügbar</h2>
        <p>Der Datensatz wurde nicht gefunden oder ist nicht freigegeben.</p>
        <Link className="secondary" to="/app/admin/users">
          Zur Benutzerliste
        </Link>
      </section>
    );

  const facts = [
    ["Status", statusLabel(user.status)],
    ["Dienstliche E-Mail", user.email],
    ["Telefon", user.work_phone ?? "Nicht hinterlegt"],
    ["Funktion", user.job_title ?? "Nicht hinterlegt"],
    ["Mitarbeiternummer", user.employee_number ?? "Nicht hinterlegt"],
    ["Beschäftigungsstatus", user.employment_status ?? "Nicht hinterlegt"],
    ["Eintritt", user.start_date ?? "Nicht hinterlegt"],
    [
      "Wochenstunden",
      user.weekly_hours != null ? `${user.weekly_hours}` : "Nicht hinterlegt",
    ],
  ];
  return (
    <div className="page-stack">
      <Link className="back-link" to="/app/admin/users">
        ← Zurück zur Benutzerliste
      </Link>
      <section className="settings-card">
        <div className="profile-hero">
          <span className="avatar profile-avatar">
            {user.display_name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2>{user.display_name}</h2>
            <p>{user.job_title ?? "Mitarbeiter/in"}</p>
          </div>
        </div>
        <dl className="detail-grid">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <ShieldCheck />
          <div>
            <h3>Rollen und Teams</h3>
            <p>Effektive Zuordnungen dieses Zugangs.</p>
          </div>
        </div>
        {has("users.manage") ? (
          <div className="assignment-grid">
            <fieldset>
              <legend>Rollen</legend>
              {roleOptions.map((role) => (
                <label key={role.id}>
                  <input
                    type="checkbox"
                    checked={user.roles.some(
                      (current) => current.id === role.id,
                    )}
                    disabled={assignment.isPending}
                    onChange={(event) =>
                      assignment.mutate({
                        kind: "role",
                        id: role.id,
                        enabled: event.target.checked,
                      })
                    }
                  />
                  {role.name}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Teams</legend>
              {teamOptions.map((team) => (
                <label key={team.id}>
                  <input
                    type="checkbox"
                    checked={user.teams.some(
                      (current) => current.id === team.id,
                    )}
                    disabled={assignment.isPending}
                    onChange={(event) =>
                      assignment.mutate({
                        kind: "team",
                        id: team.id,
                        enabled: event.target.checked,
                      })
                    }
                  />
                  {team.name}
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <div className="permission-cloud">
            {user.roles.length ? (
              user.roles.map((role) => <span key={role.id}>{role.name}</span>)
            ) : (
              <span>Keine Rolle</span>
            )}
            {user.teams.map((team) => (
              <span key={team.id}>Team: {team.name}</span>
            ))}
          </div>
        )}
        {assignment.error && (
          <div className="alert error">
            Die Zuordnung konnte nicht gespeichert werden. Der letzte
            Systemadministrator und der eigene Verwaltungszugang sind geschützt.
          </div>
        )}
      </section>
    </div>
  );
}

type OrganizationSettings = {
  organization_id: string;
  timezone: string;
  leave_approval_steps: number;
  mileage_reminder_days: number[];
  mileage_overdue_day: number;
  birthday_reminder_days: number[];
  message_edit_window_minutes: number;
  max_document_folder_depth: number;
};

const numberList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part));

export function AdminSettings() {
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["organization-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_settings")
        .select(
          "organization_id,timezone,leave_approval_steps,mileage_reminder_days,mileage_overdue_day,birthday_reminder_days,message_edit_window_minutes,max_document_folder_depth",
        )
        .single();
      if (error) throw error;
      return data as OrganizationSettings;
    },
    enabled: Boolean(appSession) && has("settings.manage"),
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!appSession) throw new Error("Sitzung fehlt.");
      const values = new FormData(form);
      const mileageDays = numberList(values.get("mileageReminderDays"));
      const birthdayDays = numberList(values.get("birthdayReminderDays"));
      if (!mileageDays.length || !birthdayDays.length)
        throw new Error("Mindestens ein gültiger Erinnerungstag fehlt.");
      const { error } = await supabase
        .from("organization_settings")
        .update({
          timezone: String(values.get("timezone")),
          leave_approval_steps: Number(values.get("leaveApprovalSteps")),
          mileage_reminder_days: mileageDays,
          mileage_overdue_day: Number(values.get("mileageOverdueDay")),
          birthday_reminder_days: birthdayDays,
          message_edit_window_minutes: Number(
            values.get("messageEditWindowMinutes"),
          ),
        })
        .eq("organization_id", appSession.profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["organization-settings"] }),
  });
  if (!has("settings.manage")) return <Navigate to="/app/dashboard" replace />;
  if (isLoading)
    return (
      <div className="skeleton-list">
        <span />
        <span />
      </div>
    );
  if (error || !data)
    return (
      <div className="alert error">
        Systemeinstellungen konnten nicht geladen werden.
      </div>
    );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Systemeinstellungen</h2>
          <p>
            Workflow-, Erinnerungs- und Sicherheitsparameter der Organisation.
          </p>
        </div>
      </section>
      <section className="settings-card">
        <form
          className="form two-column"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(event.currentTarget);
          }}
        >
          <label>
            Zeitzone
            <input name="timezone" defaultValue={data.timezone} required />
          </label>
          <label>
            Freigabestufen Urlaub
            <select
              name="leaveApprovalSteps"
              defaultValue={data.leave_approval_steps}
            >
              <option value="1">Eine Stufe</option>
              <option value="2">Zwei Stufen</option>
            </select>
          </label>
          <label>
            Kilometer-Erinnerungstage
            <input
              name="mileageReminderDays"
              defaultValue={data.mileage_reminder_days.join(", ")}
              placeholder="25, 28"
              required
            />
          </label>
          <label>
            Überfällig ab Tag im Folgemonat
            <input
              type="number"
              name="mileageOverdueDay"
              min="1"
              max="28"
              defaultValue={data.mileage_overdue_day}
              required
            />
          </label>
          <label>
            Geburtstagserinnerung in Tagen
            <input
              name="birthdayReminderDays"
              defaultValue={data.birthday_reminder_days.join(", ")}
              placeholder="7, 0"
              required
            />
          </label>
          <label>
            Bearbeitungsfenster Nachrichten (Minuten)
            <input
              type="number"
              name="messageEditWindowMinutes"
              min="1"
              max="1440"
              defaultValue={data.message_edit_window_minutes}
              required
            />
          </label>
          {save.error && (
            <div className="alert error full">
              {save.error instanceof Error
                ? save.error.message
                : "Einstellungen konnten nicht gespeichert werden."}
            </div>
          )}
          {save.isSuccess && (
            <div className="alert success full">
              Einstellungen wurden gespeichert.
            </div>
          )}
          <div className="form-actions full">
            <button className="primary" disabled={save.isPending}>
              Einstellungen speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id,name,system_key,role_permissions(permission_key)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Role[];
    },
  });
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
  });
  const invite = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const payload = {
        email: String(fd.get("email")).trim(),
        firstName: String(fd.get("firstName")).trim(),
        lastName: String(fd.get("lastName")).trim(),
        roleId: String(fd.get("roleId")),
        teamId: fd.get("teamId") ? String(fd.get("teamId")) : undefined,
      };
      const { data, error } = await supabase.functions.invoke(
        "admin-create-user",
        { body: payload },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Einladung konnte nicht versendet werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
      return data as InviteDelivery;
    },
    onSuccess: (data) =>
      setMessage({
        type: "success",
        text:
          data.warning?.message ??
          "Einladung wurde versendet. Der Benutzer erscheint nach dem Schließen in der Liste.",
      }),
    onError: (e) =>
      setMessage({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Einladung konnte nicht versendet werden.",
      }),
  });
  return (
    <section className="editor-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">NEUER ZUGANG</span>
          <h2>Mitarbeiter einladen</h2>
        </div>
        <button className="icon-button" onClick={onDone} aria-label="Schließen">
          ×
        </button>
      </div>
      <form
        className="form two-column"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate(e.currentTarget);
        }}
      >
        <label>
          Vorname
          <input name="firstName" required maxLength={80} />
        </label>
        <label>
          Nachname
          <input name="lastName" required maxLength={80} />
        </label>
        <label className="full">
          Dienstliche E-Mail
          <input type="email" name="email" required />
        </label>
        <label>
          Rolle
          <select name="roleId" required>
            <option value="">Bitte wählen</option>
            {roles.map((role) => (
              <option value={role.id} key={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select name="teamId">
            <option value="">Kein Team</option>
            {teams.map((team) => (
              <option value={team.id} key={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <div className={`alert ${message.type} full`}>{message.text}</div>
        )}
        {invite.data?.manualInviteUrl && (
          <ManualInviteLink url={invite.data.manualInviteUrl} />
        )}
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={onDone}>
            Schließen
          </button>
          <button
            className="primary"
            disabled={invite.isPending || invite.isSuccess}
          >
            <MailPlus />{" "}
            {invite.isPending
              ? "Einladung läuft …"
              : invite.isSuccess
                ? "Einladung erstellt"
                : "Sicher einladen"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function AdminRoles() {
  const { has } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id,name,system_key,role_permissions(permission_key)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Role[];
    },
    enabled: has("roles.view") || has("roles.manage"),
  });
  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("key,description")
        .order("key");
      if (error) throw error;
      return data as Array<{ key: string; description: string }>;
    },
    enabled: has("roles.manage"),
  });
  const togglePermission = useMutation({
    mutationFn: async (input: {
      roleId: string;
      key: string;
      active: boolean;
    }) => {
      const { error } = await supabase.rpc("set_role_permission", {
        p_role_id: input.roleId,
        p_permission_key: input.key,
        p_enabled: !input.active,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
  const createRole = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const name = String(new FormData(form).get("name")).trim();
      const { error } = await supabase.rpc("create_role", { p_name: name });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreating(false);
      void client.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
  if (!has("roles.view") && !has("roles.manage"))
    return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Rollen und Berechtigungen</h2>
          <p>
            Effektive Rechte werden serverseitig aus allen aktiven Rollen
            vereinigt.
          </p>
        </div>
        {has("roles.manage") && (
          <button
            className="primary compact"
            onClick={() => setCreating((v) => !v)}
          >
            <ShieldCheck /> Rolle anlegen
          </button>
        )}
      </section>
      {creating && (
        <section className="editor-card">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              createRole.mutate(e.currentTarget);
            }}
          >
            <label>
              Rollenname
              <input name="name" required maxLength={100} />
            </label>
            {createRole.error && (
              <div className="alert error">
                Rolle konnte nicht angelegt werden.
              </div>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setCreating(false)}
              >
                Abbrechen
              </button>
              <button className="primary">Rolle speichern</button>
            </div>
          </form>
        </section>
      )}
      {togglePermission.error && (
        <div className="alert error">
          Berechtigung konnte nicht geändert werden. Kritische Superadmin-Rechte
          sind gegen Aussperren geschützt.
        </div>
      )}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="empty">
          <h3>Rollen konnten nicht geladen werden</h3>
        </section>
      ) : (
        <div className="role-grid">
          {data.map((role) => (
            <article className="role-card" key={role.id}>
              <div>
                <span className="role-icon">
                  <ShieldCheck />
                </span>
                <h3>{role.name}</h3>
                <p>{role.role_permissions.length} Berechtigungen</p>
              </div>
              <div className="permission-cloud">
                {role.role_permissions.slice(0, 8).map((p) => (
                  <span key={p.permission_key}>{p.permission_key}</span>
                ))}
                {role.role_permissions.length > 8 && (
                  <span>+{role.role_permissions.length - 8} weitere</span>
                )}
              </div>
              {has("roles.manage") && (
                <button
                  className="secondary"
                  onClick={() =>
                    setEditing(editing === role.id ? null : role.id)
                  }
                >
                  {editing === role.id
                    ? "Editor schließen"
                    : "Berechtigungen bearbeiten"}
                </button>
              )}
              {editing === role.id && (
                <div className="permission-editor">
                  {permissions.map((permission) => {
                    const active = role.role_permissions.some(
                      (p) => p.permission_key === permission.key,
                    );
                    return (
                      <label key={permission.key}>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={togglePermission.isPending}
                          onChange={() =>
                            togglePermission.mutate({
                              roleId: role.id,
                              key: permission.key,
                              active,
                            })
                          }
                        />
                        <span>
                          <strong>{permission.key}</strong>
                          <small>{permission.description}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminTeams() {
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select(
          "id,name,location_name,active,lead_profile_id,profiles!teams_lead_profile_id_fkey(display_name)",
        )
        .order("name");
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        name: string;
        location_name: string | null;
        active: boolean;
        profiles: { display_name: string } | null;
      }>;
    },
    enabled: has("teams.manage"),
  });
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!appSession) throw new Error();
      const fd = new FormData(form);
      const { error } = await supabase.from("teams").insert({
        organization_id: appSession.profile.organization_id,
        name: String(fd.get("name")).trim(),
        location_name: String(fd.get("location")).trim() || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["admin-teams"] });
    },
  });
  const toggle = useMutation({
    mutationFn: async (team: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("teams")
        .update({ active: !team.active })
        .eq("id", team.id);
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin-teams"] }),
  });
  if (!has("teams.manage")) return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Teams und Standorte</h2>
          <p>
            Pragmatische Organisationsstruktur für Planung und Kommunikation.
          </p>
        </div>
        <button className="primary compact" onClick={() => setOpen((v) => !v)}>
          <Users /> Team anlegen
        </button>
      </section>
      {open && (
        <section className="editor-card">
          <form
            className="form two-column"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(e.currentTarget);
            }}
          >
            <label>
              Teamname
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Standort
              <input name="location" maxLength={120} />
            </label>
            {save.error && (
              <div className="alert error full">
                Team konnte nicht angelegt werden.
              </div>
            )}
            <div className="form-actions full">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </button>
              <button className="primary">Team speichern</button>
            </div>
          </form>
        </section>
      )}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="alert error">Teams konnten nicht geladen werden.</div>
      ) : (
        <div className="role-grid">
          {data.map((team) => (
            <article className="role-card" key={team.id}>
              <div>
                <span className="role-icon">
                  <Users />
                </span>
                <h3>{team.name}</h3>
                <p>
                  {team.location_name ?? "Kein Standort"} ·{" "}
                  {team.profiles?.display_name ?? "Keine Teamleitung"}
                </p>
              </div>
              <button className="secondary" onClick={() => toggle.mutate(team)}>
                {team.active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminHome() {
  const { has } = useAuth();
  const authorized = [
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
  if (!authorized) return <Navigate to="/app/dashboard" replace />;
  const operational = [
    {
      to: "/app/admin/schedule",
      label: "Einsatzplanung",
      description: "Schichten erstellen und veröffentlichen",
      show: has("schedule.manage"),
    },
    {
      to: "/app/admin/leave",
      label: "Urlaubsfreigaben",
      description: "Anträge prüfen und entscheiden",
      show: has("leave.approve") || has("leave.manage"),
    },
    {
      to: "/app/admin/sick-leave",
      label: "Krankmeldungen",
      description: "Abwesenheitsstatus bearbeiten",
      show: has("sick_leave.manage"),
    },
    {
      to: "/app/admin/fleet",
      label: "Fuhrpark",
      description: "Fahrzeuge und Zuweisungen verwalten",
      show: has("fleet.manage"),
    },
    {
      to: "/app/admin/material-requests",
      label: "Material",
      description: "Anforderungen bearbeiten",
      show: has("materials.manage") || has("materials.approve"),
    },
  ];
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Administration</h2>
          <p>Sichere Verwaltung für berechtigte Rollen.</p>
        </div>
      </section>
      <div className="admin-hub">
        {(has("users.view") || has("users.manage")) && (
          <Link to="/app/admin/users">
            <Users />
            <strong>Benutzer</strong>
            <span>Einladen und Zugänge verwalten</span>
          </Link>
        )}
        {(has("roles.view") || has("roles.manage")) && (
          <Link to="/app/admin/roles">
            <KeyRound />
            <strong>Rollen</strong>
            <span>Berechtigungen nachvollziehen</span>
          </Link>
        )}
        {has("teams.manage") && (
          <Link to="/app/admin/teams">
            <UserCog />
            <strong>Teams</strong>
            <span>Organisation und Leitung</span>
          </Link>
        )}
        {operational
          .filter((item) => item.show)
          .map((item) => (
            <Link to={item.to} key={item.to}>
              <UserCog />
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
        {has("audit.view") && (
          <Link to="/app/admin/audit">
            <Activity />
            <strong>Audit</strong>
            <span>Sicherheitsrelevante Aktionen prüfen</span>
          </Link>
        )}
        {has("integrations.manage") && (
          <Link to="/app/admin/integrations">
            <PlugZap />
            <strong>Integrationen</strong>
            <span>Providerstatus und Verbindungstests</span>
          </Link>
        )}
        {has("settings.manage") && (
          <Link to="/app/admin/settings">
            <ShieldCheck />
            <strong>Systemeinstellungen</strong>
            <span>Workflows und Erinnerungen konfigurieren</span>
          </Link>
        )}
      </div>
    </div>
  );
}
const statusLabel = (status: UserRow["status"]) =>
  ({
    invited: "Eingeladen",
    active: "Aktiv",
    suspended: "Gesperrt",
    archived: "Archiviert",
  })[status];
