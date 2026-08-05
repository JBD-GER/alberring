import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

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
  teamName: string;
  leaveApprovalSteps: string;
  mileageReminderDays: string;
  mileageOverdueDay: string;
  birthdayReminderDays: string;
  messageEditWindowMinutes: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
};

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
  teamName: "Administration",
  leaveApprovalSteps: "1",
  mileageReminderDays: "25",
  mileageOverdueDay: "2",
  birthdayReminderDays: "7, 0",
  messageEditWindowMinutes: "15",
  emailNotifications: false,
  pushNotifications: false,
};

const defaultsToForm = (data: OnboardingDefaults): OnboardingForm => ({
  organizationName: data.organization_name,
  displayName: data.display_name,
  firstName: data.first_name,
  lastName: data.last_name,
  workPhone: data.work_phone,
  jobTitle: data.job_title,
  timezone: data.timezone,
  locationName: data.location_name || emptyForm.locationName,
  departmentName: data.department_name || emptyForm.departmentName,
  teamName: data.team_name || emptyForm.teamName,
  leaveApprovalSteps: String(data.leave_approval_steps),
  mileageReminderDays: data.mileage_reminder_days.join(", "),
  mileageOverdueDay: String(data.mileage_overdue_day),
  birthdayReminderDays: data.birthday_reminder_days.join(", "),
  messageEditWindowMinutes: String(data.message_edit_window_minutes),
  emailNotifications: data.email_notifications,
  pushNotifications: data.push_notifications,
});

const steps = [
  {
    title: "Willkommen",
    short: "Überblick",
    icon: Sparkles,
  },
  {
    title: "Organisation",
    short: "Betrieb & Struktur",
    icon: Building2,
  },
  {
    title: "Admin-Profil",
    short: "Persönliche Angaben",
    icon: UserRound,
  },
  {
    title: "Arbeitsabläufe",
    short: "Regeln & Hinweise",
    icon: SlidersHorizontal,
  },
];

const parseNumberList = (value: string, min: number, max: number) => {
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const numbers = tokens.map(Number);
  if (
    !numbers.length ||
    numbers.some(
      (number) => !Number.isInteger(number) || number < min || number > max,
    )
  )
    throw new Error(
      `Bitte nur ganze Zahlen zwischen ${min} und ${max} angeben.`,
    );
  return [...new Set(numbers)];
};

const optionalNameIsValid = (value: string) => {
  const length = value.trim().length;
  return length === 0 || (length >= 2 && length <= 120);
};

export function Onboarding() {
  const { appSession, refreshAppSession, signOut } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [formState, setForm] = useState<OnboardingForm | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-onboarding-defaults", appSession?.profile.id],
    enabled: Boolean(appSession?.onboarding.required),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_admin_onboarding_defaults")
        .single();
      if (error) throw error;
      return data as OnboardingDefaults;
    },
  });

  const form = formState ?? (data ? defaultsToForm(data) : emptyForm);

  const update = <Key extends keyof OnboardingForm>(
    key: Key,
    value: OnboardingForm[Key],
  ) => setForm((current) => ({ ...(current ?? form), [key]: value }));

  const validateStep = (candidate: number) => {
    if (candidate === 1) {
      if (form.organizationName.trim().length < 2)
        return "Bitte geben Sie den vollständigen Namen des Pflegedienstes an.";
      if (!form.timezone.trim()) return "Bitte wählen Sie eine Zeitzone aus.";
      if (
        !optionalNameIsValid(form.locationName) ||
        !optionalNameIsValid(form.departmentName) ||
        !optionalNameIsValid(form.teamName)
      )
        return "Standort, Bereich und Team benötigen jeweils mindestens zwei Zeichen.";
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
    if (candidate === 3) {
      try {
        parseNumberList(form.mileageReminderDays, 1, 31);
        parseNumberList(form.birthdayReminderDays, 0, 365);
      } catch (validationError) {
        return validationError instanceof Error
          ? validationError.message
          : "Die Erinnerungstage sind ungültig.";
      }
      const overdueDay = Number(form.mileageOverdueDay);
      const editWindow = Number(form.messageEditWindowMinutes);
      if (!Number.isInteger(overdueDay) || overdueDay < 1 || overdueDay > 28)
        return "Der Überfälligkeitstag muss zwischen 1 und 28 liegen.";
      if (!Number.isInteger(editWindow) || editWindow < 1 || editWindow > 1440)
        return "Das Nachrichtenfenster muss zwischen 1 und 1.440 Minuten liegen.";
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
      const validationError = validateStep(3);
      if (validationError) throw new Error(validationError);
      const { error } = await supabase.rpc("complete_admin_onboarding", {
        p_organization_name: form.organizationName.trim(),
        p_display_name: form.displayName.trim(),
        p_first_name: form.firstName.trim(),
        p_last_name: form.lastName.trim(),
        p_work_phone: form.workPhone.trim(),
        p_job_title: form.jobTitle.trim(),
        p_timezone: form.timezone.trim(),
        p_location_name: form.locationName.trim(),
        p_department_name: form.departmentName.trim(),
        p_team_name: form.teamName.trim(),
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
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshAppSession();
      navigate("/app/dashboard", { replace: true });
    },
  });

  if (isLoading)
    return (
      <main className="onboarding-loading">
        <div className="spinner" />
        <span>Ihre sichere Ersteinrichtung wird vorbereitet …</span>
      </main>
    );

  if (error || !data)
    return (
      <main className="onboarding-loading">
        <div className="onboarding-error-card">
          <ShieldCheck />
          <h1>Onboarding nicht verfügbar</h1>
          <p>
            Die exklusiven Einrichtungsdaten konnten nicht geladen werden.
            Melden Sie sich bitte erneut an.
          </p>
          <button className="secondary" onClick={() => void signOut()}>
            <LogOut /> Abmelden
          </button>
        </div>
      </main>
    );

  const CurrentIcon = steps[step].icon;
  const mutationMessage = complete.error
    ? complete.error instanceof Error
      ? complete.error.message
      : "Die Einrichtung konnte nicht abgeschlossen werden."
    : null;

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
        <div>
          <span>Exklusive Ersteinrichtung</span>
          <strong>info@alberring.de</strong>
        </div>
        <button className="onboarding-signout" onClick={() => void signOut()}>
          <LogOut /> Abmelden
        </button>
      </header>

      <div className="onboarding-layout">
        <aside className="onboarding-progress" aria-label="Onboarding-Schritte">
          <span className="onboarding-progress-label">
            Schritt {step + 1} von {steps.length}
          </span>
          <ol>
            {steps.map(({ title, short, icon: Icon }, index) => (
              <li
                key={title}
                className={`${index === step ? "active" : ""} ${index < step ? "complete" : ""}`}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="onboarding-step-icon">
                  {index < step ? <Check /> : <Icon />}
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
              Nur dieses Administratorkonto kann die Ersteinrichtung öffnen oder
              abschließen.
            </span>
          </div>
        </aside>

        <section className="onboarding-card">
          <div className="onboarding-card-heading">
            <span className="onboarding-current-icon">
              <CurrentIcon />
            </span>
            <div>
              <span className="eyebrow">{steps[step].short}</span>
              <h1>{steps[step].title}</h1>
            </div>
          </div>

          {step === 0 && (
            <div className="onboarding-welcome">
              <p className="onboarding-lead">
                Richten Sie die Alberring Mitarbeiter-App in wenigen Schritten
                für den täglichen Betrieb ein.
              </p>
              <div className="onboarding-feature-grid">
                <article>
                  <Building2 />
                  <div>
                    <strong>Betriebsstruktur</strong>
                    <p>Organisation, Hauptstandort, Bereich und erstes Team.</p>
                  </div>
                </article>
                <article>
                  <UserRound />
                  <div>
                    <strong>Admin-Profil</strong>
                    <p>Name, Funktion und dienstliche Erreichbarkeit.</p>
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
                  <BellRing />
                  <div>
                    <strong>Benachrichtigungen</strong>
                    <p>
                      E-Mail- und Push-Präferenzen für das Administratorkonto.
                    </p>
                  </div>
                </article>
              </div>
              <div className="onboarding-info">
                Alle Angaben können nach dem Abschluss weiterhin in der
                Administration angepasst werden.
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
                  autoFocus
                  required
                />
              </label>
              <label>
                Zeitzone
                <select
                  value={form.timezone}
                  onChange={(event) => update("timezone", event.target.value)}
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
              <label>
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
              <label>
                Erstes Team
                <input
                  value={form.teamName}
                  onChange={(event) => update("teamName", event.target.value)}
                  maxLength={120}
                  placeholder="z. B. Administration"
                />
              </label>
              <div className="onboarding-inline-note full">
                <MapPin />
                Leere optionale Felder werden übersprungen. Weitere Standorte,
                Bereiche und Teams können später ergänzt werden.
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
                  autoFocus
                  required
                />
              </label>
              <label>
                Vorname
                <input
                  value={form.firstName}
                  onChange={(event) => update("firstName", event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Nachname
                <input
                  value={form.lastName}
                  onChange={(event) => update("lastName", event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Funktion
                <input
                  value={form.jobTitle}
                  onChange={(event) => update("jobTitle", event.target.value)}
                  maxLength={120}
                  placeholder="z. B. Geschäftsführung"
                />
              </label>
              <label>
                Dienstliche Telefonnummer
                <input
                  type="tel"
                  value={form.workPhone}
                  onChange={(event) => update("workPhone", event.target.value)}
                  maxLength={40}
                  autoComplete="tel"
                  placeholder="z. B. +49 40 123456"
                />
              </label>
              <div className="onboarding-account-badge full">
                <ShieldCheck />
                <span>
                  <strong>Administratorkonto</strong>
                  <small>info@alberring.de · Rolle Super Admin</small>
                </span>
              </div>
            </div>
          )}

          {step === 3 && (
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
                <small>7 erinnert eine Woche vorher, 0 am Geburtstag.</small>
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
                    <small>
                      Aktiv, sobald ein SMTP-Anbieter eingerichtet ist.
                    </small>
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
                    <small>Aktiv, sobald ein Gerät registriert wurde.</small>
                  </span>
                </label>
              </fieldset>
              <div className="onboarding-review full">
                <Check />
                <div>
                  <strong>Bereit zur Einrichtung</strong>
                  <p>
                    Organisation, Profil, Struktur und Workflow-Einstellungen
                    werden gemeinsam und transaktional gespeichert.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(stepError || mutationMessage) && (
            <div className="alert error onboarding-alert" role="alert">
              {stepError ?? mutationMessage}
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
                disabled={complete.isPending}
              >
                <ChevronLeft /> Zurück
              </button>
            ) : (
              <span />
            )}
            {step < steps.length - 1 ? (
              <button type="button" className="primary" onClick={next}>
                Weiter <ChevronRight />
              </button>
            ) : (
              <button
                type="button"
                className="primary onboarding-complete"
                onClick={() => complete.mutate()}
                disabled={complete.isPending}
              >
                <Check />
                {complete.isPending
                  ? "Einrichtung wird gespeichert …"
                  : "Einrichtung abschließen"}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
