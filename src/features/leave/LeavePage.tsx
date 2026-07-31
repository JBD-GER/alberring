import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  Plus,
  RotateCcw,
  Umbrella,
  UserRound,
  X,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  EmptyState,
  ErrorState,
  FieldError,
  humanizeError,
  LoadingState,
  MutationNotice,
  StatusPill,
  todayInputValue,
  WorkflowHeader,
  WorkflowPanel,
  WorkflowTabs,
  type StatusTone,
} from "../../components/form/WorkflowUI";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./leave.css";

type LeaveStatus =
  "submitted" | "review" | "approved" | "rejected" | "withdrawn" | "cancelled";
type LeaveTab = "mine" | "team";
type LeaveRequest = {
  id: string;
  profile_id: string;
  leave_type: string;
  starts_on: string;
  ends_on: string;
  day_fraction: number;
  workdays: number;
  note: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  profiles: { id: string; display_name: string } | null;
};

type LeaveTypeOption = { code: string; name: string; requires_note: boolean };
const defaultLeaveTypes: LeaveTypeOption[] = [
  { code: "annual", name: "Erholungsurlaub", requires_note: false },
  { code: "special", name: "Sonderurlaub", requires_note: true },
  { code: "unpaid", name: "Unbezahlter Urlaub", requires_note: true },
  { code: "time_off", name: "Freizeitausgleich", requires_note: false },
];

const statusMeta: Record<LeaveStatus, { label: string; tone: StatusTone }> = {
  submitted: { label: "Eingereicht", tone: "info" },
  review: { label: "In Prüfung", tone: "warning" },
  approved: { label: "Genehmigt", tone: "success" },
  rejected: { label: "Abgelehnt", tone: "danger" },
  withdrawn: { label: "Zurückgezogen", tone: "neutral" },
  cancelled: { label: "Storniert", tone: "neutral" },
};

const leaveSchema = z
  .object({
    leaveType: z.string().min(1, "Bitte einen Urlaubstyp wählen."),
    startsOn: z.string().min(1, "Startdatum fehlt."),
    endsOn: z.string().min(1, "Enddatum fehlt."),
    dayFraction: z.enum(["1", "0.5"]),
    note: z.string().trim().max(500, "Maximal 500 Zeichen."),
  })
  .superRefine((values, context) => {
    if (values.endsOn < values.startsOn) {
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "Das Enddatum darf nicht vor dem Start liegen.",
      });
    }
    if (values.dayFraction === "0.5" && values.startsOn !== values.endsOn) {
      context.addIssue({
        code: "custom",
        path: ["dayFraction"],
        message:
          "Ein halber Tag kann nur für einen einzelnen Tag beantragt werden.",
      });
    }
  });

type LeaveFormValues = z.infer<typeof leaveSchema>;

function workdayPreview(startsOn: string, endsOn: string, dayFraction: string) {
  if (!startsOn || !endsOn || endsOn < startsOn) return 0;
  try {
    const days = eachDayOfInterval({
      start: parseISO(startsOn),
      end: parseISO(endsOn),
    }).filter((day) => !isWeekend(day)).length;
    return days * Number(dayFraction);
  } catch {
    return 0;
  }
}

const leaveTypeLabel = (value: string, options: LeaveTypeOption[]) =>
  options.find((type) => type.code === value)?.name ?? value;

export function LeavePage() {
  const { appSession, has } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<LeaveTab>("mine");
  const [decisionRequest, setDecisionRequest] = useState<LeaveRequest | null>(
    null,
  );
  const canCreate = has("leave.create_own");
  const canViewTeam = has("leave.view_team");
  const canApprove = has("leave.approve") || has("leave.manage");

  const requestsQuery = useQuery({
    queryKey: ["leave-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_leave_requests");
      if (error) throw error;
      return data as unknown as LeaveRequest[];
    },
    enabled: Boolean(appSession),
  });
  const leaveTypesQuery = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_types")
        .select("code,name,requires_note")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as LeaveTypeOption[];
    },
    enabled: Boolean(appSession),
  });
  const availableLeaveTypes = leaveTypesQuery.data?.length
    ? leaveTypesQuery.data
    : defaultLeaveTypes;

  const withdraw = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("withdraw_leave_request", {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["leave-requests"] }),
  });

  const requests = requestsQuery.data ?? [];
  const mine = requests.filter(
    (request) => request.profile_id === appSession?.profile.id,
  );
  const team = requests.filter(
    (request) => request.profile_id !== appSession?.profile.id,
  );
  const visible = tab === "mine" ? mine : team;
  const pendingTeam = team.filter(
    (request) => request.status === "submitted" || request.status === "review",
  ).length;

  return (
    <div className="wf-page leave-page">
      <WorkflowHeader
        eyebrow="Abwesenheit"
        title="Urlaub"
        description="Urlaub transparent beantragen, Arbeitstage prüfen und den Freigabestatus verfolgen."
        action={
          canCreate ? (
            <button
              type="button"
              className="wf-primary"
              onClick={() => setFormOpen(true)}
            >
              <Plus size={19} /> Urlaub beantragen
            </button>
          ) : null
        }
      />

      {formOpen && canCreate ? (
        <LeaveRequestForm
          leaveTypes={availableLeaveTypes}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      ) : null}
      {decisionRequest && canApprove ? (
        <LeaveDecisionPanel
          request={decisionRequest}
          onClose={() => setDecisionRequest(null)}
        />
      ) : null}

      <div className="wf-stat-grid">
        <div className="wf-stat">
          <strong>
            {mine
              .filter((request) => request.status === "approved")
              .reduce((sum, request) => sum + Number(request.workdays), 0)
              .toLocaleString("de-DE")}
          </strong>
          <span>genehmigte Arbeitstage</span>
        </div>
        <div className="wf-stat">
          <strong>
            {
              mine.filter(
                (request) =>
                  request.status === "submitted" || request.status === "review",
              ).length
            }
          </strong>
          <span>eigene Anträge offen</span>
        </div>
        {canViewTeam ? (
          <div className="wf-stat">
            <strong>{pendingTeam}</strong>
            <span>Team-Anträge offen</span>
          </div>
        ) : null}
      </div>

      {canViewTeam ? (
        <WorkflowTabs
          value={tab}
          onChange={setTab}
          label="Urlaubsansicht"
          options={[
            { value: "mine", label: "Meine Anträge", count: mine.length },
            { value: "team", label: "Team & Freigabe", count: team.length },
          ]}
        />
      ) : null}

      {requestsQuery.isLoading ? (
        <LoadingState label="Urlaubsanträge werden geladen …" />
      ) : null}
      {requestsQuery.error ? (
        <ErrorState onRetry={() => void requestsQuery.refetch()} />
      ) : null}
      {!requestsQuery.isLoading &&
      !requestsQuery.error &&
      visible.length === 0 ? (
        <EmptyState
          title={
            tab === "mine" ? "Noch kein Urlaubsantrag" : "Keine Team-Anträge"
          }
          description={
            tab === "mine"
              ? "Neue Anträge und ihr aktueller Status erscheinen hier."
              : "Aktuell wartet kein sichtbarer Antrag auf Bearbeitung."
          }
          action={
            tab === "mine" && canCreate ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setFormOpen(true)}
              >
                <Umbrella size={18} /> Ersten Antrag stellen
              </button>
            ) : null
          }
        />
      ) : null}
      {!requestsQuery.isLoading &&
      !requestsQuery.error &&
      visible.length > 0 ? (
        <div className="wf-list">
          {visible.map((request) => {
            const meta = statusMeta[request.status];
            const own = request.profile_id === appSession?.profile.id;
            const canWithdraw =
              own &&
              (request.status === "submitted" || request.status === "review");
            return (
              <article className="wf-list-card leave-card" key={request.id}>
                <div className="wf-list-card-heading">
                  <div>
                    <h3>
                      {own
                        ? leaveTypeLabel(
                            request.leave_type,
                            availableLeaveTypes,
                          )
                        : (request.profiles?.display_name ?? "Mitarbeiter/in")}
                    </h3>
                    {!own ? (
                      <p>
                        {leaveTypeLabel(
                          request.leave_type,
                          availableLeaveTypes,
                        )}
                      </p>
                    ) : null}
                  </div>
                  <StatusPill label={meta.label} tone={meta.tone} />
                </div>
                <div className="wf-meta">
                  <span>
                    <CalendarDays />
                    {format(parseISO(request.starts_on), "dd.MM.yyyy")}–
                    {format(parseISO(request.ends_on), "dd.MM.yyyy")}
                  </span>
                  <span>
                    <Clock3 />
                    {Number(request.workdays).toLocaleString("de-DE")}{" "}
                    {Number(request.workdays) === 1
                      ? "Arbeitstag"
                      : "Arbeitstage"}
                  </span>
                  {!own ? (
                    <span>
                      <UserRound />
                      {request.profiles?.display_name}
                    </span>
                  ) : null}
                </div>
                {own && request.note ? (
                  <p className="leave-note">„{request.note}“</p>
                ) : null}
                <LeaveTimeline request={request} />
                {request.decision_note && own ? (
                  <div className="leave-decision-note">
                    <strong>Hinweis zur Entscheidung</strong>
                    <p>{request.decision_note}</p>
                  </div>
                ) : null}
                {canWithdraw ||
                (!own &&
                  canApprove &&
                  (request.status === "submitted" ||
                    request.status === "review")) ? (
                  <div className="wf-card-actions">
                    {canWithdraw ? (
                      <button
                        type="button"
                        className="wf-quiet"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate(request.id)}
                      >
                        <RotateCcw size={16} /> Antrag zurückziehen
                      </button>
                    ) : null}
                    {!own && canApprove ? (
                      <button
                        type="button"
                        className="wf-secondary"
                        onClick={() => setDecisionRequest(request)}
                      >
                        <FileCheck2 size={17} /> Antrag bearbeiten
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {withdraw.error ? (
                  <MutationNotice kind="error">
                    {humanizeError(
                      withdraw.error,
                      "Der Antrag konnte nicht zurückgezogen werden.",
                    )}
                  </MutationNotice>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LeaveRequestForm({
  leaveTypes,
  onClose,
  onSaved,
}: {
  leaveTypes: LeaveTypeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      leaveType: leaveTypes[0]?.code ?? "annual",
      startsOn: todayInputValue(),
      endsOn: todayInputValue(),
      dayFraction: "1",
      note: "",
    },
  });
  const startsOn = useWatch({ control, name: "startsOn" });
  const endsOn = useWatch({ control, name: "endsOn" });
  const dayFraction = useWatch({ control, name: "dayFraction" });
  const leaveType = useWatch({ control, name: "leaveType" });
  const noteRequired =
    leaveTypes.find((type) => type.code === leaveType)?.requires_note ?? false;
  const preview = useMemo(
    () => workdayPreview(startsOn, endsOn, dayFraction),
    [dayFraction, endsOn, startsOn],
  );
  const submit = useMutation({
    mutationFn: async (values: LeaveFormValues) => {
      const { data, error } = await supabase.rpc("submit_leave_request", {
        p_leave_type: values.leaveType,
        p_starts_on: values.startsOn,
        p_ends_on: values.endsOn,
        p_day_fraction: Number(values.dayFraction),
        p_note: values.note.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      reset();
      await queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      onSaved();
    },
  });
  return (
    <WorkflowPanel
      title="Urlaub beantragen"
      description="Die angezeigte Berechnung berücksichtigt Wochenenden. Feiertage und Ihr Arbeitszeitmodell werden beim Absenden serverseitig berücksichtigt."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => {
          if (noteRequired && !values.note.trim()) {
            setError("note", {
              type: "required",
              message:
                "Für diesen Urlaubstyp ist eine kurze Begründung erforderlich.",
            });
            return;
          }
          submit.mutate(values);
        })}
        noValidate
      >
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Urlaubstyp</span>
            <select
              {...register("leaveType")}
              aria-invalid={Boolean(errors.leaveType)}
            >
              {leaveTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
            <FieldError>{errors.leaveType?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Umfang</span>
            <select
              {...register("dayFraction")}
              aria-invalid={Boolean(errors.dayFraction)}
            >
              <option value="1">Ganzer Tag</option>
              <option value="0.5">Halber Tag</option>
            </select>
            <FieldError>{errors.dayFraction?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Von</span>
            <input
              type="date"
              min={todayInputValue()}
              {...register("startsOn")}
              aria-invalid={Boolean(errors.startsOn)}
            />
            <FieldError>{errors.startsOn?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Bis</span>
            <input
              type="date"
              min={startsOn || todayInputValue()}
              {...register("endsOn")}
              aria-invalid={Boolean(errors.endsOn)}
            />
            <FieldError>{errors.endsOn?.message}</FieldError>
          </label>
        </div>
        <div className="leave-workday-preview">
          <CalendarDays />
          <div>
            <strong>
              {preview.toLocaleString("de-DE")}{" "}
              {preview === 1 ? "Arbeitstag" : "Arbeitstage"}
            </strong>
            <span>
              Vorläufige Berechnung; verbindlich ist die serverseitig
              gespeicherte Anzahl.
            </span>
          </div>
        </div>
        <label className="wf-field">
          <span>
            {noteRequired ? "Begründung" : "Optionale Notiz"}{" "}
            <small>
              {noteRequired ? "erforderlich · " : ""}max. 500 Zeichen
            </small>
          </span>
          <textarea
            {...register("note")}
            aria-invalid={Boolean(errors.note)}
            placeholder="Kurzer organisatorischer Hinweis …"
          />
          <FieldError>{errors.note?.message}</FieldError>
        </label>
        <MutationNotice kind="error">
          {submit.error
            ? humanizeError(
                submit.error,
                "Der Urlaubsantrag konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className="wf-primary"
            disabled={submit.isPending || preview <= 0}
          >
            <Umbrella size={18} />
            {submit.isPending ? "Wird eingereicht …" : "Antrag einreichen"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function LeaveDecisionPanel({
  request,
  onClose,
}: {
  request: LeaveRequest;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: async (status: "review" | "approved" | "rejected") => {
      if (status === "rejected" && !note.trim())
        throw new Error("Ablehnungsgrund fehlt");
      const { error } = await supabase.rpc("decide_leave_request", {
        p_request_id: request.id,
        p_status: status,
        p_note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title={`Antrag von ${request.profiles?.display_name ?? "Mitarbeiter/in"} bearbeiten`}
      description={`${format(parseISO(request.starts_on), "dd.MM.yyyy")} bis ${format(parseISO(request.ends_on), "dd.MM.yyyy")} · ${Number(request.workdays).toLocaleString("de-DE")} Arbeitstage`}
      onClose={onClose}
    >
      <label className="wf-field">
        <span>
          Kommentar zur Entscheidung <small>bei Ablehnung erforderlich</small>
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          placeholder="Sachlicher Hinweis an die antragstellende Person …"
        />
      </label>
      <MutationNotice kind="error">
        {decide.error
          ? decide.error.message === "Ablehnungsgrund fehlt"
            ? "Bitte begründen Sie die Ablehnung."
            : humanizeError(
                decide.error,
                "Die Entscheidung konnte nicht gespeichert werden.",
              )
          : null}
      </MutationNotice>
      <div className="leave-decision-actions">
        <button
          type="button"
          className="wf-secondary"
          onClick={() => decide.mutate("review")}
          disabled={decide.isPending}
        >
          <Clock3 size={17} /> In Prüfung
        </button>
        <button
          type="button"
          className="wf-danger"
          onClick={() => decide.mutate("rejected")}
          disabled={decide.isPending || !note.trim()}
        >
          <X size={17} /> Ablehnen
        </button>
        <button
          type="button"
          className="wf-primary"
          onClick={() => decide.mutate("approved")}
          disabled={decide.isPending}
        >
          <Check size={17} /> Genehmigen
        </button>
      </div>
    </WorkflowPanel>
  );
}

function LeaveTimeline({ request }: { request: LeaveRequest }) {
  const current = statusMeta[request.status];
  return (
    <ol className="leave-timeline" aria-label="Statusverlauf">
      <li className="done">
        <span>
          <Check size={13} />
        </span>
        <div>
          <strong>Eingereicht</strong>
          <small>
            {format(new Date(request.created_at), "dd.MM.yyyy · HH:mm", {
              locale: de,
            })}
          </small>
        </div>
      </li>
      <li
        className={
          request.status === "submitted"
            ? "current"
            : request.decided_at || request.status === "review"
              ? "done"
              : ""
        }
      >
        <span>
          {request.status === "submitted" ? "2" : <Check size={13} />}
        </span>
        <div>
          <strong>
            {request.status === "submitted"
              ? "Prüfung ausstehend"
              : current.label}
          </strong>
          <small>
            {request.decided_at
              ? format(new Date(request.decided_at), "dd.MM.yyyy · HH:mm", {
                  locale: de,
                })
              : request.status === "review"
                ? "Antrag wird geprüft"
                : "Noch offen"}
          </small>
        </div>
      </li>
    </ol>
  );
}

export function LeaveAdminPage() {
  return <LeavePage />;
}
