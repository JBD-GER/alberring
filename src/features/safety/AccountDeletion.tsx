import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type DeletionRequest = {
  id: string;
  profile_id: string;
  display_name: string;
  contact_email: string;
  requested_at: string;
  due_at: string;
  status: "requested" | "completed";
  completion_note: string | null;
};
const date = (value: string) => new Date(value).toLocaleString("de-DE");

export function AccountDeletion() {
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const requests = useQuery({
    queryKey: ["account-deletion-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_deletion_requests")
        .select(
          "id,profile_id,display_name,contact_email,requested_at,due_at,status,completion_note",
        )
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DeletionRequest[];
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_account_deletion");
      if (error) throw error;
    },
    onSuccess: async () => {
      setConfirming(false);
      await client.invalidateQueries({
        queryKey: ["account-deletion-requests"],
      });
    },
  });
  const own = requests.data?.find(
    (r) => r.profile_id === appSession?.profile.id,
  );
  return (
    <section className="settings-card">
      <h3>Konto löschen</h3>
      <p>
        Sie können die Löschung Ihres App-Kontos direkt hier beantragen. Die
        Alberring-Administration bearbeitet den Antrag innerhalb von 7 Tagen und
        bestätigt den Abschluss an Ihre hinterlegte E-Mail-Adresse. Eine
        zusätzliche Kontaktaufnahme ist nicht erforderlich.
      </p>
      <p>
        Ihr Zugang und die zugehörigen personenbezogenen Daten werden gelöscht.
        Nur Daten, die aufgrund gesetzlicher Pflichten weiter aufbewahrt werden
        müssen, bleiben eingeschränkt gespeichert; die Bestätigung erläutert
        diese Ausnahmen. Bis zur Bearbeitung bleibt der Zugang nutzbar, danach
        können Sie sich nicht mehr anmelden.
      </p>
      {requests.isPending ? (
        <p>Wird geladen …</p>
      ) : requests.error ? (
        <p role="alert">
          Löschanträge konnten nicht geladen werden. Bitte laden Sie die Seite
          erneut.
        </p>
      ) : own ? (
        <p role="status">
          Ihr Löschantrag vom {date(own.requested_at)} ist eingegangen.
          Bearbeitung bis {date(own.due_at)}. Bestätigung an {own.contact_email}
          .
        </p>
      ) : confirming ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <p>
            <strong>
              Möchten Sie Ihr Konto und Ihre Daten wirklich zur Löschung
              anmelden?
            </strong>{" "}
            Die Löschung kann nach der Durchführung nicht rückgängig gemacht
            werden.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={submit.isPending}
              onClick={() => setConfirming(false)}
            >
              Abbrechen
            </button>
            <button className="danger" disabled={submit.isPending}>
              {submit.isPending
                ? "Wird übermittelt …"
                : "Löschantrag verbindlich absenden"}
            </button>
          </div>
        </form>
      ) : (
        <button
          className="danger"
          onClick={() => {
            submit.reset();
            setConfirming(true);
          }}
        >
          Löschung beantragen
        </button>
      )}
      {submit.error && (
        <p role="alert">
          Der Löschantrag konnte nicht übermittelt werden. Bitte versuchen Sie
          es erneut.
        </p>
      )}
      {submit.isSuccess && !own && (
        <p role="status">
          Ihr Antrag wurde gespeichert. Die Bearbeitung erfolgt innerhalb von 7
          Tagen.
        </p>
      )}
      {has("data.correct") && (
        <>
          <h4>Löschanträge der Organisation</h4>
          <p>
            Fristgerecht prüfen: personenbezogene Nachrichten, Anhänge, Profil-
            und Betriebsdaten löschen, soweit keine gesetzliche Aufbewahrung
            erforderlich ist. Eine Kontosperrung oder alleinige Zugangslöschung
            genügt nicht. Aufbewahrte Daten, Rechtsgrund und Frist
            dokumentieren; danach die Abschlussbestätigung per E-Mail versenden.
          </p>
          {requests.data?.map((r) => (
            <DeletionReview key={r.id} request={r} />
          ))}
          {requests.data?.length === 0 && <p>Keine Löschanträge vorhanden.</p>}
        </>
      )}
    </section>
  );
}

function DeletionReview({ request: r }: { request: DeletionRequest }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "complete_account_deletion_request",
        {
          p_request_id: r.id,
          p_completion_note: note.trim(),
          p_confirmation_sent: confirmed,
        },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["account-deletion-requests"] }),
  });
  return (
    <article className="safety-request">
      <h5>
        {r.display_name} ·{" "}
        {r.status === "completed" ? "Abgeschlossen" : "Offen"}
      </h5>
      <p>
        Frist: {date(r.due_at)} · Bestätigung an {r.contact_email}
      </p>
      {r.status === "completed" ? (
        <p>{r.completion_note}</p>
      ) : (
        <>
          <Link to={`/app/admin/users/${r.profile_id}`}>
            Mitarbeiterkonto öffnen und Zugang löschen
          </Link>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              complete.mutate();
            }}
          >
            <label>
              Datenprüfung und Löschung dokumentieren; für verbleibende Daten
              Rechtsgrund und Aufbewahrungsfrist angeben
              <textarea
                value={note}
                minLength={10}
                maxLength={2000}
                required
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                required
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Ich habe die Datenbearbeitung abgeschlossen und die
              Abschlussbestätigung einschließlich etwaiger
              Aufbewahrungsausnahmen an die oben genannte Adresse versendet.
            </label>
            <button
              className="primary"
              disabled={complete.isPending || !confirmed}
            >
              Bearbeitung als abgeschlossen dokumentieren
            </button>
          </form>
          {complete.error && (
            <p role="alert">
              Abschluss nicht gespeichert. Löschen Sie zuerst den Kontozugang
              und bestätigen Sie die Datenbearbeitung und den tatsächlichen
              Versand der Abschlussbestätigung.
            </p>
          )}
        </>
      )}
    </article>
  );
}
