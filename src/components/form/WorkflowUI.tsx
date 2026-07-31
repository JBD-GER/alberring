import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle, RefreshCw, X } from "lucide-react";
import "./workflow.css";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

type WorkflowHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
  eyebrow?: string;
};

export function WorkflowHeader({
  title,
  description,
  action,
  eyebrow,
}: WorkflowHeaderProps) {
  return (
    <header className="wf-header">
      <div>
        {eyebrow ? <span className="wf-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="wf-header-action">{action}</div> : null}
    </header>
  );
}

export function WorkflowPanel({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <section className="wf-panel">
      <header className="wf-panel-heading">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {onClose ? (
          <button
            className="wf-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Formular schließen"
          >
            <X size={20} />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function WorkflowTabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
}) {
  return (
    <div className="wf-tabs" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      options.length) %
                    options.length;
            onChange(options[nextIndex].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              );
            buttons?.[nextIndex]?.focus();
          }}
        >
          {option.label}
          {option.count === undefined ? null : <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  return <span className={`wf-status wf-status-${tone}`}>{label}</span>;
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <span className="wf-field-error" role="alert">
      {children}
    </span>
  );
}

export function MutationNotice({
  kind,
  children,
}: {
  kind: "success" | "error" | "info";
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <div
      className={`wf-notice wf-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "error" ? <AlertCircle size={18} /> : null}
      <span>{children}</span>
    </div>
  );
}

export function LoadingState({
  label = "Daten werden geladen …",
}: {
  label?: string;
}) {
  return (
    <div className="wf-state" aria-live="polite">
      <LoaderCircle className="wf-spin" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="wf-state wf-state-empty">
      <span className="wf-state-icon">
        <Inbox aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Daten konnten nicht geladen werden",
  description = "Prüfen Sie die Verbindung und versuchen Sie es erneut.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="wf-state wf-state-error" role="alert">
      <span className="wf-state-icon">
        <AlertCircle aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry ? (
        <button type="button" className="wf-secondary" onClick={onRetry}>
          <RefreshCw size={17} /> Erneut laden
        </button>
      ) : null}
    </div>
  );
}

export function humanizeError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.toLocaleLowerCase("de");
  if (
    message.includes("overlap") ||
    message.includes("überschneid") ||
    message.includes("overlapping_shift")
  ) {
    return "Der Zeitraum überschneidet sich mit einer bestehenden Planung.";
  }
  if (
    message.includes("approved leave") ||
    message.includes("approved_leave") ||
    message.includes("genehmigt")
  ) {
    return "Für diesen Zeitraum liegt bereits eine genehmigte Abwesenheit vor.";
  }
  if (
    message.includes("mileage") &&
    (message.includes("lower") ||
      message.includes("kleiner") ||
      message.includes("decrease"))
  ) {
    return "Der Kilometerstand darf nicht unter dem zuletzt gemeldeten Wert liegen.";
  }
  if (message.includes("duplicate") || message.includes("unique")) {
    return "Für diesen Zeitraum existiert bereits ein Eintrag.";
  }
  if (
    message.includes("permission") ||
    message.includes("row-level") ||
    message.includes("rls")
  ) {
    return "Sie haben für diese Aktion keine Berechtigung.";
  }
  return fallback;
}

export const todayInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const toLocalDateTimeInput = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};
