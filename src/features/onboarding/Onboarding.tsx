import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  LogOut,
  MailPlus,
  MapPin,
  Plus,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useNavigate } from "react-router";
import { functionErrorMessage } from "../../lib/function-errors";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import {
  normalizeTeamNames,
  parseNumberList,
  prioritizeTeamNames,
  validateInvites,
  type InviteRole,
  type PlannedInvite,
} from "./model";

type OnboardingDefaults = {
  organization_name: string;
  display_name: string;
  first_name: string;
  last_name: string;
  work_phone: string;
  job_title: string;
  timezone: string;
  location_name: string;
  department_name: string;
  team_name: string;
  leave_approval_steps: number;
  mileage_reminder_days: number[];
  mileage_overdue_day: number;
  birthday_reminder_days: number[];
  message_edit_window_minutes: number;
  email_notifications: boolean;
  push_notifications: boolean;
};

type OnboardingCatalog = {
  roles: InviteRole[];
  teams: Array<{ id: string; name: string }>;
  pendingInvites: PlannedInvite[];
};

type OnboardingForm = {
  organizationName: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workPhone: string;
  jobTitle: string;
  timezone: string;
  locationName: string;
  departmentName: string;
  teamNames: string[];
  invites: PlannedInvite[];
  leaveApprovalSteps: string;
  mileageReminderDays: string;
  mileageOverdueDay: string;
  birthdayReminderDays: string;
  messageEditWindowMinutes: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
};

type PreparedTeam = { id: string; name: string };
type InviteOutcome = {
  email: string;
  name: string;
  delivery: "email" | "manual_link";
  manualInviteUrl: string | null;
};

function ManualInviteLink({ result }: { result: InviteOutcome }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  if (!result.manualInviteUrl) return null;
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(result.manualInviteUrl ?? "");
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };
  return (
    <div className="onboarding-manual-link">
      <label>
        {result.name} · {result.email}
        <input
          readOnly
          value={result.manualInviteUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <button type="button" className="secondary" onClick={() => void copy()}>
        {copyState === "copied" ? "Kopiert" : "Link kopieren"}
      </button>
      {copyState === "error" && (
        <small role="alert">
          Bitte den Link markieren und manuell kopieren.
        </small>
      )}
    </div>
  );
}

const makeInvite = (roleId = "", teamName = ""): PlannedInvite => ({
  id: crypto.randomUUID(),
  firstName: "",
  lastName: "",
  email: "",
  roleId,
  teamName,
});

const emptyForm: OnboardingForm = {
  organizationName: "Alberring Ambulante Pflege",
  displayName: "Alberring Admin",
  firstName: "Alberring",
  lastName: "Administration",
  workPhone: "",
  jobTitle: "Administration",
  timezone: "Europe/Berlin",
  locationName: "Hauptstelle",
  departmentName: "Verwaltung",
  teamNames: ["Verwaltung"],
  invites: [],
  leaveApprovalSteps: "1",
  mileageReminderDays: "25",
  mileageOverdueDay: "2",
  birthdayReminderDays: "7, 0",
  messageEditWindowMinutes: "15",
  emailNotifications: false,
  pushNotifications: false,
};

const defaultsToForm = (
  defaults: OnboardingDefaults,
  catalog: OnboardingCatalog,
): OnboardingForm => {
  const teamNames = catalog.teams.length
    ? prioritizeTeamNames(
        catalog.teams.map((team) => team.name),
        defaults.team_name,
      )
    : [defaults.team_name || emptyForm.teamNames[0]];
  const employeeRole =
    catalog.roles.find((role) => role.systemKey === "employee")?.id ??
    catalog.roles[0]?.id ??
    "";
  const invites = catalog.pendingInvites?.length
    ? catalog.pendingInvites
    : [makeInvite(employeeRole, teamNames[0])];
  return {
    organizationName: defaults.organization_name,
    displayName: defaults.display_name,
    firstName: defaults.first_name,
    lastName: defaults.last_name,
    workPhone: defaults.work_phone,
    jobTitle: defaults.job_title,
    timezone: defaults.timezone,
    locationName: defaults.location_name || emptyForm.locationName,
    departmentName: defaults.department_name || emptyForm.departmentName,
    teamNames,
    invites,
    leaveApprovalSteps: String(defaults.leave_approval_steps),
    mileageReminderDays: defaults.mileage_reminder_days.join(", "),
    mileageOverdueDay: String(defaults.mileage_overdue_day),
    birthdayReminderDays: defaults.birthday_reminder_days.join(", "),
    messageEditWindowMinutes: String(defaults.message_edit_window_minutes),
    emailNotifications: defaults.email_notifications,
    pushNotifications: defaults.push_notifications,
  };
};

const steps = [
  { title: "Willkommen", short: "Überblick", icon: Sparkles },
  { title: "Organisation", short: "Betrieb & Standort", icon: Building2 },
  { title: "Admin-Profil", short: "Persönliche Angaben", icon: UserRound },
  { title: "Teams", short: "Struktur aufbauen", icon: Layers3 },
  { title: "Mitarbeitende", short: "Zugänge vorbereiten", icon: UsersRound },
  {
    title: "Arbeitsabläufe",
    short: "Regeln & Hinweise",
    icon: SlidersHorizontal,
  },
  { title: "Startklar", short: "Prüfen & einrichten", icon: Rocket },
];

const optionalNameIsValid = (value: string) => {
  const length = value.trim().length;
  return length === 0 || (length >= 2 && length <= 120);
};

export function Onboarding() {
  const { appSession, refreshAppSession, signOut } = useAuth();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [formState, setForm] = useState<OnboardingForm | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [preparedTeams, setPreparedTeams] = useState<PreparedTeam[] | null>(
    null,
  );
  const [inviteResults, setInviteResults] = useState<
    Record<string, InviteOutcome>
  >({});
  const [completed, setCompleted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const onboardingQuery = useQuery({
    queryKey: ["admin-onboarding-bundle", appSession?.profile.id],
    enabled: Boolean(appSession?.onboarding.required),
    queryFn: async () => {
      const [defaultsResult, catalogResult] = await Promise.all([
        supabase.rpc("get_admin_onboarding_defaults").single(),
        supabase.rpc("get_admin_onboarding_catalog"),
      ]);
      if (defaultsResult.error) throw defaultsResult.error;
      if (catalogResult.error) throw catalogResult.error;
      return {
        defaults: defaultsResult.data as OnboardingDefaults,
        catalog: catalogResult.data as unknown as OnboardingCatalog,
      };
    },
  });

  const form =
    formState ??
    (onboardingQuery.data
      ? defaultsToForm(
          onboardingQuery.data.defaults,
          onboardingQuery.data.catalog,
        )
      : emptyForm);
  const roles = onboardingQuery.data?.catalog.roles ?? [];

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, completed]);

  useEffect(() => {
    if (!formState || completed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [completed, formState]);

  const update = <Key extends keyof OnboardingForm>(
    key: Key,
    value: OnboardingForm[Key],
  ) => {
    setStepError(null);
    setForm((current) => ({ ...(current ?? form), [key]: value }));
  };

  const updateInvite = (
    id: string,
    key: keyof Omit<PlannedInvite, "id">,
    value: string,
  ) => {
    setStepError(null);
    update(
      "invites",
      form.invites.map((invite) =>
        invite.id === id ? { ...invite, [key]: value } : invite,
      ),
    );
  };

  const validateStep = (candidate: number) => {
    try {
      if (candidate === 1) {
        if (
          form.organizationName.trim().length < 2 ||
          form.organizationName.trim().length > 160
        )
          return "Bitte geben Sie den vollständigen Namen des Pflegedienstes an.";
        if (!form.timezone.trim()) return "Bitte wählen Sie eine Zeitzone aus.";
        if (
          !optionalNameIsValid(form.locationName) ||
          !optionalNameIsValid(form.departmentName)
        )
          return "Standort und Bereich benötigen jeweils mindestens zwei Zeichen.";
      }
      if (candidate === 2) {
        if (
          form.displayName.trim().length < 2 ||
          !form.firstName.trim() ||
          !form.lastName.trim()
        )
          return "Anzeigename, Vorname und Nachname müssen ausgefüllt sein.";
        if (form.workPhone.length > 40 || form.jobTitle.length > 120)
          return "Telefonnummer oder Funktion ist zu lang.";
      }
      if (candidate === 3) normalizeTeamNames(form.teamNames);
      if (candidate === 4)
        validateInvites(
          form.invites,
          roles,
          normalizeTeamNames(form.teamNames),
        );
      if (candidate === 5) {
        parseNumberList(form.mileageReminderDays, 1, 31);
        parseNumberList(form.birthdayReminderDays, 0, 365);
        const overdueDay = Number(form.mileageOverdueDay);
        const editWindow = Number(form.messageEditWindowMinutes);
        if (!Number.isInteger(overdueDay) || overdueDay < 1 || overdueDay > 28)
          return "Der Überfälligkeitstag muss zwischen 1 und 28 liegen.";
        if (
          !Number.isInteger(editWindow) ||
          editWindow < 1 ||
          editWindow > 1440
        )
          return "Das Nachrichtenfenster muss zwischen 1 und 1.440 Minuten liegen.";
      }
    } catch (validationError) {
      return validationError instanceof Error
        ? validationError.message
        : "Bitte prüfen Sie Ihre Angaben.";
    }
    return null;
  };

  const next = () => {
    const validationError = validateStep(step);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const complete = useMutation({
    mutationFn: async () => {
      for (let candidate = 1; candidate <= 5; candidate += 1) {
        const validationError = validateStep(candidate);
        if (validationError) throw new Error(validationError);
      }
      const teamNames = normalizeTeamNames(form.teamNames);
      const invites = validateInvites(form.invites, roles, teamNames);
      const { data, error } = await supabase.rpc(
        "prepare_admin_onboarding_v2",
        {
          p_organization_name: form.organizationName.trim(),
          p_display_name: form.displayName.trim(),
          p_first_name: form.firstName.trim(),
          p_last_name: form.lastName.trim(),
          p_work_phone: form.workPhone.trim(),
          p_job_title: form.jobTitle.trim(),
          p_timezone: form.timezone.trim(),
          p_location_name: form.locationName.trim(),
          p_department_name: form.departmentName.trim(),
          p_team_names: teamNames,
          p_leave_approval_steps: Number(form.leaveApprovalSteps),
          p_mileage_reminder_days: parseNumberList(
            form.mileageReminderDays,
            1,
            31,
          ),
          p_mileage_overdue_day: Number(form.mileageOverdueDay),
          p_birthday_reminder_days: parseNumberList(
            form.birthdayReminderDays,
            0,
            365,
          ),
          p_message_edit_window_minutes: Number(form.messageEditWindowMinutes),
          p_email_notifications: form.emailNotifications,
          p_push_notifications: form.pushNotifications,
        },
      );
      if (error)
        throw new Error(
          "Die Organisations- und Teamdaten konnten nicht sicher gespeichert werden.",
        );
      const teams = ((data as { teams?: PreparedTeam[] })?.teams ?? []).map(
        (team) => ({ id: String(team.id), name: String(team.name) }),
      );
      setPreparedTeams(teams);

      const outcomes = { ...inviteResults };
      const failures: string[] = [];
      const recoverPendingInvite = async (
        invite: PlannedInvite,
        team: PreparedTeam | undefined,
      ): Promise<InviteOutcome | null> => {
        const { data: users, error: usersError } =
          await supabase.rpc("admin_list_users");
        if (usersError) return null;
        const existing = (
          (users ?? []) as Array<{
            id: string;
            email: string;
            status: string;
            first_name?: string | null;
            last_name?: string | null;
            roles: Array<{ id: string }>;
            teams: Array<{ id: string }>;
          }>
        ).find(
          (candidate) =>
            candidate.status === "invited" &&
            candidate.email.toLocaleLowerCase("de") === invite.email,
        );
        const matchingTeam = team
          ? existing?.teams.some((candidate) => candidate.id === team.id)
          : existing?.teams.length === 0;
        if (
          !existing ||
          existing.first_name?.trim() !== invite.firstName ||
          existing.last_name?.trim() !== invite.lastName ||
          !existing.roles.some((candidate) => candidate.id === invite.roleId) ||
          !matchingTeam
        )
          return null;
        const { data, error } = await supabase.functions.invoke(
          "admin-resend-invite",
          { body: { profileId: existing.id } },
        );
        if (error || data?.error) return null;
        return {
          email: invite.email,
          name: `${invite.firstName} ${invite.lastName}`,
          delivery: data?.delivery === "manual_link" ? "manual_link" : "email",
          manualInviteUrl: data?.manualInviteUrl ?? null,
        };
      };
      for (const invite of invites) {
        if (outcomes[invite.id]) continue;
        const team = teams.find(
          (candidate) =>
            candidate.name.toLocaleLowerCase("de") ===
            invite.teamName.toLocaleLowerCase("de"),
        );
        try {
          if (invite.teamName && !team)
            throw new Error(
              `Das Team für ${invite.email} konnte nicht eindeutig zugeordnet werden.`,
            );
          const { data, error } = await supabase.functions.invoke(
            "admin-create-user",
            {
              body: {
                email: invite.email,
                firstName: invite.firstName,
                lastName: invite.lastName,
                roleId: invite.roleId,
                teamId: team?.id,
              },
            },
          );
          if (error)
            throw new Error(
              await functionErrorMessage(
                error,
                `Die Einladung für ${invite.email} ist fehlgeschlagen.`,
              ),
            );
          if (data?.error) throw new Error(data.error.message);
          outcomes[invite.id] = {
            email: invite.email,
            name: `${invite.firstName} ${invite.lastName}`,
            delivery:
              data?.delivery === "manual_link" ? "manual_link" : "email",
            manualInviteUrl: data?.manualInviteUrl ?? null,
          };
          setInviteResults({ ...outcomes });
        } catch (inviteError) {
          const recovered = await recoverPendingInvite(invite, team);
          if (recovered) {
            outcomes[invite.id] = recovered;
            setInviteResults({ ...outcomes });
            continue;
          }
          failures.push(
            inviteError instanceof Error
              ? inviteError.message
              : `Die Einladung für ${invite.email} ist fehlgeschlagen.`,
          );
        }
      }
      if (failures.length) {
        setStep(4);
        throw new Error(
          `${failures.join(" ")} Erfolgreiche Einladungen bleiben erhalten; beim erneuten Versuch werden nur fehlgeschlagene Einträge verarbeitet.`,
        );
      }

      const { error: finalizeError } = await supabase.rpc(
        "finalize_admin_onboarding",
      );
      if (finalizeError)
        throw new Error(
          "Die Einrichtung wurde gespeichert, konnte aber noch nicht finalisiert werden. Bitte versuchen Sie es erneut.",
        );
      return { teams, outcomes };
    },
    onSuccess: () => setCompleted(true),
  });

  const discoverApp = async () => {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      await refreshAppSession();
      navigate("/app/dashboard", { replace: true });
    } catch {
      setLaunchError(
        "Die App konnte noch nicht sicher geladen werden. Bitte versuchen Sie es erneut.",
      );
      setLaunching(false);
    }
  };

  if (onboardingQuery.isLoading)
    return (
      <main className="onboarding-loading">
        <div className="spinner" />
        <span>Ihre sichere Ersteinrichtung wird vorbereitet …</span>
      </main>
    );

  if (onboardingQuery.error || !onboardingQuery.data)
    return (
      <main className="onboarding-loading">
        <div className="onboarding-error-card">
          <ShieldCheck />
          <h1>Onboarding nicht verfügbar</h1>
          <p>
            Die exklusiven Einrichtungsdaten konnten nicht geladen werden. Sie
            können den Abruf erneut versuchen oder sich abmelden.
          </p>
          <div className="onboarding-error-actions">
            <button
              className="primary"
              onClick={() => void onboardingQuery.refetch()}
            >
              Erneut versuchen
            </button>
            <button className="secondary" onClick={() => void signOut()}>
              <LogOut /> Abmelden
            </button>
          </div>
        </div>
      </main>
    );

  const CurrentIcon = steps[step].icon;
  const activeInviteCount = form.invites.filter((invite) =>
    [invite.firstName, invite.lastName, invite.email].some((value) =>
      value.trim(),
    ),
  ).length;

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
        <div>
          <span>Exklusive Ersteinrichtung</span>
          <strong>info@alberring.de</strong>
        </div>
        <button
          type="button"
          className="onboarding-signout"
          aria-label="Abmelden"
          onClick={() => void signOut()}
        >
          <LogOut /> <span>Abmelden</span>
        </button>
      </header>

      <div className="onboarding-layout">
        <aside className="onboarding-progress" aria-label="Onboarding-Schritte">
          <span className="onboarding-progress-label">
            {completed
              ? "Einrichtung abgeschlossen"
              : `Schritt ${step + 1} von ${steps.length}`}
          </span>
          <ol>
            {steps.map(({ title, short, icon: Icon }, index) => (
              <li
                key={title}
                className={`${!completed && index === step ? "active" : ""} ${completed || index < step ? "complete" : ""}`}
                aria-current={!completed && index === step ? "step" : undefined}
              >
                <span className="onboarding-step-icon">
                  {completed || index < step ? <Check /> : <Icon />}
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{short}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="onboarding-security-note">
            <ShieldCheck />
            <span>
              Nur dieses Administratorkonto kann die Ersteinrichtung und die
              anschließende Produkttour öffnen.
            </span>
          </div>
        </aside>

        <section
          className={`onboarding-card ${completed ? "is-complete" : ""}`}
        >
          {completed ? (
            <div className="onboarding-success-screen">
              <span className="onboarding-success-icon">
                <Rocket />
              </span>
              <span className="eyebrow">ALBERRING IST STARTKLAR</span>
              <h1 ref={headingRef} tabIndex={-1}>
                Ihre digitale Zentrale steht.
              </h1>
              <p>
                Organisation, {preparedTeams?.length ?? form.teamNames.length}{" "}
                Teams, Arbeitsabläufe und {Object.keys(inviteResults).length}{" "}
                Einladungen wurden sicher vorbereitet.
              </p>
              {Object.values(inviteResults).some(
                (result) => result.manualInviteUrl,
              ) && (
                <div className="onboarding-manual-links">
                  <strong>Einmalige Einladungslinks sicher weitergeben</strong>
                  {Object.values(inviteResults).map((result) => (
                    <ManualInviteLink key={result.email} result={result} />
                  ))}
                </div>
              )}
              <div className="onboarding-launch-preview">
                <Sparkles />
                <div>
                  <strong>Als Nächstes: Mission Control</strong>
                  <span>
                    Eine interaktive Tour zeigt Ihnen die wichtigsten Funktionen
                    direkt in der App.
                  </span>
                </div>
              </div>
              <button
                className="primary onboarding-launch"
                onClick={discoverApp}
                disabled={launching}
              >
                {launching ? "App wird geöffnet …" : "App intelligent erkunden"}{" "}
                <ChevronRight />
              </button>
              {launchError && (
                <div
                  className="alert error onboarding-launch-error"
                  role="alert"
                >
                  {launchError}
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (step === steps.length - 1) complete.mutate();
                else next();
              }}
            >
              <div className="onboarding-card-heading" aria-live="polite">
                <span className="onboarding-current-icon">
                  <CurrentIcon />
                </span>
                <div>
                  <span className="eyebrow">{steps[step].short}</span>
                  <h1 ref={headingRef} tabIndex={-1}>
                    {steps[step].title}
                  </h1>
                </div>
              </div>

              {step === 0 && (
                <div className="onboarding-welcome">
                  <p className="onboarding-lead">
                    Bauen Sie jetzt die komplette Grundlage für Alberrings
                    digitalen Arbeitsalltag – strukturiert, sicher und sofort
                    einsatzbereit.
                  </p>
                  <div className="onboarding-feature-grid">
                    <article>
                      <Building2 />
                      <div>
                        <strong>Betriebsstruktur</strong>
                        <p>
                          Organisation, Standort, Bereich und mehrere Teams.
                        </p>
                      </div>
                    </article>
                    <article>
                      <UsersRound />
                      <div>
                        <strong>Erste Zugänge</strong>
                        <p>Mitarbeitende direkt Rollen und Teams zuordnen.</p>
                      </div>
                    </article>
                    <article>
                      <Clock3 />
                      <div>
                        <strong>Workflow-Regeln</strong>
                        <p>Urlaub, Erinnerungen und Nachrichtenbearbeitung.</p>
                      </div>
                    </article>
                    <article>
                      <Sparkles />
                      <div>
                        <strong>Mission Control</strong>
                        <p>
                          Danach führt eine smarte Tour durch alle
                          Kernfunktionen.
                        </p>
                      </div>
                    </article>
                  </div>
                  <div className="onboarding-info">
                    Alle Angaben können später in der Administration angepasst
                    werden. Einladungen werden erst beim finalen Abschluss
                    erzeugt.
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="onboarding-form-grid">
                  <label className="full">
                    Name des Pflegedienstes
                    <input
                      value={form.organizationName}
                      onChange={(event) =>
                        update("organizationName", event.target.value)
                      }
                      maxLength={160}
                      required
                    />
                  </label>
                  <label>
                    Zeitzone
                    <select
                      value={form.timezone}
                      onChange={(event) =>
                        update("timezone", event.target.value)
                      }
                    >
                      <option value="Europe/Berlin">Europa/Berlin</option>
                      <option value="Europe/Vienna">Europa/Wien</option>
                      <option value="Europe/Zurich">Europa/Zürich</option>
                    </select>
                  </label>
                  <label>
                    Hauptstandort
                    <input
                      value={form.locationName}
                      onChange={(event) =>
                        update("locationName", event.target.value)
                      }
                      maxLength={120}
                      placeholder="z. B. Hauptstelle"
                    />
                  </label>
                  <label className="full">
                    Bereich / Abteilung
                    <input
                      value={form.departmentName}
                      onChange={(event) =>
                        update("departmentName", event.target.value)
                      }
                      maxLength={120}
                      placeholder="z. B. Verwaltung"
                    />
                  </label>
                  <div className="onboarding-inline-note full">
                    <MapPin />
                    Standort und Bereich werden relational angelegt und direkt
                    mit den folgenden Teams verknüpft.
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="onboarding-form-grid">
                  <label className="full">
                    Anzeigename
                    <input
                      value={form.displayName}
                      onChange={(event) =>
                        update("displayName", event.target.value)
                      }
                      maxLength={120}
                      required
                    />
                  </label>
                  <label>
                    Vorname
                    <input
                      value={form.firstName}
                      onChange={(event) =>
                        update("firstName", event.target.value)
                      }
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Nachname
                    <input
                      value={form.lastName}
                      onChange={(event) =>
                        update("lastName", event.target.value)
                      }
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Funktion
                    <input
                      value={form.jobTitle}
                      onChange={(event) =>
                        update("jobTitle", event.target.value)
                      }
                      maxLength={120}
                      placeholder="z. B. Geschäftsführung"
                    />
                  </label>
                  <label>
                    Dienstliche Telefonnummer
                    <input
                      type="tel"
                      value={form.workPhone}
                      onChange={(event) =>
                        update("workPhone", event.target.value)
                      }
                      maxLength={40}
                      autoComplete="tel"
                      placeholder="z. B. +49 40 123456"
                    />
                  </label>
                  <div className="onboarding-account-badge full">
                    <ShieldCheck />
                    <span>
                      <strong>Exklusives Administratorkonto</strong>
                      <small>info@alberring.de · Rolle Super Admin</small>
                    </span>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="onboarding-builder">
                  <div className="onboarding-builder-intro">
                    <div>
                      <strong>Ihre Teams</strong>
                      <span>
                        Das erste Team wird als Primärteam zugeordnet. Bereits
                        vorhandene Teams und ihre Standorte bleiben unverändert.
                      </span>
                    </div>
                    <span className="onboarding-count">
                      {form.teamNames.length}/8
                    </span>
                  </div>
                  <div className="onboarding-team-list">
                    {form.teamNames.map((teamName, index) => (
                      <div className="onboarding-team-row" key={index}>
                        <span>{index + 1}</span>
                        <label>
                          <span className="sr-only">Team {index + 1}</span>
                          <input
                            value={teamName}
                            onChange={(event) =>
                              update(
                                "teamNames",
                                form.teamNames.map((current, currentIndex) =>
                                  currentIndex === index
                                    ? event.target.value
                                    : current,
                                ),
                              )
                            }
                            maxLength={120}
                            required
                          />
                        </label>
                        <button
                          type="button"
                          className="onboarding-remove"
                          aria-label={`Team ${teamName || index + 1} entfernen`}
                          disabled={form.teamNames.length === 1}
                          onClick={() =>
                            update(
                              "teamNames",
                              form.teamNames.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="onboarding-add-button"
                    disabled={form.teamNames.length >= 8}
                    onClick={() =>
                      update("teamNames", [...form.teamNames, "Neues Team"])
                    }
                  >
                    <Plus /> Weiteres Team anlegen
                  </button>
                </div>
              )}

              {step === 4 && (
                <div className="onboarding-builder">
                  <div className="onboarding-builder-intro">
                    <div>
                      <strong>Erste Mitarbeitende einladen</strong>
                      <span>
                        Optional. Leere Karten werden übersprungen; Rollen und
                        Teams sind sofort vorbelegt.
                      </span>
                    </div>
                    <span className="onboarding-count">
                      {activeInviteCount}/8
                    </span>
                  </div>
                  <div className="onboarding-invite-list">
                    {form.invites.map((invite, index) => (
                      <fieldset
                        className={`onboarding-invite-card ${inviteResults[invite.id] ? "is-complete" : ""}`}
                        key={invite.id}
                        disabled={Boolean(inviteResults[invite.id])}
                      >
                        <legend>Mitarbeiter/in {index + 1}</legend>
                        <button
                          type="button"
                          className="onboarding-remove"
                          aria-label={`Einladung ${index + 1} entfernen`}
                          onClick={() =>
                            update(
                              "invites",
                              form.invites.filter(
                                (candidate) => candidate.id !== invite.id,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </button>
                        <label>
                          Vorname
                          <input
                            value={invite.firstName}
                            onChange={(event) =>
                              updateInvite(
                                invite.id,
                                "firstName",
                                event.target.value,
                              )
                            }
                            maxLength={80}
                          />
                        </label>
                        <label>
                          Nachname
                          <input
                            value={invite.lastName}
                            onChange={(event) =>
                              updateInvite(
                                invite.id,
                                "lastName",
                                event.target.value,
                              )
                            }
                            maxLength={80}
                          />
                        </label>
                        <label className="full">
                          Dienstliche E-Mail
                          <input
                            type="email"
                            value={invite.email}
                            onChange={(event) =>
                              updateInvite(
                                invite.id,
                                "email",
                                event.target.value,
                              )
                            }
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Rolle
                          <select
                            value={invite.roleId}
                            onChange={(event) =>
                              updateInvite(
                                invite.id,
                                "roleId",
                                event.target.value,
                              )
                            }
                          >
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Team
                          <select
                            value={invite.teamName}
                            onChange={(event) =>
                              updateInvite(
                                invite.id,
                                "teamName",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Kein Team</option>
                            {form.teamNames.map((teamName) => (
                              <option key={teamName} value={teamName}>
                                {teamName}
                              </option>
                            ))}
                          </select>
                        </label>
                        {inviteResults[invite.id] && (
                          <div className="alert success full" role="status">
                            Einladung wurde bereits sicher angelegt.
                          </div>
                        )}
                      </fieldset>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="onboarding-add-button"
                    disabled={form.invites.length >= 8}
                    onClick={() => {
                      const employeeRole =
                        roles.find((role) => role.systemKey === "employee")
                          ?.id ??
                        roles[0]?.id ??
                        "";
                      update("invites", [
                        ...form.invites,
                        makeInvite(employeeRole, form.teamNames[0] ?? ""),
                      ]);
                    }}
                  >
                    <MailPlus /> Weitere Person einladen
                  </button>
                </div>
              )}

              {step === 5 && (
                <div className="onboarding-form-grid">
                  <label>
                    Freigabestufen für Urlaub
                    <select
                      value={form.leaveApprovalSteps}
                      onChange={(event) =>
                        update("leaveApprovalSteps", event.target.value)
                      }
                    >
                      <option value="1">Eine Freigabestufe</option>
                      <option value="2">Zwei Freigabestufen</option>
                    </select>
                  </label>
                  <label>
                    Nachrichten bearbeitbar (Minuten)
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={form.messageEditWindowMinutes}
                      onChange={(event) =>
                        update("messageEditWindowMinutes", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    Kilometer-Erinnerungstage
                    <input
                      value={form.mileageReminderDays}
                      onChange={(event) =>
                        update("mileageReminderDays", event.target.value)
                      }
                      placeholder="25, 28"
                      required
                    />
                    <small>Kommagetrennte Kalendertage, z. B. 25, 28</small>
                  </label>
                  <label>
                    Kilometer überfällig ab Tag
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={form.mileageOverdueDay}
                      onChange={(event) =>
                        update("mileageOverdueDay", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="full">
                    Geburtstagserinnerung in Tagen
                    <input
                      value={form.birthdayReminderDays}
                      onChange={(event) =>
                        update("birthdayReminderDays", event.target.value)
                      }
                      placeholder="7, 0"
                      required
                    />
                    <small>
                      7 erinnert eine Woche vorher, 0 am Geburtstag.
                    </small>
                  </label>
                  <fieldset className="onboarding-notification-options full">
                    <legend>Benachrichtigungen für dieses Admin-Konto</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.emailNotifications}
                        onChange={(event) =>
                          update("emailNotifications", event.target.checked)
                        }
                      />
                      <span>
                        <strong>E-Mail-Benachrichtigungen</strong>
                        <small>Aktiv, sobald SMTP eingerichtet ist.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.pushNotifications}
                        onChange={(event) =>
                          update("pushNotifications", event.target.checked)
                        }
                      />
                      <span>
                        <strong>Push-Benachrichtigungen</strong>
                        <small>
                          Aktiv, sobald ein Gerät registriert wurde.
                        </small>
                      </span>
                    </label>
                  </fieldset>
                </div>
              )}

              {step === 6 && (
                <div className="onboarding-review-screen">
                  <div className="onboarding-review-hero">
                    <Check />
                    <div>
                      <strong>Alles bereit für den sicheren Start</strong>
                      <p>
                        Erst die Basisdaten, dann die Einladungen, zuletzt die
                        Produkttour – mit klarer Wiederaufnahme bei Fehlern.
                      </p>
                    </div>
                  </div>
                  <div className="onboarding-summary-grid">
                    <article>
                      <Building2 />
                      <span>Organisation</span>
                      <strong>{form.organizationName}</strong>
                      <small>{form.locationName || "Ohne Hauptstandort"}</small>
                    </article>
                    <article>
                      <Layers3 />
                      <span>Teams</span>
                      <strong>{form.teamNames.length}</strong>
                      <small>{form.teamNames.join(", ")}</small>
                    </article>
                    <article>
                      <UsersRound />
                      <span>Einladungen</span>
                      <strong>{activeInviteCount}</strong>
                      <small>
                        {activeInviteCount
                          ? "Mit Rolle und Team vorbereitet"
                          : "Kann später ergänzt werden"}
                      </small>
                    </article>
                    <article>
                      <BellRing />
                      <span>Workflows</span>
                      <strong>
                        {form.leaveApprovalSteps} Freigabestufe(n)
                      </strong>
                      <small>Erinnerungen und Hinweise konfiguriert</small>
                    </article>
                  </div>
                </div>
              )}

              {(stepError || complete.error) && (
                <div className="alert error onboarding-alert" role="alert">
                  {stepError ??
                    (complete.error instanceof Error
                      ? complete.error.message
                      : "Die Einrichtung konnte nicht abgeschlossen werden.")}
                </div>
              )}

              <div className="onboarding-actions">
                {step > 0 ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setStepError(null);
                      setStep((current) => Math.max(current - 1, 0));
                    }}
                    disabled={complete.isPending || preparedTeams !== null}
                  >
                    <ChevronLeft /> Zurück
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className={`primary ${step === steps.length - 1 ? "onboarding-complete" : ""}`}
                  disabled={complete.isPending}
                >
                  {step === steps.length - 1 ? (
                    <>
                      <Rocket />
                      {complete.isPending
                        ? "Einrichtung läuft sicher …"
                        : preparedTeams
                          ? "Einladungen erneut prüfen"
                          : "Alberring jetzt einrichten"}
                    </>
                  ) : (
                    <>
                      Weiter <ChevronRight />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
