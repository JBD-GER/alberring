import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  Package,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  EmptyState,
  ErrorState,
  FieldError,
  humanizeError,
  LoadingState,
  MutationNotice,
  StatusPill,
  WorkflowHeader,
  WorkflowPanel,
  WorkflowTabs,
  type StatusTone,
} from "../../components/form/WorkflowUI";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./materials.css";

type MaterialTab = "mine" | "manage";
type MaterialStatus =
  | "draft"
  | "submitted"
  | "review"
  | "approved"
  | "rejected"
  | "ordered"
  | "partially_delivered"
  | "delivered"
  | "completed"
  | "cancelled";
type MaterialPriority = "low" | "normal" | "high" | "urgent";
type StatusHistory = {
  id: string;
  from_status: MaterialStatus | null;
  to_status: MaterialStatus;
  comment: string | null;
  created_at: string;
  actor_id: string;
  profiles: { display_name: string } | null;
};
type MaterialRequest = {
  id: string;
  requester_id: string;
  category: string;
  item: string;
  quantity: number;
  unit: string;
  priority: MaterialPriority;
  needed_on: string | null;
  reason: string | null;
  status: MaterialStatus;
  created_at: string;
  profiles: { id: string; display_name: string } | null;
  material_request_status_history: StatusHistory[];
};

const categories = [
  { value: "care_supplies", label: "Pflege- und Verbrauchsmittel" },
  { value: "hygiene", label: "Hygiene" },
  { value: "protective_equipment", label: "Schutzausrüstung" },
  { value: "workwear", label: "Arbeitskleidung" },
  { value: "office", label: "Bürobedarf" },
  { value: "technical", label: "Technik" },
  { value: "other", label: "Sonstiges" },
] as const;
const units = [
  "Stück",
  "Packung",
  "Karton",
  "Paar",
  "Liter",
  "Kilogramm",
  "Set",
];
const priorityMeta: Record<
  MaterialPriority,
  { label: string; tone: StatusTone }
> = {
  low: { label: "Niedrig", tone: "neutral" },
  normal: { label: "Normal", tone: "info" },
  high: { label: "Hoch", tone: "warning" },
  urgent: { label: "Dringend", tone: "danger" },
};
const statusMeta: Record<MaterialStatus, { label: string; tone: StatusTone }> =
  {
    draft: { label: "Entwurf", tone: "neutral" },
    submitted: { label: "Eingereicht", tone: "info" },
    review: { label: "In Prüfung", tone: "warning" },
    approved: { label: "Genehmigt", tone: "success" },
    rejected: { label: "Abgelehnt", tone: "danger" },
    ordered: { label: "Bestellt", tone: "info" },
    partially_delivered: { label: "Teilweise geliefert", tone: "warning" },
    delivered: { label: "Geliefert", tone: "success" },
    completed: { label: "Abgeschlossen", tone: "success" },
    cancelled: { label: "Storniert", tone: "neutral" },
  };
const statusTransitions: Record<MaterialStatus, MaterialStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["review", "approved", "rejected", "cancelled"],
  review: ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  rejected: [],
  ordered: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["delivered", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};
const approvalTransitions: Partial<Record<MaterialStatus, MaterialStatus[]>> = {
  submitted: ["approved", "rejected"],
  review: ["approved", "rejected"],
};
const categoryLabel = (value: string) =>
  categories.find((category) => category.value === value)?.label ?? value;

const materialSchema = z.object({
  category: z.string().min(1, "Bitte eine Kategorie wählen."),
  item: z
    .string()
    .trim()
    .min(2, "Bitte den benötigten Artikel beschreiben.")
    .max(200, "Maximal 200 Zeichen."),
  quantity: z
    .number()
    .positive("Die Menge muss größer als null sein.")
    .max(100_000, "Bitte die Menge prüfen."),
  unit: z.string().min(1, "Einheit fehlt."),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  neededOn: z.string(),
  reason: z.string().trim().max(1000, "Maximal 1.000 Zeichen."),
});
type MaterialFormValues = z.infer<typeof materialSchema>;

export function MaterialRequestsPage() {
  const { appSession, has } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MaterialTab>("mine");
  const [editor, setEditor] = useState<MaterialRequest | "new" | null>(null);
  const [statusRequest, setStatusRequest] = useState<MaterialRequest | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState("open");
  const canCreate = has("materials.create_own");
  const canViewTeam =
    has("materials.view_team") ||
    has("materials.manage") ||
    has("materials.approve");
  const canManage = has("materials.manage");
  const canApprove = has("materials.approve");
  const canProcess = canManage || canApprove;
  const availableTransitions = (status: MaterialStatus) =>
    canManage ? statusTransitions[status] : (approvalTransitions[status] ?? []);

  const requestsQuery = useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_requests")
        .select(
          "id,requester_id,category,item,quantity,unit,priority,needed_on,reason,status,created_at,profiles!material_requests_requester_id_fkey(id,display_name),material_request_status_history(id,from_status,to_status,comment,created_at,actor_id,profiles!material_request_status_history_actor_id_fkey(display_name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as MaterialRequest[];
    },
  });

  const changeOwnStatus = useMutation({
    mutationFn: async ({
      requestId,
      status,
    }: {
      requestId: string;
      status: "cancelled" | "completed";
    }) => {
      const { error } = await supabase.rpc("set_material_request_status", {
        p_request_id: requestId,
        p_status: status,
        p_comment:
          status === "cancelled"
            ? "Durch antragstellende Person storniert"
            : "Erhalt durch antragstellende Person bestätigt",
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["material-requests"] }),
  });

  const requests = requestsQuery.data ?? [];
  const mine = requests.filter(
    (request) => request.requester_id === appSession?.profile.id,
  );
  const managed = requests.filter(
    (request) => request.requester_id !== appSession?.profile.id,
  );
  const baseVisible = tab === "mine" ? mine : managed;
  const terminalStatuses: MaterialStatus[] = [
    "completed",
    "cancelled",
    "rejected",
  ];
  const visible =
    statusFilter === "all"
      ? baseVisible
      : baseVisible.filter(
          (request) => !terminalStatuses.includes(request.status),
        );
  const openManaged = managed.filter(
    (request) => request.status === "submitted" || request.status === "review",
  ).length;

  return (
    <div className="wf-page materials-page">
      <WorkflowHeader
        eyebrow="Bedarf & Beschaffung"
        title="Materialanforderungen"
        description="Materialbedarf digital einreichen und vom Entwurf bis zur Lieferung nachvollziehen."
        action={
          canCreate ? (
            <button
              type="button"
              className="wf-primary"
              onClick={() => setEditor("new")}
            >
              <Plus size={19} /> Anforderung erstellen
            </button>
          ) : null
        }
      />

      {editor && (canCreate || (editor !== "new" && has("data.correct"))) ? (
        <MaterialEditor
          request={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {statusRequest && canProcess ? (
        <MaterialStatusPanel
          request={statusRequest}
          availableStatuses={availableTransitions(statusRequest.status)}
          onClose={() => setStatusRequest(null)}
        />
      ) : null}

      <div className="wf-stat-grid">
        <div className="wf-stat">
          <strong>
            {
              mine.filter(
                (request) => !terminalStatuses.includes(request.status),
              ).length
            }
          </strong>
          <span>eigene Vorgänge offen</span>
        </div>
        <div className="wf-stat">
          <strong>
            {mine.filter((request) => request.status === "delivered").length}
          </strong>
          <span>zur Bestätigung geliefert</span>
        </div>
        {canViewTeam ? (
          <div className="wf-stat">
            <strong>{openManaged}</strong>
            <span>zur Bearbeitung</span>
          </div>
        ) : null}
      </div>

      <div className="wf-toolbar">
        {canViewTeam ? (
          <WorkflowTabs
            value={tab}
            onChange={setTab}
            label="Materialansicht"
            options={[
              {
                value: "mine",
                label: "Meine Anforderungen",
                count: mine.length,
              },
              { value: "manage", label: "Bearbeitung", count: managed.length },
            ]}
          />
        ) : (
          <span />
        )}
        <select
          className="wf-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Status filtern"
        >
          <option value="open">Nur offene</option>
          <option value="all">Alle Status</option>
        </select>
      </div>

      {requestsQuery.isLoading ? (
        <LoadingState label="Materialanforderungen werden geladen …" />
      ) : null}
      {requestsQuery.error ? (
        <ErrorState onRetry={() => void requestsQuery.refetch()} />
      ) : null}
      {!requestsQuery.isLoading &&
      !requestsQuery.error &&
      visible.length === 0 ? (
        <EmptyState
          title={
            tab === "mine"
              ? "Keine Anforderungen gefunden"
              : "Nichts zu bearbeiten"
          }
          description={
            statusFilter === "open"
              ? "Es gibt derzeit keine offenen Vorgänge in dieser Ansicht."
              : "Gespeicherte Anforderungen erscheinen an dieser Stelle."
          }
          action={
            tab === "mine" && canCreate ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setEditor("new")}
              >
                <Package size={18} /> Bedarf erfassen
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
            const own = request.requester_id === appSession?.profile.id;
            const status = statusMeta[request.status];
            const priority =
              priorityMeta[request.priority] ?? priorityMeta.normal;
            const canEditDraft = own && request.status === "draft";
            const canCancel =
              own && ["draft", "submitted", "review"].includes(request.status);
            return (
              <article className="wf-list-card material-card" key={request.id}>
                <div className="wf-list-card-heading">
                  <div>
                    <span className="material-category">
                      {categoryLabel(request.category)}
                    </span>
                    <h3>{request.item}</h3>
                    {!own ? (
                      <p>
                        {request.profiles?.display_name ?? "Mitarbeiter/in"}
                      </p>
                    ) : null}
                  </div>
                  <div className="material-statuses">
                    <StatusPill label={priority.label} tone={priority.tone} />
                    <StatusPill label={status.label} tone={status.tone} />
                  </div>
                </div>
                <div className="wf-meta">
                  <span>
                    <Package />
                    {Number(request.quantity).toLocaleString("de-DE")}{" "}
                    {request.unit}
                  </span>
                  {request.needed_on ? (
                    <span>
                      <CalendarDays />
                      Benötigt bis{" "}
                      {format(parseISO(request.needed_on), "dd.MM.yyyy")}
                    </span>
                  ) : null}
                  {!own ? (
                    <span>
                      <UserRound />
                      {request.profiles?.display_name}
                    </span>
                  ) : null}
                </div>
                {request.reason ? (
                  <p className="material-reason">{request.reason}</p>
                ) : null}
                <MaterialTimeline request={request} />
                <div className="wf-card-actions">
                  {canEditDraft || has("data.correct") ? (
                    <button
                      type="button"
                      className="wf-secondary"
                      onClick={() => setEditor(request)}
                    >
                      <Pencil size={16} />{" "}
                      {canEditDraft
                        ? "Entwurf bearbeiten"
                        : "Daten korrigieren"}
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      className="wf-quiet"
                      onClick={() =>
                        changeOwnStatus.mutate({
                          requestId: request.id,
                          status: "cancelled",
                        })
                      }
                      disabled={changeOwnStatus.isPending}
                    >
                      <X size={16} /> Stornieren
                    </button>
                  ) : null}
                  {!own &&
                  canProcess &&
                  availableTransitions(request.status).length > 0 ? (
                    <button
                      type="button"
                      className="wf-primary"
                      onClick={() => setStatusRequest(request)}
                    >
                      <ClipboardCheck size={17} /> Status bearbeiten
                    </button>
                  ) : null}
                  {own && request.status === "delivered" ? (
                    <button
                      type="button"
                      className="wf-primary"
                      onClick={() =>
                        changeOwnStatus.mutate({
                          requestId: request.id,
                          status: "completed",
                        })
                      }
                      disabled={changeOwnStatus.isPending}
                    >
                      <Check size={17} /> Erhalt bestätigen
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {changeOwnStatus.error ? (
        <MutationNotice kind="error">
          {humanizeError(
            changeOwnStatus.error,
            "Der Status der Anforderung konnte nicht gespeichert werden.",
          )}
        </MutationNotice>
      ) : null}
    </div>
  );
}

function MaterialEditor({
  request,
  onClose,
}: {
  request: MaterialRequest | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { has, appSession } = useAuth();
  const correcting = Boolean(
    request &&
    has("data.correct") &&
    (request.status !== "draft" ||
      request.requester_id !== appSession?.profile.id),
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      category: request?.category ?? "care_supplies",
      item: request?.item ?? "",
      quantity: request?.quantity ?? 1,
      unit: request?.unit ?? "Stück",
      priority: request?.priority ?? "normal",
      neededOn: request?.needed_on ?? "",
      reason: request?.reason ?? "",
    },
  });
  const save = useMutation({
    mutationFn: async ({
      values,
      status,
    }: {
      values: MaterialFormValues;
      status: "draft" | "submitted";
    }) => {
      if (correcting && correctionReason.trim().length < 3)
        throw new Error(
          "Bitte einen Korrekturgrund mit mindestens 3 Zeichen angeben.",
        );
      const { data, error } = await supabase.rpc(
        correcting ? "correct_material_request" : "save_material_request",
        {
          p_request_id: request?.id ?? null,
          p_category: values.category,
          p_item: values.item.trim(),
          p_quantity: values.quantity,
          p_unit: values.unit,
          p_priority: values.priority,
          p_needed_on: values.neededOn || null,
          p_reason: values.reason.trim() || null,
          ...(correcting
            ? { p_correction_reason: correctionReason.trim() }
            : { p_status: status }),
        },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["material-requests"] });
      onClose();
    },
  });
  const persist = (status: "draft" | "submitted") =>
    handleSubmit((values) => save.mutate({ values, status }))();
  return (
    <WorkflowPanel
      title={
        correcting
          ? "Materialanforderung korrigieren"
          : request
            ? "Entwurf bearbeiten"
            : "Material anfordern"
      }
      description="Beschreiben Sie ausschließlich den betrieblichen Bedarf. Tragen Sie keine Patienten- oder Pflegedaten ein."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={(event) => event.preventDefault()}
        noValidate
      >
        {correcting ? (
          <>
            <MutationNotice kind="info">
              Person und Bearbeitungsstatus bleiben erhalten. Jede Korrektur
              wird protokolliert.
            </MutationNotice>
            <label className="wf-field">
              <span>Korrekturgrund</span>
              <input
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
              />
            </label>
          </>
        ) : null}
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Kategorie</span>
            <select
              {...register("category")}
              aria-invalid={Boolean(errors.category)}
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <FieldError>{errors.category?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Artikel / Material</span>
            <input
              {...register("item")}
              placeholder="z. B. Einmalhandschuhe Größe M"
              aria-invalid={Boolean(errors.item)}
            />
            <FieldError>{errors.item?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Menge</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              {...register("quantity", { valueAsNumber: true })}
              aria-invalid={Boolean(errors.quantity)}
            />
            <FieldError>{errors.quantity?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Einheit</span>
            <select {...register("unit")}>
              {units.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
          </label>
          <label className="wf-field">
            <span>Priorität</span>
            <select {...register("priority")}>
              <option value="low">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="high">Hoch</option>
              <option value="urgent">Dringend</option>
            </select>
          </label>
          <label className="wf-field">
            <span>Gewünschtes Datum</span>
            <input type="date" {...register("neededOn")} />
          </label>
        </div>
        <label className="wf-field">
          <span>
            Begründung <small>optional, max. 1.000 Zeichen</small>
          </span>
          <textarea
            {...register("reason")}
            placeholder="Kurze betriebliche Begründung …"
            aria-invalid={Boolean(errors.reason)}
          />
          <FieldError>{errors.reason?.message}</FieldError>
        </label>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Die Materialanforderung konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          {!correcting ? (
            <button
              type="button"
              className="wf-secondary"
              onClick={() => void persist("draft")}
              disabled={save.isPending}
            >
              <Save size={17} /> Als Entwurf speichern
            </button>
          ) : null}
          <button
            type="button"
            className="wf-primary"
            onClick={() => void persist("submitted")}
            disabled={save.isPending}
          >
            <ShoppingCart size={18} />
            {save.isPending
              ? "Wird gespeichert …"
              : correcting
                ? "Korrektur speichern"
                : "Anforderung einreichen"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}

function MaterialStatusPanel({
  request,
  availableStatuses,
  onClose,
}: {
  request: MaterialRequest;
  availableStatuses: MaterialStatus[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MaterialStatus>(
    availableStatuses[0] ?? request.status,
  );
  const [comment, setComment] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if ((status === "rejected" || status === "cancelled") && !comment.trim())
        throw new Error("Kommentar erforderlich");
      const { error } = await supabase.rpc("set_material_request_status", {
        p_request_id: request.id,
        p_status: status,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["material-requests"] });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title={`Status: ${request.item}`}
      description={`${Number(request.quantity).toLocaleString("de-DE")} ${request.unit} · angefordert von ${request.profiles?.display_name ?? "Mitarbeiter/in"}`}
      onClose={onClose}
    >
      <div className="wf-form">
        <label className="wf-field">
          <span>Neuer Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as MaterialStatus)
            }
          >
            {availableStatuses.map((nextStatus) => (
              <option key={nextStatus} value={nextStatus}>
                {statusMeta[nextStatus].label}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>
            Kommentar <small>bei Ablehnung oder Stornierung erforderlich</small>
          </span>
          <textarea
            value={comment}
            maxLength={1000}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Hinweis für den Statusverlauf …"
          />
        </label>
        <MutationNotice kind="error">
          {save.error
            ? save.error.message === "Kommentar erforderlich"
              ? "Bitte ergänzen Sie einen sachlichen Kommentar."
              : humanizeError(
                  save.error,
                  "Der Status konnte nicht gespeichert werden.",
                )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button type="button" className="wf-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="wf-primary"
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              availableStatuses.length === 0 ||
              ((status === "rejected" || status === "cancelled") &&
                !comment.trim())
            }
          >
            <ClipboardCheck size={18} />
            {save.isPending ? "Wird gespeichert …" : "Status speichern"}
          </button>
        </div>
      </div>
    </WorkflowPanel>
  );
}

function MaterialTimeline({ request }: { request: MaterialRequest }) {
  const history = [...(request.material_request_status_history ?? [])].sort(
    (a, b) => a.created_at.localeCompare(b.created_at),
  );
  const events = [
    {
      id: "created",
      label:
        request.status === "draft" && !history.length
          ? "Entwurf gespeichert"
          : "Anforderung angelegt",
      date: request.created_at,
      comment: null as string | null,
    },
    ...history.map((entry) => ({
      id: entry.id,
      label: statusMeta[entry.to_status]?.label ?? entry.to_status,
      date: entry.created_at,
      comment: entry.comment,
    })),
  ];
  return (
    <ol className="material-timeline" aria-label="Statusverlauf">
      {events.map((event, index) => (
        <li
          key={event.id}
          className={index === events.length - 1 ? "current" : "done"}
        >
          <span>
            {index === events.length - 1 ? (
              <Clock3 size={13} />
            ) : (
              <Check size={13} />
            )}
          </span>
          <div>
            <strong>{event.label}</strong>
            <small>
              {format(new Date(event.date), "dd.MM.yyyy · HH:mm", {
                locale: de,
              })}
            </small>
            {event.comment ? <p>{event.comment}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function MaterialRequestsAdminPage() {
  return <MaterialRequestsPage />;
}
