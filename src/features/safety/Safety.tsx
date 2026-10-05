import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Link } from "react-router";
import "./safety.css";

export function safetyError(error: unknown, fallback: string) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("message_contact_blocked"))
    return "In diesem Direktchat besteht eine Blockierung. Sie können keine neue Nachricht senden.";
  if (message.includes("message_content_not_allowed"))
    return "Die Nachricht enthält eine nicht erlaubte Formulierung. Bitte bleiben Sie respektvoll.";
  if (message.includes("invalid_reason"))
    return "Bitte geben Sie einen Grund mit 3 bis 2.000 Zeichen ein.";
  return fallback;
}

export function MessageSafetyActions({
  messageId,
  senderId,
  senderName,
}: {
  messageId: string;
  senderId: string;
  senderName: string;
}) {
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"report" | "block" | null>(null);
  const [reason, setReason] = useState("");
  const [success, setSuccess] = useState("");
  const action = useMutation({
    mutationFn: async () => {
      const result =
        mode === "report"
          ? await supabase.rpc("report_message", {
              p_message_id: messageId,
              p_reason: reason.trim(),
            })
          : await supabase.rpc("set_message_block", {
              p_profile_id: senderId,
              p_blocked: true,
            });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      setSuccess(
        mode === "report"
          ? "Meldung wurde an die Administration übergeben."
          : "Person wurde blockiert.",
      );
      // Keep the report receipt in the modal until it is acknowledged. An
      // inline message is easy to miss in a long, scrolling conversation.
      if (mode === "block") setMode(null);
      await Promise.all([
        ...(mode === "block"
          ? [
              client.invalidateQueries({ queryKey: ["messages"] }),
              client.invalidateQueries({ queryKey: ["conversations"] }),
              client.invalidateQueries({ queryKey: ["message-blocks"] }),
            ]
          : []),
        client.invalidateQueries({ queryKey: ["message-reports"] }),
      ]);
    },
  });
  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);
  const open = (next: "report" | "block") => {
    action.reset();
    setReason("");
    setSuccess("");
    setMode(next);
  };
  return (
    <>
      <button type="button" onClick={() => open("report")}>
        <Flag /> Melden
      </button>
      <button type="button" onClick={() => open("block")}>
        <Ban /> Person blockieren
      </button>
      {success && mode !== "report" && <span role="status">{success}</span>}
      {createPortal(
        <dialog
          ref={dialog}
          className="safety-dialog"
          aria-labelledby={`safety-title-${messageId}`}
          onCancel={(e) => {
            if (action.isPending) e.preventDefault();
            else setMode(null);
          }}
        >
          {mode === "report" && success ? (
            <div className="form">
              <h3 id={`safety-title-${messageId}`}>Meldung eingegangen</h3>
              <p role="status" className="safety-receipt">
                <ShieldCheck aria-hidden="true" />
                Ihre Meldung zur Nachricht von {senderName} wurde gespeichert
                und an die Administration zur Prüfung übergeben.
              </p>
              <p>
                Unter Einstellungen → Ihre Inhaltsmeldungen können Sie den
                Bearbeitungsstand ansehen.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="primary"
                  autoFocus
                  onClick={() => {
                    setSuccess("");
                    setMode(null);
                  }}
                >
                  Verstanden
                </button>
              </div>
            </div>
          ) : (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate();
              }}
            >
              <h3 id={`safety-title-${messageId}`}>
                {mode === "report" ? "Nachricht melden" : "Person blockieren"}
              </h3>
              {mode === "report" ? (
                <>
                  <p>
                    Diese Nachricht einschließlich ihrer Anhänge, der Absender
                    und Ihre Begründung werden ausschließlich der
                    Alberring-Administration zur Prüfung zugänglich gemacht.
                    Andere private Nachrichten werden nicht geteilt.
                  </p>
                  <label>
                    Grund der Meldung
                    <textarea
                      autoFocus
                      value={reason}
                      minLength={3}
                      maxLength={2000}
                      required
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <p>
                  Nachrichten von {senderName} werden für Sie ausgeblendet. Neue
                  Direktnachrichten zwischen Ihnen werden gesperrt. Die
                  Blockierung gilt auch für die Anzeige in Gruppenchats. Unter
                  Einstellungen können Sie sie aufheben.
                </p>
              )}
              {action.error && (
                <p role="alert" className="alert error">
                  {safetyError(
                    action.error,
                    "Die Aktion konnte nicht gespeichert werden. Bitte erneut versuchen.",
                  )}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => setMode(null)}
                >
                  Abbrechen
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={action.isPending}
                >
                  {action.isPending
                    ? "Wird gespeichert …"
                    : mode === "report"
                      ? "Meldung absenden"
                      : "Blockierung bestätigen"}
                </button>
              </div>
            </form>
          )}
        </dialog>,
        document.body,
      )}
    </>
  );
}

type Report = {
  id: string;
  reason: string;
  reported_text: string;
  message_id: string;
  reported_profile_id: string;
  status: "open" | "removed" | "reviewed";
  created_at: string;
  resolution: string | null;
};
export function SafetySettings() {
  const { has } = useAuth();
  const administrator = has("data.correct");
  const client = useQueryClient();
  const blocks = useQuery({
    queryKey: ["message-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_message_blocks");
      if (error) throw error;
      return (data ?? []) as Array<{
        profile_id: string;
        display_name: string;
      }>;
    },
  });
  const reports = useQuery({
    queryKey: ["message-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_reports")
        .select(
          "id,message_id,reported_profile_id,reason,reported_text,status,created_at,resolution",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Report[];
    },
  });
  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_message_block", {
        p_profile_id: id,
        p_blocked: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["message-blocks"] });
      void client.invalidateQueries({ queryKey: ["messages"] });
      void client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  return (
    <section className="settings-card">
      <div className="settings-title">
        <ShieldCheck />
        <div>
          <h3>Sicherheit und respektvoller Umgang</h3>
          <p>
            Keine Belästigung, Drohungen, diskriminierenden oder rechtswidrigen
            Inhalte. Melden Sie problematische Nachrichten direkt im Chat.
          </p>
        </div>
      </div>
      <p>
        Kontakt zur verantwortlichen Administration:{" "}
        <a href="mailto:info@alberring.de">info@alberring.de</a> ·{" "}
        <a href="tel:+4942038048429">04203 8048429</a>
      </p>
      <h4>Blockierte Personen</h4>
      {blocks.isPending ? (
        <p>Wird geladen …</p>
      ) : blocks.error ? (
        <p role="alert">Blockierungen konnten nicht geladen werden.</p>
      ) : blocks.data?.length ? (
        <ul>
          {blocks.data.map((b) => (
            <li key={b.profile_id}>
              {b.display_name}{" "}
              <button
                type="button"
                className="secondary"
                disabled={unblock.isPending}
                onClick={() => unblock.mutate(b.profile_id)}
              >
                Blockierung aufheben
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Sie haben keine Personen blockiert.</p>
      )}
      {unblock.error && (
        <p className="alert error" role="alert">
          Die Blockierung konnte nicht aufgehoben werden.
        </p>
      )}
      <h4>
        {administrator
          ? "Gemeldete Inhalte zur Prüfung"
          : "Ihre Inhaltsmeldungen"}
      </h4>
      {reports.isPending ? (
        <p>Wird geladen …</p>
      ) : reports.error ? (
        <p role="alert">Meldungen konnten nicht geladen werden.</p>
      ) : reports.data?.length ? (
        reports.data.map((r) => (
          <ReportItem key={r.id} report={r} administrator={administrator} />
        ))
      ) : (
        <p>Keine Inhaltsmeldungen vorhanden.</p>
      )}
    </section>
  );
}
function ReportItem({
  report,
  administrator,
}: {
  report: Report;
  administrator: boolean;
}) {
  const [resolution, setResolution] = useState("");
  const client = useQueryClient();
  const resolve = useMutation({
    mutationFn: async (remove: boolean) => {
      const { error } = await supabase.rpc("resolve_message_report", {
        p_report_id: report.id,
        p_remove: remove,
        p_resolution: resolution.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["message-reports"] });
      void client.invalidateQueries({ queryKey: ["messages"] });
      void client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  return (
    <article className="safety-request">
      <p>
        <strong>
          {report.status === "open"
            ? "Offen"
            : report.status === "removed"
              ? "Nachricht entfernt"
              : "Geprüft"}
        </strong>{" "}
        · {new Date(report.created_at).toLocaleDateString("de-DE")}
      </p>
      <p>Begründung: {report.reason}</p>
      <blockquote>{report.reported_text}</blockquote>
      {report.resolution && <p>Rückmeldung: {report.resolution}</p>}
      {administrator && report.status === "open" && (
        <div className="form">
          <ReportedAttachments messageId={report.message_id} />
          <Link to={`/app/admin/users/${report.reported_profile_id}`}>
            Gemeldetes Mitarbeiterkonto verwalten
          </Link>
          <label>
            Prüfergebnis
            <textarea
              value={resolution}
              minLength={3}
              maxLength={2000}
              onChange={(e) => setResolution(e.target.value)}
            />
          </label>
          <p>
            Prüfen Sie die Meldung zeitnah. Bei wiederholtem Missbrauch kann die
            Administration den Zugang unter Benutzerverwaltung sperren.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              disabled={resolve.isPending || resolution.trim().length < 3}
              onClick={() => resolve.mutate(true)}
            >
              Nachricht entfernen
            </button>
            <button
              type="button"
              className="secondary"
              disabled={resolve.isPending || resolution.trim().length < 3}
              onClick={() => resolve.mutate(false)}
            >
              Prüfung abschließen
            </button>
          </div>
          {resolve.error && (
            <p role="alert" className="alert error">
              Prüfung konnte nicht gespeichert werden.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function ReportedAttachments({ messageId }: { messageId: string }) {
  const [opened, setOpened] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const attachments = useQuery({
    queryKey: ["reported-attachments", messageId],
    enabled: opened,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_attachments")
        .select("id,original_name,storage_path")
        .eq("message_id", messageId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        original_name: string;
        storage_path: string;
      }>;
    },
  });
  async function download(path: string) {
    setErrorMessage("");
    const preview = window.open("", "_blank");
    if (preview) preview.opener = null;
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-secure-download",
        { body: { bucket: "message-attachments", path } },
      );
      if (error || !data?.signedUrl) throw error;
      if (preview) preview.location.replace(data.signedUrl);
      else window.location.assign(data.signedUrl);
    } catch {
      preview?.close();
      setErrorMessage("Der Anhang konnte nicht sicher geöffnet werden.");
    }
  }
  return (
    <div>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpened(true)}
      >
        Anhänge dieser Meldung anzeigen
      </button>
      {opened &&
        (attachments.isPending ? (
          <p>Wird geladen …</p>
        ) : attachments.error ? (
          <p role="alert">Anhänge konnten nicht geladen werden.</p>
        ) : attachments.data?.length ? (
          <ul>
            {attachments.data.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void download(a.storage_path)}
                >
                  {a.original_name} öffnen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine verfügbaren Anhänge.</p>
        ))}
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </div>
  );
}
