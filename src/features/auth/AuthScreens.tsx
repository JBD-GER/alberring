import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import {
  CalendarCheck2,
  Eye,
  EyeOff,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import { passwordChangeErrorMessage } from "../../lib/auth-errors";
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
    const { error: authError } = await supabase.auth.signInWithPassword(
      parsed.data,
    );
    setBusy(false);
    if (authError) {
      setError("Anmeldung nicht möglich. Bitte prüfen Sie Ihre Zugangsdaten.");
      return;
    }
    nav((loc.state as { from?: string } | null)?.from ?? "/app/dashboard", {
      replace: true,
    });
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
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset-password`,
    });
    setSent(true);
    setBusy(false);
  };
  return (
    <AuthFrame
      title="Passwort zurücksetzen"
      subtitle="Wir senden Ihnen einen sicheren Link."
    >
      {sent ? (
        <div className="alert success">
          Falls ein Konto existiert, wurde eine E-Mail versendet.
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>
            Dienstliche E-Mail
            <input name="email" type="email" required />
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
export function ResetPassword() {
  const { recoverySession, loading } = useAuth();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const { error } = await supabase.auth.updateUser({ password: a });
    if (error) {
      setMessage(
        passwordChangeErrorMessage(
          error,
          "Der Link ist ungültig oder abgelaufen.",
        ),
      );
      setBusy(false);
      return;
    }
    await supabase.auth.signOut({ scope: "global" });
    setSuccess(true);
    setMessage(
      "Passwort erfolgreich aktualisiert. Sie können sich jetzt anmelden.",
    );
    setBusy(false);
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
      ) : !recoverySession && !success ? (
        <div className="alert error" role="alert">
          Dieser Wiederherstellungslink ist ungültig oder abgelaufen. Fordern
          Sie einen neuen Link an.
        </div>
      ) : success ? (
        <>
          <div className="alert success" role="status">
            {message}
          </div>
          <Link to="/login" className="primary">
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
            {busy ? "Passwort wird gespeichert …" : "Passwort speichern"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
export function AcceptInvite() {
  const nav = useNavigate();
  const { session, appSession, loading } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = Boolean(session && appSession?.profile.status === "invited");
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
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(
        passwordChangeErrorMessage(
          error,
          "Die Einladung ist ungültig oder abgelaufen. Fordern Sie eine neue Einladung an.",
        ),
      );
      setBusy(false);
      return;
    }
    const { error: activationError } = await supabase.rpc(
      "activate_my_profile",
    );
    if (activationError) {
      setMessage(
        "Das Profil konnte nicht aktiviert werden. Bitte wenden Sie sich an die Administration.",
      );
      setBusy(false);
      return;
    }
    await supabase.auth.refreshSession();
    nav("/app/dashboard", { replace: true });
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
