import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type ProductTourProps = {
  open: boolean;
  manual: boolean;
  onClose: () => void;
};

const tourSteps = [
  {
    title: "Willkommen in Mission Control",
    eyebrow: "Ihre App ist startklar",
    description:
      "Sie haben das Fundament gelegt. Jetzt verbinden wir die wichtigsten Bereiche zu einem klaren digitalen Arbeitsablauf.",
    icon: Sparkles,
    route: "/app/dashboard",
    target: null,
  },
  {
    title: "Ihr tägliches Cockpit",
    eyebrow: "Dashboard",
    description:
      "Offene Aufgaben, Hinweise und die wichtigsten Kennzahlen laufen hier zusammen – ohne zwischen Modulen suchen zu müssen.",
    icon: LayoutDashboard,
    route: "/app/dashboard",
    target: '[data-tour-id="dashboard"]',
  },
  {
    title: "Absprachen bleiben im Kontext",
    eyebrow: "Sichere Kommunikation",
    description:
      "Direktnachrichten, Teamgespräche, Antworten und Anhänge sind genau dort, wo Ihr Team sie im Alltag braucht.",
    icon: MessageCircle,
    route: "/app/messages",
    target: '[data-tour-id="messages"]',
  },
  {
    title: "Planung mit einem Blick",
    eyebrow: "Einsatzplanung",
    description:
      "Schichten erstellen, Konflikte erkennen, veröffentlichen und bestätigen – für Verwaltung und Mitarbeitende in derselben Oberfläche.",
    icon: CalendarDays,
    route: "/app/schedule",
    target: '[data-tour-id="planning"]',
  },
  {
    title: "Wissen sicher verteilen",
    eyebrow: "Dokumente & Nachweise",
    description:
      "Richtlinien, persönliche Unterlagen und Versionen werden geschützt verteilt und bei Bedarf verbindlich bestätigt.",
    icon: FileText,
    route: "/app/documents",
    target: '[data-tour-id="documents"]',
  },
  {
    title: "Ihre Kommandozentrale",
    eyebrow: "Administration",
    description:
      "Hier verwalten Sie Einladungen, Teams, Rollen, Systemeinstellungen und Audit-Nachweise – sauber nach Berechtigung getrennt.",
    icon: ShieldCheck,
    route: "/app/admin",
    target: '[data-tour-id="admin"]',
  },
  {
    title: "Bereit für den echten Alltag",
    eyebrow: "Alles verbunden",
    description:
      "Von der ersten Einladung bis zur Einsatzplanung: Alberring ist jetzt als sichere, gemeinsam nutzbare Arbeitszentrale eingerichtet.",
    icon: Rocket,
    route: "/app/dashboard",
    target: null,
  },
];

export function ProductTour({ open, manual, onClose }: ProductTourProps) {
  const { appSession, refreshAppSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(
    manual ? 0 : Math.min(appSession?.productTour.currentStep ?? 0, 6),
  );
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = Boolean(
    appSession?.productTour.eligible && !appSession.productTour.completedAt,
  );

  const { data: setupFacts } = useQuery({
    queryKey: ["product-tour-facts", appSession?.profile.id],
    enabled: open && Boolean(appSession?.productTour.eligible),
    queryFn: async () => {
      const [teamsResult, usersResult] = await Promise.all([
        supabase
          .from("teams")
          .select("id", { count: "exact", head: true })
          .eq("active", true),
        supabase.rpc("admin_list_users"),
      ]);
      if (teamsResult.error) throw teamsResult.error;
      if (usersResult.error) throw usersResult.error;
      const users = (usersResult.data ?? []) as Array<{ status: string }>;
      return {
        teams: teamsResult.count ?? 0,
        people: users.length,
        invites: users.filter((user) => user.status === "invited").length,
      };
    },
  });

  const current = tourSteps[step];

  useEffect(() => {
    if (!open) return;
    setStep(manual ? 0 : Math.min(appSession?.productTour.currentStep ?? 0, 6));
    setActionError(null);
  }, [appSession?.productTour.currentStep, manual, open]);

  useEffect(() => {
    if (!open || location.pathname === current.route) return;
    navigate(current.route, { replace: true });
  }, [current.route, location.pathname, navigate, open]);

  useEffect(() => {
    if (!open) return;
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const wasInert = appShell?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (appShell) appShell.inert = true;
    document.body.style.overflow = "hidden";
    return () => {
      if (appShell) appShell.inert = wasInert;
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const measureSpotlight = useCallback(() => {
    if (!open || !current.target) {
      setSpotlight(null);
      return;
    }
    const element = Array.from(
      document.querySelectorAll<HTMLElement>(current.target),
    ).find((candidate) => candidate.offsetParent !== null);
    if (!element) {
      setSpotlight(null);
      return;
    }
    let rect = element.getBoundingClientRect();
    const position = window.getComputedStyle(element).position;
    if (
      position !== "fixed" &&
      (rect.top < 8 || rect.bottom > window.innerHeight - 8)
    ) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      rect = element.getBoundingClientRect();
    }
    setSpotlight(rect.width > 0 && rect.height > 0 ? rect : null);
  }, [current.target, open]);

  useLayoutEffect(() => {
    let frame = 0;
    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureSpotlight);
    };
    scheduleMeasurement();
    const timer = window.setTimeout(scheduleMeasurement, 240);
    const appShell = document.querySelector(".app-shell");
    const mutationObserver = new MutationObserver(scheduleMeasurement);
    if (appShell)
      mutationObserver.observe(appShell, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    document
      .querySelectorAll<HTMLElement>(current.target ?? "[data-tour-id]")
      .forEach((target) => resizeObserver.observe(target));
    window.addEventListener("resize", scheduleMeasurement);
    window.addEventListener("scroll", scheduleMeasurement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      window.removeEventListener("scroll", scheduleMeasurement, true);
    };
  }, [current.target, location.pathname, measureSpotlight, step]);

  const saveProgress = useCallback(
    async (nextStep: number, action: "progress" | "deferred" | "completed") => {
      if (!pending) return;
      const { error } = await supabase.rpc("save_product_tour_progress", {
        p_step: nextStep,
        p_action: action,
      });
      if (error) throw error;
    },
    [pending],
  );

  const defer = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await saveProgress(step, "deferred");
      if (pending) await refreshAppSession();
      onClose();
    } catch {
      setActionError(
        "Die Tour konnte noch nicht für später gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, pending, refreshAppSession, saveProgress, step]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    dialog?.querySelector<HTMLElement>("[data-tour-focus]")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (pending) void defer();
        else onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [defer, onClose, open, pending, step]);

  if (!open || !appSession?.productTour.eligible) return null;

  const goTo = async (nextStep: number) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await saveProgress(nextStep, "progress");
      setStep(nextStep);
    } catch {
      setActionError("Der Tourfortschritt konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (destination = "/app/dashboard") => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await saveProgress(6, "completed");
      if (pending) await refreshAppSession();
      navigate(destination);
      onClose();
    } catch {
      setActionError("Die Tour konnte noch nicht abgeschlossen werden.");
    } finally {
      setBusy(false);
    }
  };

  const CurrentIcon = current.icon;
  return createPortal(
    <div
      className={`product-tour-layer ${spotlight ? "has-spotlight" : "is-centered"}`}
      data-tour-step={step}
    >
      {spotlight ? (
        <div
          className="product-tour-spotlight"
          style={{
            top: spotlight.top - 7,
            left: spotlight.left - 7,
            width: spotlight.width + 14,
            height: spotlight.height + 14,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="product-tour-backdrop" aria-hidden="true" />
      )}
      <section
        ref={dialogRef}
        className={`product-tour-dialog ${step === 0 || step === 6 ? "tour-hero" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-description"
      >
        <div className="product-tour-topline">
          <span>
            Mission Control · {step + 1}/{tourSteps.length}
          </span>
          <button
            type="button"
            onClick={() => (pending ? void defer() : onClose())}
            aria-label={
              pending ? "Tour für später schließen" : "Tour schließen"
            }
            disabled={busy}
          >
            <X />
          </button>
        </div>
        <div className="product-tour-progress" aria-hidden="true">
          {tourSteps.map((tourStep, index) => (
            <span
              key={tourStep.title}
              className={index <= step ? "active" : ""}
            />
          ))}
        </div>
        <div
          className="product-tour-heading"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="product-tour-icon">
            <CurrentIcon />
          </span>
          <div>
            <span className="eyebrow">{current.eyebrow}</span>
            <h2 id="product-tour-title" tabIndex={-1} data-tour-focus>
              {current.title}
            </h2>
          </div>
        </div>
        <p id="product-tour-description">{current.description}</p>

        {step === 0 && (
          <div className="product-tour-facts">
            <article>
              <strong>{setupFacts?.teams ?? "–"}</strong>
              <span>aktive Teams</span>
            </article>
            <article>
              <strong>{setupFacts?.people ?? "–"}</strong>
              <span>Zugänge</span>
            </article>
            <article>
              <strong>{setupFacts?.invites ?? "–"}</strong>
              <span>offene Einladungen</span>
            </article>
          </div>
        )}

        {step === 6 && (
          <div className="product-tour-launchpad">
            <button
              type="button"
              onClick={() => void finish("/app/admin/users")}
              disabled={busy}
            >
              <UsersRound />
              <span>
                <strong>Team aufbauen</strong>
                Einladungen und Rollen verwalten
              </span>
              <ArrowRight />
            </button>
            <button
              type="button"
              onClick={() => void finish("/app/schedule")}
              disabled={busy}
            >
              <CalendarDays />
              <span>
                <strong>Ersten Dienst planen</strong>
                Planung direkt öffnen
              </span>
              <ArrowRight />
            </button>
          </div>
        )}

        {actionError && (
          <div className="alert error product-tour-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="product-tour-actions">
          {step > 0 ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void goTo(step - 1)}
              disabled={busy}
            >
              <ChevronLeft /> Zurück
            </button>
          ) : pending ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void defer()}
              disabled={busy}
            >
              Morgen erinnern
            </button>
          ) : (
            <span />
          )}
          {step < tourSteps.length - 1 ? (
            <button
              type="button"
              className="primary"
              onClick={() => void goTo(step + 1)}
              disabled={busy}
            >
              {step === 0 ? "Tour starten" : "Weiter"} <ChevronRight />
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void finish()}
              disabled={busy}
            >
              <Check /> Tour abschließen
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
