import { authRedirect } from "../../services/platform/links";
import { disablePush } from "../../services/platform/push";
import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import {
  CalendarCheck2,
  Eye,
  EyeOff,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import {
  passwordChangeErrorMessage,
  passwordResetRequestErrorMessage,
} from "../../lib/auth-errors";
import {
  parseEmailLinkToken,
  type EmailLinkTarget,
} from "../../lib/auth-email-link";
import { supabase } from "../../lib/supabase";
import { loginSchema, passwordSchema } from "../../lib/validation";
import { useAuth } from "./AuthProvider";

function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="brand-panel">
        <img
          className="auth-brand-logo"
          src="/alberring-logo.png"
          alt="Alberring Ambulante Pflege"
        />
        <div className="auth-brand-copy">
          <span className="eyebrow">Mitarbeiter-App</span>
          <h2>
            Pflege im Team.
            <br />
            Einfach organisiert.
          </h2>
          <p>
            Dienstplan, Kommunikation und alle wichtigen Abläufe sicher an einem
            Ort.
          </p>
        </div>
        <div
          className="auth-benefits"
          aria-label="Vorteile der Mitarbeiter-App"
          role="list"
        >
          <span role="listitem">
            <CalendarCheck2 />
            Dienstplan jederzeit griffbereit
          </span>
          <span role="listitem">
            <HeartHandshake />
            Für den Pflegealltag entwickelt
          </span>
          <span role="listitem">
            <ShieldCheck />
            Geschützt und nur für Mitarbeitende
          </span>
        </div>
      </section>
      <section className="auth-card">
        <div className="mobile-brand">
          <img src="/alberring-logo.png" alt="Alberring Ambulante Pflege" />
        </div>
        <h1 className="auth-title">{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        <p className="privacy-note">
          Nur für Mitarbeitende. Ihre Daten werden zweckgebunden und geschützt
          verarbeitet.
        </p>
      </section>
    </main>
  );
}
export function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/app/dashboard" replace />;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword(
        parsed.data,
      );
      if (authError) {
        setError(
          "Anmeldung nicht möglich. Bitte prüfen Sie Ihre Zugangsdaten und die Verbindung.",
        );
        return;
      }
      nav((loc.state as { from?: string } | null)?.from ?? "/app/dashboard", {
        replace: true,
      });
    } catch {
      setError(
        "Die Anmeldung konnte nicht abgeschlossen werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title="Willkommen zurück"
      subtitle="Melden Sie sich mit Ihrer dienstlichen E-Mail-Adresse an."
    >
      <form onSubmit={submit} className="form">
        <label>
          Dienstliche E-Mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Passwort
          <span className="password-field">
            <input
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </span>
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Anmeldung läuft …" : "Sicher anmelden"}
        </button>
        <Link to="/forgot-password" className="text-link">
          Passwort vergessen?
        </Link>
      </form>
    </AuthFrame>
  );
}
export function ForgotPassword() {
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: await authRedirect("/reset-password") },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (resetError) {
      setError(passwordResetRequestErrorMessage(resetError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title="Passwort zurücksetzen"
      subtitle="Wir senden Ihnen einen sicheren Link."
    >
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {sent ? (
        <div className="alert success" role="status">
          Falls ein Konto zu dieser E-Mail-Adresse existiert, wurde der Versand
          angefordert. Prüfen Sie auch Ihren Spam-Ordner und verwenden Sie den
          Link aus der neuesten E-Mail.
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>
            Dienstliche E-Mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Anfrage läuft …" : "Link anfordern"}
          </button>
        </form>
      )}
      <Link to="/login" className="text-link">
        Zurück zur Anmeldung
      </Link>
    </AuthFrame>
  );
}
function EmailLinkGate({
  target,
  children,
}: {
  target: EmailLinkTarget;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading, recoverySession, sessionError, refreshAppSession } =
    useAuth();
  const token = parseEmailLinkToken(location.search, location.hash, target);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const confirmation = (
    location.state as {
      emailLinkConfirmation?: { userId?: unknown; target?: unknown };
    } | null
  )?.emailLinkConfirmation;
  // This marker only keeps the waiting UI alive after removing the consumed
  // token. Authentication still comes exclusively from the AuthProvider.
  const verifiedUserId =
    token === undefined &&
    confirmation?.target === target &&
    typeof confirmation.userId === "string"
      ? confirmation.userId
      : null;
  const invitation = target === "/accept-invite";
  if (token === undefined && !verifiedUserId) return children;

  // verifyOtp publishes its auth event before its promise resolves, but profile
  // hydration is asynchronous. Never expose a previous user's password form.
  const ready =
    verifiedUserId &&
    session?.user.id === verifiedUserId &&
    !loading &&
    !sessionError &&
    (invitation || recoverySession);
  if (ready) return <Navigate to={target} replace />;

  const confirm = async () => {
    if (!token || inFlight.current || verifiedUserId) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token.tokenHash,
        type: token.type,
      });
      if (error) throw error;
      if (!data.session?.user.id || !data.session.access_token)
        throw new Error("email_link_session_missing");
      void navigate(target, {
        replace: true,
        state: {
          emailLinkConfirmation: { userId: data.session.user.id, target },
        },
      });
    } catch {
      setMessage(
        "Der Link konnte nicht bestätigt werden. Prüfen Sie die Verbindung und versuchen Sie es erneut. Ist der Link abgelaufen oder bereits verwendet, benötigen Sie eine neue E-Mail.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const retryHydration = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await refreshAppSession();
    } catch {
      setMessage(
        "Kontodaten konnten nicht geladen werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title={invitation ? "Einladung öffnen" : "Link bestätigen"}
      subtitle={
        invitation
          ? "Bestätigen Sie die Einladung, um Ihr persönliches Passwort festzulegen."
          : "Bestätigen Sie den Link, um ein neues Passwort festzulegen."
      }
    >
      <div className="form">
        {token === null ? (
          <div className="alert error" role="alert">
            Dieser Link ist ungültig. Bitte öffnen Sie den vollständigen Link
            aus Ihrer neuesten E-Mail.
          </div>
        ) : verifiedUserId ? (
          <>
            {loading || busy ? (
              <p role="status">Link bestätigt. Kontodaten werden geladen …</p>
            ) : session?.user.id !== verifiedUserId ||
              (!invitation && !recoverySession) ? (
              <div className="alert error" role="alert">
                Die bestätigte Sitzung ist nicht verfügbar. Bitte öffnen Sie die
                neueste E-Mail erneut oder fordern Sie einen neuen Link an.
              </div>
            ) : (
              <>
                <div className="alert error" role="alert">
                  {message || sessionError}
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void retryHydration()}
                >
                  Kontodaten erneut laden
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {message && (
              <div className="alert error" role="alert">
                {message}
              </div>
            )}
            <button
              className="primary"
              disabled={busy || loading}
              onClick={() => void confirm()}
            >
              {busy
                ? "Link wird bestätigt …"
                : invitation
                  ? "Einladung öffnen"
                  : "Link bestätigen"}
            </button>
          </>
        )}
        <Link
          to={invitation ? "/login" : "/forgot-password"}
          className="text-link"
        >
          {invitation ? "Zur Anmeldung" : "Neuen Link anfordern"}
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const location = useLocation();
  return (
    <EmailLinkGate
      key={`${location.pathname}${location.search}${location.hash}`}
      target="/reset-password"
    >
      <ResetPasswordForm />
    </EmailLinkGate>
  );
}

function ResetPasswordForm() {
  const { recoverySession, loading } = useAuth();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [busy, setBusy] = useState(false);
  const completeSignOut = async () => {
    setBusy(true);
    setMessage("");
    try {
      await disablePush();
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      setSuccess(true);
      setMessage(
        "Passwort erfolgreich aktualisiert. Sie können sich jetzt anmelden.",
      );
    } catch {
      setMessage(
        "Ihr Passwort wurde geändert, aber die sichere Abmeldung konnte nicht abgeschlossen werden. Prüfen Sie die Verbindung und versuchen Sie die Abmeldung erneut.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!recoverySession || busy) return;
    const fd = new FormData(e.currentTarget);
    const a = String(fd.get("password")),
      b = String(fd.get("confirm"));
    if (a !== b) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }
    const valid = passwordSchema.safeParse(a);
    if (!valid.success) {
      setMessage(valid.error.issues[0].message);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: a });
      if (error) {
        setMessage(
          passwordChangeErrorMessage(
            error,
            "Der Link ist ungültig oder abgelaufen.",
          ),
        );
        return;
      }
      setPasswordUpdated(true);
      await completeSignOut();
    } catch {
      setMessage(
        "Die Passwortänderung konnte nicht bestätigt werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title="Neues Passwort"
      subtitle="Mindestens 12 Zeichen, Groß- und Kleinbuchstaben sowie eine Zahl."
    >
      {loading ? (
        <div className="center">
          <div className="spinner" />
          <span>Link wird geprüft …</span>
        </div>
      ) : !recoverySession && !success && !passwordUpdated ? (
        <>
          <div className="alert error" role="alert">
            Dieser Wiederherstellungslink ist ungültig oder abgelaufen. Fordern
            Sie einen neuen Link an.
          </div>
          <Link to="/forgot-password" className="primary">
            Neuen Link anfordern
          </Link>
        </>
      ) : success ? (
        <>
          <div className="alert success" role="status">
            {message}
          </div>
          <Link to="/login" className="primary">
            Zur Anmeldung
          </Link>
        </>
      ) : passwordUpdated ? (
        <div className="form">
          {message && (
            <div className="alert error" role="alert">
              {message}
            </div>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void completeSignOut()}
          >
            {busy ? "Abmeldung läuft …" : "Sichere Abmeldung erneut versuchen"}
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
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
            Passwort wiederholen
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          {message && (
            <div className="alert error" role="alert">
              {message}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Passwort wird gespeichert …" : "Passwort speichern"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
export function AcceptInvite() {
  const location = useLocation();
  return (
    <EmailLinkGate
      key={`${location.pathname}${location.search}${location.hash}`}
      target="/accept-invite"
    >
      <AcceptInviteForm />
    </EmailLinkGate>
  );
}

function AcceptInviteForm() {
  const nav = useNavigate();
  const { session, appSession, loading, refreshAppSession } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [profileActivated, setProfileActivated] = useState(false);
  const eligible = Boolean(session && appSession?.profile.status === "invited");
  const completeActivation = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!profileActivated) {
        const { error } = await supabase.rpc("activate_my_profile");
        if (error) throw error;
        setProfileActivated(true);
      }
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
      await refreshAppSession();
      nav("/app/dashboard", { replace: true });
    } catch {
      setMessage(
        "Ihr Passwort wurde gespeichert, aber die Aktivierung konnte nicht abgeschlossen werden. Prüfen Sie die Verbindung und versuchen Sie es erneut. Sie müssen Ihr Passwort nicht erneut festlegen.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!eligible || busy) return;
    setMessage("");
    const fd = new FormData(e.currentTarget),
      password = String(fd.get("password")),
      confirm = String(fd.get("confirm"));
    if (password !== confirm) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }
    const valid = passwordSchema.safeParse(password);
    if (!valid.success) {
      setMessage(valid.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(
          passwordChangeErrorMessage(
            error,
            "Die Einladung ist ungültig oder abgelaufen. Fordern Sie eine neue Einladung an.",
          ),
        );
        return;
      }
      setPasswordUpdated(true);
      await completeActivation();
    } catch {
      setMessage(
        "Die Passwortänderung konnte nicht bestätigt werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title="Einladung annehmen"
      subtitle="Legen Sie Ihr persönliches, sicheres Passwort fest."
    >
      {loading ? (
        <div className="center">
          <div className="spinner" />
          <span>Einladung wird geprüft …</span>
        </div>
      ) : passwordUpdated ? (
        <div className="form">
          {message && (
            <div className="alert error" role="alert">
              {message}
            </div>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void completeActivation()}
          >
            {busy ? "Konto wird aktiviert …" : "Aktivierung erneut versuchen"}
          </button>
        </div>
      ) : !eligible ? (
        <>
          <div className="alert error" role="alert">
            Diese Einladung ist ungültig, abgelaufen oder gehört zu einem
            anderen Konto.
          </div>
          <Link to="/login" className="text-link">
            Zur Anmeldung
          </Link>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
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
            Passwort wiederholen
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          {message && (
            <div className="alert error" role="alert">
              {message}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Konto wird aktiviert …" : "Konto aktivieren"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
