import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  KeyRound,
  MailPlus,
  PlugZap,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { Link, Navigate, useLocation, useParams } from "react-router";
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
  roles: Array<{ id: string; name: string; system_key?: string | null }>;
  teams: Array<{ id: string; name: string }>;
};
type Role = {
  id: string;
  name: string;
  system_key: string | null;
  role_permissions: Array<{ permission_key: string }>;
};
type Team = { id: string; name: string };
type RoleOption = Pick<Role, "id" | "name" | "system_key">;
type TeamPerson = {
  id: string;
  display_name: string;
  email: string;
  status: UserRow["status"];
  team_ids: string[];
};

const roleDescriptions: Record<string, string> = {
  super_admin: "Voller Zugriff auf alle Funktionen und die Benutzerverwaltung.",
  team_lead: "Teamleitung mit den zugewiesenen Rechten für das eigene Team.",
  employee:
    "Kommunikation und freigegebene Informationen. Urlaub und Krankmeldungen erfasst die Administration.",
};
const supportedRoleKeys = new Set(["super_admin", "employee", "team_lead"]);
const isSupportedRole = (role: RoleOption) =>
  supportedRoleKeys.has(role.system_key ?? "");

function assignmentError(error: { message: string }, fallback: string) {
  if (error.message.includes("last_super_admin"))
    return "Mindestens ein aktiver Super Admin muss erhalten bleiben.";
  if (error.message.includes("cannot_change_own_roles"))
    return "Die eigenen Rollen können nur durch einen Super Admin geändert werden.";
  if (
    error.message.includes("role_delegation") ||
    error.message.includes("super_admin_assignment")
  )
    return "Diese Rolle kann nur durch einen Super Admin zugewiesen werden.";
  if (error.message.includes("permission_denied"))
    return "Für diese Änderung fehlt die Berechtigung.";
  return fallback;
}
type InviteDelivery = {
  delivery: "email" | "manual_link" | "failed";
  sent: boolean;
  profileId?: string;
  manualInviteUrl?: string | null;
  warning?: { message?: string };
};

const inviteExpiryText =
  "Der Einladungslink ist 24 Stunden gültig und kann nur einmal verwendet werden.";

function parseInviteDelivery(data: unknown): InviteDelivery {
  const delivery = data as Partial<InviteDelivery> | null;
  const emailSent = delivery?.delivery === "email" && delivery.sent === true;
  const manualLink =
    delivery?.delivery === "manual_link" &&
    delivery.sent === false &&
    typeof delivery.manualInviteUrl === "string" &&
    delivery.manualInviteUrl.length > 0;
  const deliveryFailed =
    delivery?.delivery === "failed" && delivery.sent === false;
  if (!emailSent && !manualLink && !deliveryFailed)
    throw new Error(
      "Der E-Mail-Versand wurde nicht bestätigt. Bitte prüfen Sie den Einladungsstatus in der Benutzerliste.",
    );
  return delivery as InviteDelivery;
}

function inviteDeliveryMessage(data: InviteDelivery, resent = false) {
  if (data.warning?.message) return data.warning.message;
  if (data.delivery === "failed")
    return "Der Benutzer wurde angelegt, aber die Einladungs-E-Mail konnte nicht versendet werden. Bitte senden Sie die Einladung erneut.";
  if (data.delivery === "manual_link")
    return "Die Einladung wurde erstellt. Der E-Mail-Versand ist nicht verfügbar. Bitte geben Sie den einmaligen Einladungslink persönlich weiter.";
  return resent
    ? "Einladung wurde erneut versendet."
    : "Einladung wurde versendet. Der Benutzer erscheint in der Liste.";
}

function InviteExpiryNotice({
  onDismiss,
}: {
  onDismiss: (doNotShowAgain: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="invite-expiry-notice"
      aria-labelledby="invite-expiry-title"
      aria-describedby="invite-expiry-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss(doNotShowAgain);
      }}
      onClose={() => {
        if (!dialogRef.current?.open) onDismiss(doNotShowAgain);
      }}
    >
      <span className="eyebrow">HINWEIS ZUR EINLADUNG</span>
      <h2 id="invite-expiry-title">Einladungslink: 24 Stunden gültig</h2>
      <p id="invite-expiry-description">
        {inviteExpiryText} Solange die Einladung noch nicht angenommen wurde,
        können Sie über „Einladung erneut senden“ einen neuen Link verschicken.
      </p>
      <label className="invite-expiry-preference">
        <input
          type="checkbox"
          checked={doNotShowAgain}
          onChange={(event) => setDoNotShowAgain(event.target.checked)}
        />
        Nicht mehr anzeigen
      </label>
      <div className="form-actions">
        <button
          type="button"
          className="primary"
          onClick={() => onDismiss(doNotShowAgain)}
        >
          Verstanden
        </button>
      </div>
    </dialog>
  );
}

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
  const { has, appSession } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState(false);
  const [showExpiryNotice, setShowExpiryNotice] = useState(false);
  const expiryPreferenceKey = `alberring:invite-expiry-notice:v1:${appSession?.profile.id ?? "anonymous"}`;
  const showInviteNotice = (delivery: InviteDelivery) => {
    if (delivery.delivery === "failed") return;
    try {
      if (localStorage.getItem(expiryPreferenceKey) === "hidden") return;
    } catch {
      // The notice remains available if browser storage is disabled.
    }
    setShowExpiryNotice(true);
  };
  const dismissInviteNotice = (doNotShowAgain: boolean) => {
    if (doNotShowAgain) {
      try {
        localStorage.setItem(expiryPreferenceKey, "hidden");
      } catch {
        // Storage restrictions must not block the invitation workflow.
      }
    }
    setShowExpiryNotice(false);
  };
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
      return parseInviteDelivery(data);
    },
    onSuccess: (delivery) => {
      showInviteNotice(delivery);
      void client.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-delete-user",
        { body: { profileId: id } },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Der Benutzer konnte nicht gelöscht werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
    },
    onSuccess: async () => {
      resend.reset();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["admin-team-people"] }),
        client.invalidateQueries({ queryKey: ["conversation-people"] }),
      ]);
    },
  });
  const actionPending =
    status.isPending || resend.isPending || removeUser.isPending;
  if (!has("users.view") && !has("users.manage"))
    return <Navigate to="/app/dashboard" replace />;
  const filtered = data.filter((u) =>
    `${u.display_name} ${u.email}`
      .toLocaleLowerCase("de")
      .includes(search.toLocaleLowerCase("de")),
  );
  return (
    <div className="page-stack">
      {showExpiryNotice && (
        <InviteExpiryNotice onDismiss={dismissInviteNotice} />
      )}
      <section className="page-intro">
        <div>
          <h2>Benutzerverwaltung</h2>
          <p>Mitarbeitende einladen, bearbeiten und Rollen zuweisen.</p>
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
          onInvited={(delivery) => {
            showInviteNotice(delivery);
            void client.invalidateQueries({ queryKey: ["admin-users"] });
          }}
          onDone={() => {
            setInvite(false);
            void client.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
      {has("users.manage") && has("data.correct") && (
        <p className="admin-user-help">
          Öffnen Sie einen Namen, um die Mitarbeiterdaten zu bearbeiten. Bei
          „Eingeladen“ können Sie die Einladung erneut senden. Beim Löschen wird
          der Zugang dauerhaft entfernt; vorhandene Vorgänge bleiben als
          „Gelöschter Benutzer“ erhalten. Archivieren sperrt den Zugang und
          erhält das Profil.
        </p>
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
      {(status.error || resend.error || removeUser.error) && (
        <div className="alert error" role="alert">
          {(status.error ?? resend.error ?? removeUser.error)?.message ??
            "Administrative Aktion konnte nicht ausgeführt werden."}
        </div>
      )}
      {removeUser.isSuccess && (
        <div className="alert success" role="status">
          Der Benutzer wurde gelöscht. Vorhandene Vorgänge bleiben als
          „Gelöschter Benutzer“ erhalten.
        </div>
      )}
      {resend.isSuccess && (
        <>
          <div
            className={`alert ${resend.data.warning || resend.data.delivery === "failed" || resend.data.delivery === "manual_link" ? "" : "success"}`}
            role="status"
          >
            {inviteDeliveryMessage(resend.data, true)}
          </div>
          {resend.data.delivery !== "failed" && (
            <p className="admin-user-help">{inviteExpiryText}</p>
          )}
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
                {has("users.manage") && (
                  <Link
                    className="admin-role-link"
                    to={`/app/admin/users/${user.id}#roles`}
                  >
                    <ShieldCheck /> Rollen ändern
                  </Link>
                )}
                {has("users.manage") && has("data.correct") && (
                  <Link
                    className="admin-role-link"
                    to={`/app/admin/users/${user.id}`}
                  >
                    <UserCog /> Daten bearbeiten
                  </Link>
                )}
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
                      removeUser.reset();
                      resend.reset();
                      status.mutate({ id: user.id, status: next });
                    }}
                    disabled={actionPending}
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
                      className="secondary compact"
                      onClick={() => {
                        removeUser.reset();
                        status.reset();
                        resend.mutate(user.id);
                      }}
                      disabled={actionPending}
                      aria-label={`Einladung an ${user.display_name} erneut senden`}
                    >
                      <RotateCcw />{" "}
                      {resend.isPending && resend.variables === user.id
                        ? "Einladung wird versendet …"
                        : "Einladung erneut senden"}
                    </button>
                  )}
                  {has("data.correct") && (
                    <button
                      className="secondary compact danger-text"
                      onClick={() => {
                        if (
                          window.confirm(
                            `${user.display_name} (${user.email}) endgültig löschen? Der Zugang und offene Einladungen werden entfernt. Vorhandene Vorgänge bleiben erhalten und werden „Gelöschter Benutzer“ zugeordnet. Das Löschen kann nicht rückgängig gemacht werden.`,
                          )
                        ) {
                          resend.reset();
                          status.reset();
                          removeUser.mutate(user.id);
                        }
                      }}
                      disabled={actionPending}
                      aria-label={`Benutzer ${user.display_name} löschen`}
                    >
                      <Trash2 /> Löschen
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

function UserRoleEditor({
  user,
  ownProfile,
  isSuperAdmin,
}: {
  user: UserRow;
  ownProfile: boolean;
  isSuperAdmin: boolean;
}) {
  const client = useQueryClient();
  const { refreshAppSession } = useAuth();
  const { hash } = useLocation();
  const editorRef = useRef<HTMLFieldSetElement>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? user.roles.map((role) => role.id);
  const {
    data: options = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-user-role-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id,name,system_key")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data as RoleOption[]).filter(isSupportedRole);
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_user_roles", {
        p_profile_id: user.id,
        p_role_ids: selected,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-users"] });
      setDraft(null);
      if (ownProfile) await refreshAppSession();
    },
  });
  const locked = ownProfile && !isSuperAdmin;
  useEffect(() => {
    if (hash === "#roles" && !isLoading)
      editorRef.current?.scrollIntoView({ block: "start" });
  }, [hash, isLoading, user.id]);
  const changed =
    selected.length !== user.roles.length ||
    selected.some((id) => !user.roles.some((role) => role.id === id));
  return (
    <fieldset className="role-assignment" id="roles" ref={editorRef}>
      <legend>Rollen zuweisen</legend>
      <p>
        Rollen auswählen und gemeinsam speichern. Bestehende Zuordnungen können
        Sie jederzeit ändern.
      </p>
      {locked && <p>Ein Super Admin kann Ihre eigenen Rollen ändern.</p>}
      {isLoading ? (
        <p role="status">Rollen werden geladen …</p>
      ) : error ? (
        <div className="alert error" role="alert">
          Rollen konnten nicht geladen werden.
        </div>
      ) : options.length === 0 ? (
        <p>Keine Rollen verfügbar.</p>
      ) : (
        options.map((role) => (
          <label key={role.id}>
            <input
              type="checkbox"
              checked={selected.includes(role.id)}
              disabled={
                locked ||
                save.isPending ||
                (role.system_key === "super_admin" && !isSuperAdmin)
              }
              onChange={(event) => {
                save.reset();
                setDraft(
                  event.target.checked
                    ? [...selected, role.id]
                    : selected.filter((id) => id !== role.id),
                );
              }}
            />
            <span>
              <strong>{role.name}</strong>
              {role.system_key && roleDescriptions[role.system_key] && (
                <small>{roleDescriptions[role.system_key]}</small>
              )}
            </span>
          </label>
        ))
      )}
      {save.error && (
        <div className="alert error" role="alert">
          {assignmentError(
            save.error,
            "Rollen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
          )}
        </div>
      )}
      {save.isSuccess && (
        <div className="alert success" role="status">
          Rollen gespeichert.
        </div>
      )}
      {!locked && (
        <div className="form-actions">
          {changed && (
            <button
              className="secondary"
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setDraft(null);
                save.reset();
              }}
            >
              Zurücksetzen
            </button>
          )}
          <button
            className="primary"
            type="button"
            disabled={!changed || isLoading || Boolean(error) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Wird gespeichert …" : "Rollen speichern"}
          </button>
        </div>
      )}
    </fieldset>
  );
}

function EmployeeDataEditor({
  user,
  ownProfile,
}: {
  user: UserRow;
  ownProfile: boolean;
}) {
  const client = useQueryClient();
  const { refreshAppSession } = useAuth();
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form);
      const text = (name: string) => String(values.get(name) ?? "").trim();
      const optional = (name: string) => text(name) || null;
      const { data, error } = await supabase.functions.invoke(
        "admin-update-employee",
        {
          body: {
            profileId: user.id,
            firstName: text("firstName"),
            lastName: text("lastName"),
            displayName: text("displayName"),
            employeeNumber: optional("employeeNumber"),
            workPhone: optional("workPhone"),
            jobTitle: optional("jobTitle"),
            employmentStatus: text("employmentStatus"),
            startDate: optional("startDate"),
            endDate: optional("endDate"),
            birthDate: optional("birthDate"),
            weeklyHours: text("weeklyHours")
              ? Number(text("weeklyHours"))
              : null,
          },
        },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Die Mitarbeiterdaten konnten nicht gespeichert werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["admin-team-people"] }),
        client.invalidateQueries({ queryKey: ["conversation-people"] }),
        client.invalidateQueries({ queryKey: ["own-profile"] }),
      ]);
      if (ownProfile) await refreshAppSession();
    },
  });
  const fields = [
    ["firstName", "Vorname", user.first_name ?? "", "text", "80"],
    ["lastName", "Nachname", user.last_name ?? "", "text", "80"],
    ["displayName", "Anzeigename", user.display_name, "text", "120"],
    [
      "employeeNumber",
      "Mitarbeiternummer",
      user.employee_number ?? "",
      "text",
      "80",
    ],
    ["workPhone", "Telefon", user.work_phone ?? "", "tel", "40"],
    ["jobTitle", "Funktion", user.job_title ?? "", "text", "120"],
  ];
  return (
    <section className="settings-card">
      <div className="settings-title">
        <UserCog />
        <div>
          <h3>Mitarbeiterdaten bearbeiten</h3>
          <p>Persönliche Angaben und dienstliche Daten ändern.</p>
        </div>
      </div>
      <form
        className="form two-column"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(event.currentTarget);
        }}
      >
        {fields.map(([name, label, value, type, maxLength]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              type={type}
              defaultValue={value}
              maxLength={Number(maxLength)}
              required={[
                "firstName",
                "lastName",
                "displayName",
                "email",
              ].includes(name)}
              disabled={save.isPending}
            />
          </label>
        ))}
        <label>
          Beschäftigungsstatus
          <select
            name="employmentStatus"
            defaultValue={user.employment_status ?? "active"}
            disabled={save.isPending}
          >
            <option value="active">Aktiv</option>
            <option value="leave">In Abwesenheit</option>
            <option value="inactive">Inaktiv</option>
            <option value="terminated">Ausgeschieden</option>
          </select>
        </label>
        <label>
          Eintritt
          <input
            name="startDate"
            type="date"
            defaultValue={user.start_date ?? ""}
            disabled={save.isPending}
          />
        </label>
        <label>
          Austritt
          <input
            name="endDate"
            type="date"
            defaultValue={user.end_date ?? ""}
            disabled={save.isPending}
          />
        </label>
        <label>
          Geburtsdatum
          <input
            name="birthDate"
            type="date"
            defaultValue={user.birth_date ?? ""}
            disabled={save.isPending}
          />
        </label>
        <label>
          Wochenstunden
          <input
            name="weeklyHours"
            type="number"
            min="0"
            max="80"
            step="0.25"
            defaultValue={user.weekly_hours ?? ""}
            disabled={save.isPending}
          />
        </label>
        <p className="full">
          Beschäftigungsstatus und Zugang sind getrennt. Den Zugang ändern Sie
          in der Benutzerliste.
        </p>
        {save.error && (
          <div className="alert error full" role="alert">
            {save.error.message}
          </div>
        )}
        {save.isSuccess && (
          <div className="alert success full" role="status">
            Mitarbeiterdaten gespeichert.
          </div>
        )}
        <div className="form-actions full">
          <button className="primary" disabled={save.isPending}>
            {save.isPending
              ? "Wird gespeichert …"
              : "Mitarbeiterdaten speichern"}
          </button>
        </div>
      </form>
    </section>
  );
}

function EmployeeEmailEditor({
  user,
  ownProfile,
}: {
  user: UserRow;
  ownProfile: boolean;
}) {
  const client = useQueryClient();
  const { refreshAppSession } = useAuth();
  const [email, setEmail] = useState(user.email);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "admin-update-employee-email",
        {
          body: { profileId: user.id, email: email.trim().toLowerCase() },
        },
      );
      if (error)
        throw new Error(
          await functionErrorMessage(
            error,
            "Die E-Mail-Adresse konnte nicht geändert werden.",
          ),
        );
      if (data?.error) throw new Error(data.error.message);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["own-profile"] }),
        client.invalidateQueries({ queryKey: ["conversation-people"] }),
      ]);
      if (ownProfile) await refreshAppSession();
    },
  });
  return (
    <section className="settings-card">
      <div className="settings-title">
        <MailPlus />
        <div>
          <h3>E-Mail-Adresse korrigieren</h3>
          <p>Die dienstliche E-Mail ist zugleich die Anmeldeadresse.</p>
        </div>
      </div>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Dienstliche E-Mail
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              save.reset();
            }}
            disabled={save.isPending}
          />
        </label>
        <p>
          Beim Ändern wird keine Nachricht versendet. Frühere Einladungs- und
          Passwortlinks werden ungültig. Bei „Eingeladen“ senden Sie
          anschließend über die Benutzerliste eine neue Einladung an die
          korrigierte Adresse.
        </p>
        {ownProfile && (
          <p>
            Sie ändern Ihre eigene Anmeldeadresse. Verwenden Sie beim nächsten
            Anmelden die neue Adresse.
          </p>
        )}
        {save.error && (
          <div className="alert error" role="alert">
            {save.error.message}
          </div>
        )}
        {save.isSuccess && (
          <div className="alert success" role="status">
            E-Mail-Adresse geändert. Es wurde keine Nachricht versendet.
          </div>
        )}
        <div className="form-actions">
          <button className="primary" disabled={save.isPending}>
            {save.isPending ? "Wird geändert …" : "E-Mail-Adresse ändern"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function AdminUserDetail() {
  const { userId } = useParams();
  const { appSession, has } = useAuth();
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
  const {
    data: teamOptions = [],
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery({
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
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      if (!userId) throw new Error("Benutzer fehlt.");
      const { error } = await supabase.rpc("set_user_team", {
        p_profile_id: userId,
        p_team_id: input.id,
        p_enabled: input.enabled,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["admin-team-people"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["conversation-people"] }),
      ]),
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
      {has("users.manage") && has("data.correct") && (
        <>
          <EmployeeDataEditor
            key={`data-${user.id}`}
            user={user}
            ownProfile={user.id === appSession?.profile.id}
          />
          <EmployeeEmailEditor
            key={`email-${user.id}`}
            user={user}
            ownProfile={user.id === appSession?.profile.id}
          />
        </>
      )}
      <section className="settings-card">
        <div className="settings-title">
          <ShieldCheck />
          <div>
            <h3>Rollen und Teams</h3>
            <p>Zugriff und Teamzugehörigkeit verwalten.</p>
          </div>
        </div>
        {has("users.manage") ? (
          <div className="assignment-grid">
            <UserRoleEditor
              key={user.id}
              user={user}
              ownProfile={user.id === appSession?.profile.id}
              isSuperAdmin={Boolean(
                data
                  ?.find((candidate) => candidate.id === appSession?.profile.id)
                  ?.roles.some((role) => role.system_key === "super_admin"),
              )}
            />
            <fieldset>
              <legend>Teams</legend>
              {teamsLoading && <p role="status">Teams werden geladen …</p>}
              {teamsError && (
                <div className="alert error" role="alert">
                  Teams konnten nicht geladen werden.
                </div>
              )}
              {!teamsLoading && !teamsError && teamOptions.length === 0 && (
                <p>Keine Teams vorhanden.</p>
              )}
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
          <div className="alert error" role="alert">
            Die Teamzuordnung konnte nicht gespeichert werden. Bitte versuchen
            Sie es erneut.
          </div>
        )}
        {assignment.isSuccess && (
          <div className="alert success" role="status">
            Teamzuordnung gespeichert.
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
              <option value="1">Eine Freigabe (Standard)</option>
              <option value="2">
                Zwei Freigaben durch verschiedene Personen
              </option>
            </select>
            <small>
              Bei einer Freigabe ist der Urlaub nach „Genehmigen“ endgültig
              freigegeben. Eine weitere Person ist nicht erforderlich. Offene
              Anträge in Prüfung können ebenfalls so abgeschlossen werden.
            </small>
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

function InviteForm({
  onDone,
  onInvited,
}: {
  onDone: () => void;
  onInvited: (delivery: InviteDelivery) => void;
}) {
  const [message, setMessage] = useState<{
    type: "error" | "success" | "warning";
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
      return (data as Role[]).filter(isSupportedRole);
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
      return parseInviteDelivery(data);
    },
    onSuccess: (data) => {
      setMessage({
        type:
          data.warning ||
          data.delivery === "failed" ||
          data.delivery === "manual_link"
            ? "warning"
            : "success",
        text: inviteDeliveryMessage(data),
      });
      onInvited(data);
    },
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
      <p className="invite-expiry-hint">{inviteExpiryText}</p>
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
          <div
            className={`alert ${message.type} full`}
            role={message.type === "error" ? "alert" : "status"}
          >
            {message.text}
          </div>
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
      return (data as Role[]).filter(isSupportedRole);
    },
    enabled: has("roles.view") || has("roles.manage"),
  });
  const {
    data: permissions = [],
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useQuery({
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
  if (!has("roles.view") && !has("roles.manage"))
    return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Rollen und Berechtigungen</h2>
          <p>
            Es stehen Super Admin, Teamleitung und Mitarbeiter zur Verfügung.
            Super Admins haben immer vollen Zugriff.
          </p>
        </div>
      </section>
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
                <p>
                  {role.system_key === "super_admin"
                    ? "Voller Zugriff auf alle Funktionen"
                    : `${role.role_permissions.length} Berechtigungen`}
                </p>
              </div>
              <div className="permission-cloud">
                {role.system_key === "super_admin" ? (
                  <span>Alle Berechtigungen</span>
                ) : (
                  role.role_permissions
                    .slice(0, 8)
                    .map((p) => (
                      <span key={p.permission_key}>{p.permission_key}</span>
                    ))
                )}
                {role.system_key !== "super_admin" &&
                  role.role_permissions.length > 8 && (
                    <span>+{role.role_permissions.length - 8} weitere</span>
                  )}
              </div>
              {has("roles.manage") && role.system_key !== "super_admin" && (
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
                  {permissionsLoading && (
                    <p role="status">Berechtigungen werden geladen …</p>
                  )}
                  {permissionsError && (
                    <div className="alert error" role="alert">
                      Berechtigungen konnten nicht geladen werden.
                    </div>
                  )}
                  {permissions
                    .filter(
                      (permission) =>
                        !["leave.create_own", "sick_leave.create_own"].includes(
                          permission.key,
                        ) && permission.key !== "data.correct",
                    )
                    .map((permission) => {
                      const active = role.role_permissions.some(
                        (p) => p.permission_key === permission.key,
                      );
                      const absenceCreation = [
                        "leave.create",
                        "sick_leave.create",
                      ].includes(permission.key);
                      const adminRole = role.system_key === "super_admin";
                      return (
                        <label key={permission.key}>
                          <input
                            type="checkbox"
                            checked={absenceCreation ? adminRole : active}
                            disabled={
                              togglePermission.isPending || absenceCreation
                            }
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
                            <small>
                              {absenceCreation
                                ? "Urlaub und Krankmeldungen werden ausschließlich von Super Admins erfasst."
                                : permission.description}
                            </small>
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

function TeamMemberPicker({
  people,
  selected,
  onChange,
  disabled,
}: {
  people: TeamPerson[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = people.filter((person) =>
    `${person.display_name} ${person.email}`
      .toLocaleLowerCase("de")
      .includes(search.trim().toLocaleLowerCase("de")),
  );
  return (
    <fieldset className="team-member-picker full" disabled={disabled}>
      <legend>Mitglieder auswählen · {selected.length} ausgewählt</legend>
      <label className="search">
        <Search />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name oder E-Mail …"
          aria-label="Teammitglieder durchsuchen"
        />
      </label>
      <div className="team-member-options">
        {filtered.length === 0 ? (
          <p>Keine passenden Mitarbeitenden gefunden.</p>
        ) : (
          filtered.map((person) => (
            <label className="team-member-option" key={person.id}>
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span>
                <strong>{person.display_name}</strong>
                <small>{person.email}</small>
              </span>
              {person.status !== "active" && (
                <small>{statusLabel(person.status)}</small>
              )}
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

function TeamEditor({
  team,
  people,
  onDone,
  onSaved,
}: {
  team?: Team;
  people: TeamPerson[];
  onDone: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>(() =>
    team
      ? people
          .filter((person) => person.team_ids.includes(team.id))
          .map((person) => person.id)
      : [],
  );
  const candidates = people.filter(
    (person) =>
      person.status === "active" ||
      person.status === "invited" ||
      Boolean(team && person.team_ids.includes(team.id)),
  );
  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (team) {
        const { error } = await supabase.rpc("set_team_members", {
          p_team_id: team.id,
          p_member_ids: selected,
        });
        if (error) throw error;
      } else {
        const fd = new FormData(form);
        const name = String(fd.get("name") ?? "").trim();
        if (name.length < 2)
          throw new Error(
            "Der Teamname muss mindestens zwei Zeichen enthalten.",
          );
        const { error } = await supabase.rpc("create_team", {
          p_name: name,
          p_location_name: String(fd.get("location") ?? "").trim() || null,
          p_member_ids: selected,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-teams"] }),
        client.invalidateQueries({ queryKey: ["admin-team-people"] }),
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["admin-user-team-options"] }),
        client.invalidateQueries({ queryKey: ["teams"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["conversation-people"] }),
        client.invalidateQueries({ queryKey: ["conversation-teams"] }),
        client.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      onSaved();
      onDone();
    },
  });
  return (
    <form
      className="form two-column team-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      {!team && (
        <>
          <label>
            Teamname
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              disabled={save.isPending}
            />
          </label>
          <label>
            Standort
            <input name="location" maxLength={100} disabled={save.isPending} />
          </label>
        </>
      )}
      <p className="full">
        {team
          ? "Auswahl ergänzen oder Häkchen entfernen und die Mitglieder speichern."
          : "Mitglieder direkt hinzufügen. Die Auswahl können Sie später jederzeit ändern."}
      </p>
      <TeamMemberPicker
        people={candidates}
        selected={selected}
        onChange={setSelected}
        disabled={save.isPending}
      />
      {save.error && (
        <div className="alert error full" role="alert">
          {assignmentError(
            save.error,
            team
              ? "Mitglieder konnten nicht gespeichert werden. Bitte versuchen Sie es erneut."
              : "Team konnte nicht angelegt werden. Prüfen Sie den Namen und versuchen Sie es erneut.",
          )}
        </div>
      )}
      <div className="form-actions full">
        <button
          type="button"
          className="secondary"
          onClick={onDone}
          disabled={save.isPending}
        >
          Abbrechen
        </button>
        <button className="primary" disabled={save.isPending}>
          {save.isPending
            ? "Wird gespeichert …"
            : team
              ? "Mitglieder speichern"
              : "Team speichern"}
        </button>
      </div>
    </form>
  );
}

export function AdminTeams() {
  const { has } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
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
          "id,name,location_name,active,lead_profile_id,locations(name),profiles!teams_lead_profile_id_fkey(display_name)",
        )
        .order("name");
      if (error) throw error;
      return data as unknown as Array<
        Team & {
          location_name: string | null;
          active: boolean;
          locations: { name: string } | null;
          profiles: { display_name: string } | null;
        }
      >;
    },
    enabled: has("teams.manage"),
  });
  const {
    data: people = [],
    isLoading: peopleLoading,
    error: peopleError,
    refetch: refetchPeople,
  } = useQuery({
    queryKey: ["admin-team-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_team_members");
      if (error) throw error;
      return data as TeamPerson[];
    },
    enabled: has("teams.manage"),
  });
  const toggle = useMutation({
    mutationFn: async (team: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from("teams")
        .update({ active: !team.active })
        .eq("id", team.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Team konnte nicht geändert werden.");
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["admin-teams"] }),
        client.invalidateQueries({ queryKey: ["admin-team-people"] }),
        client.invalidateQueries({ queryKey: ["admin-user-team-options"] }),
        client.invalidateQueries({ queryKey: ["teams"] }),
        client.invalidateQueries({ queryKey: ["directory"] }),
        client.invalidateQueries({ queryKey: ["conversation-teams"] }),
      ]),
  });
  if (!has("teams.manage")) return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="page-stack">
      <section className="page-intro" data-tour-id="admin">
        <div>
          <h2>Teams und Standorte</h2>
          <p>
            Teams anlegen und Mitglieder jederzeit hinzufügen oder entfernen.
          </p>
        </div>
        <button
          className="primary compact"
          onClick={() => {
            setOpen((value) => !value);
            setNotice("");
          }}
        >
          <Users /> Team anlegen
        </button>
      </section>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {peopleError && (
        <div className="alert error" role="alert">
          Mitarbeitende konnten nicht geladen werden.{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => void refetchPeople()}
          >
            Erneut laden
          </button>
        </div>
      )}
      {open && (
        <section className="editor-card">
          <h3>Neues Team</h3>
          {peopleLoading ? (
            <p role="status">Mitarbeitende werden geladen …</p>
          ) : (
            !peopleError && (
              <TeamEditor
                people={people}
                onDone={() => setOpen(false)}
                onSaved={() => setNotice("Team mit Mitgliedern angelegt.")}
              />
            )
          )}
        </section>
      )}
      {toggle.error && (
        <div className="alert error" role="alert">
          Der Teamstatus konnte nicht geändert werden.
        </div>
      )}
      {isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
        </div>
      ) : error ? (
        <div className="alert error" role="alert">
          Teams konnten nicht geladen werden.
        </div>
      ) : data.length === 0 ? (
        <section className="empty">
          <h3>Noch keine Teams</h3>
          <p>
            Legen Sie ein Team an und wählen Sie die zugehörigen Mitarbeitenden
            aus.
          </p>
        </section>
      ) : (
        <div className="role-grid team-grid">
          {data.map((team) => {
            const members = people.filter((person) =>
              person.team_ids.includes(team.id),
            );
            return (
              <article className="role-card team-card" key={team.id}>
                <div>
                  <span className="role-icon">
                    <Users />
                  </span>
                  <h3>{team.name}</h3>
                  <p>
                    {team.locations?.name ??
                      team.location_name ??
                      "Kein Standort"}{" "}
                    · {team.profiles?.display_name ?? "Keine Teamleitung"}
                  </p>
                </div>
                <span
                  className={`status ${team.active ? "success" : "neutral"}`}
                >
                  {team.active ? "Aktiv" : "Inaktiv"}
                </span>
                {peopleLoading ? (
                  <p role="status">Mitglieder werden geladen …</p>
                ) : (
                  !peopleError && (
                    <>
                      <p>
                        {members.length}{" "}
                        {members.length === 1 ? "Mitglied" : "Mitglieder"}
                      </p>
                      <div className="permission-cloud team-member-summary">
                        {members.slice(0, 8).map((person) => (
                          <span key={person.id}>{person.display_name}</span>
                        ))}
                        {members.length > 8 && (
                          <span>+{members.length - 8} weitere</span>
                        )}
                      </div>
                    </>
                  )
                )}
                <div className="form-actions team-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      peopleLoading || Boolean(peopleError) || !team.active
                    }
                    onClick={() => {
                      setEditing(editing === team.id ? null : team.id);
                      setNotice("");
                    }}
                  >
                    {editing === team.id
                      ? "Mitglieder schließen"
                      : "Mitglieder verwalten"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={toggle.isPending || editing === team.id}
                    onClick={() => toggle.mutate(team)}
                  >
                    {toggle.isPending && toggle.variables.id === team.id
                      ? "Wird gespeichert …"
                      : team.active
                        ? "Deaktivieren"
                        : "Aktivieren"}
                  </button>
                </div>
                {!team.active && (
                  <p>Aktivieren Sie das Team, um Mitglieder zu ändern.</p>
                )}
                {editing === team.id && !peopleLoading && !peopleError && (
                  <TeamEditor
                    key={team.id}
                    team={team}
                    people={people}
                    onDone={() => setEditing(null)}
                    onSaved={() =>
                      setNotice(`Mitglieder von ${team.name} gespeichert.`)
                    }
                  />
                )}
              </article>
            );
          })}
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
      <section className="page-intro" data-tour-id="admin">
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
