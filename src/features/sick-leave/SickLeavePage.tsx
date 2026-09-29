import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  Download,
  FileCheck2,
  FileUp,
  LockKeyhole,
  Plus,
  Pencil,
  ShieldCheck,
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
import { EmployeeSelect } from "../../components/form/EmployeeSelect";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import "./sick-leave.css";

type SickTab = "mine" | "team";
type SickStatus =
  "reported" | "confirmed" | "extended" | "closed" | "cancelled";
type SickLeaveRecord = {
  id: string;
  profile_id: string;
  starts_on: string;
  expected_end_on: string | null;
  end_unknown: boolean;
  certificate_status: string | null;
  status: SickStatus;
  created_at: string;
  profiles: { id: string; display_name: string } | null;
};
type CertificateVersion = {
  id: string;
  sick_leave_id: string;
  storage_path: string;
  version: number;
  uploaded_by: string;
  created_at: string;
};

const allowedCertificateTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxCertificateSize = 10 * 1024 * 1024;

const statusMeta: Record<SickStatus, { label: string; tone: StatusTone }> = {
  reported: { label: "Gemeldet", tone: "warning" },
  confirmed: { label: "Erfasst", tone: "info" },
  extended: { label: "Verlängert", tone: "warning" },
  closed: { label: "Beendet", tone: "success" },
  cancelled: { label: "Storniert", tone: "neutral" },
};
const certificateLabels: Record<string, string> = {
  not_required: "Kein Attest angekündigt",
  required: "Attest erforderlich",
  pending: "Attest folgt",
  received: "Attest sicher hinterlegt",
  verified: "Attest geprüft",
  rejected: "Attest muss erneut eingereicht werden",
};

const sickSchema = z
  .object({
    profileId: z.uuid("Bitte eine Person auswählen."),
    startsOn: z.string().min(1, "Beginn fehlt."),
    expectedEndOn: z.string(),
    endUnknown: z.boolean(),
    certificatePlan: z.enum(["not_required", "pending"]),
    privacyConfirmed: z
      .boolean()
      .refine(Boolean, "Bitte bestätigen Sie den Datenschutzhinweis."),
  })
  .superRefine((values, context) => {
    if (!values.endUnknown && !values.expectedEndOn) {
      context.addIssue({
        code: "custom",
        path: ["expectedEndOn"],
        message:
          "Bitte ein voraussichtliches Ende angeben oder „noch unbekannt“ wählen.",
      });
    }
    if (values.expectedEndOn && values.expectedEndOn < values.startsOn) {
      context.addIssue({
        code: "custom",
        path: ["expectedEndOn"],
        message: "Das Ende darf nicht vor dem Beginn liegen.",
      });
    }
  });
type SickFormValues = z.infer<typeof sickSchema>;

function validateCertificate(file: File) {
  if (!allowedCertificateTypes.includes(file.type))
    throw new Error("Nur PDF-, JPG- oder PNG-Dateien sind erlaubt.");
  if (file.size > maxCertificateSize)
    throw new Error("Die Datei darf höchstens 10 MB groß sein.");
}

function extensionFor(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}

async function uploadCertificate({
  recordId,
  profileId,
  ownerProfileId = profileId,
  organizationId,
  file,
  version,
}: {
  recordId: string;
  profileId: string;
  ownerProfileId?: string;
  organizationId: string;
  file: File;
  version: number;
}) {
  validateCertificate(file);
  const versionId = crypto.randomUUID();
  const path = `${organizationId}/${ownerProfileId}/${recordId}/${versionId}.${extensionFor(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("sick-certificates")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error: metadataError } = await supabase
    .from("sick_leave_document_versions")
    .insert({
      id: versionId,
      organization_id: organizationId,
      sick_leave_id: recordId,
      storage_path: path,
      version,
      uploaded_by: profileId,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    });
  if (metadataError) {
    await supabase.storage.from("sick-certificates").remove([path]);
    throw metadataError;
  }
  const { error: statusError } = await supabase
    .from("sick_leave_records")
    .update({ certificate_status: "received" })
    .eq("id", recordId);
  if (statusError) throw statusError;
}

export function SickLeavePage() {
  const { appSession, has } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SickTab>("mine");
  const [formOpen, setFormOpen] = useState(false);
  const [correctionRecord, setCorrectionRecord] =
    useState<SickLeaveRecord | null>(null);
  const [extensionRecord, setExtensionRecord] =
    useState<SickLeaveRecord | null>(null);
  const canCreate = has("sick_leave.create");
  const canSeeStatus =
    has("sick_leave.view_status") || has("sick_leave.manage");
  const canManage = has("sick_leave.manage");
  const canViewCertificates = has("sick_leave.view_certificates");

  const recordsQuery = useQuery({
    queryKey: ["sick-leave-records"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_sick_leave_records");
      if (error) throw error;
      return data as unknown as SickLeaveRecord[];
    },
    enabled: Boolean(appSession),
  });

  const records = recordsQuery.data ?? [];
  const mine = records.filter(
    (record) => record.profile_id === appSession?.profile.id,
  );
  const team = records.filter(
    (record) => record.profile_id !== appSession?.profile.id,
  );
  const recordIds = [...mine, ...(canViewCertificates ? team : [])].map(
    (record) => record.id,
  );
  const certificatesQuery = useQuery({
    queryKey: ["sick-leave-certificates", recordIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sick_leave_document_versions")
        .select("id,sick_leave_id,storage_path,version,uploaded_by,created_at")
        .in("sick_leave_id", recordIds)
        .order("version", { ascending: true });
      if (error) throw error;
      return data as CertificateVersion[];
    },
    enabled: recordIds.length > 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SickStatus }) => {
      const { error } = await supabase.rpc("set_sick_leave_status", {
        p_record_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["sick-leave-records"] }),
  });

  const visible = tab === "mine" ? mine : team;

  return (
    <div className="wf-page sick-page">
      <WorkflowHeader
        eyebrow="Vertraulicher Bereich"
        title="Krankmeldung"
        description={
          canCreate
            ? "Krankmeldungen für Mitarbeitende ohne Diagnoseangabe erfassen."
            : "Hier sehen Sie Ihre Krankmeldungen. Neue Meldungen erfasst Ihre Administration."
        }
        action={
          canCreate ? (
            <button
              type="button"
              className="wf-primary"
              onClick={() => setFormOpen(true)}
            >
              <Plus size={19} /> Krankmeldung erfassen
            </button>
          ) : null
        }
      />

      <div className="sick-privacy-banner">
        <LockKeyhole />
        <div>
          <strong>Besonders geschützte Personaldaten</strong>
          <p>
            Geben Sie keinen Krankheitsgrund und keine Diagnose an. Führung und
            Disposition sehen ausschließlich den planungsrelevanten
            Abwesenheitszeitraum.
          </p>
        </div>
      </div>

      {formOpen && canCreate && appSession ? (
        <SickReportForm
          profileId={appSession.profile.id}
          organizationId={appSession.profile.organization_id}
          onClose={() => setFormOpen(false)}
          onSaved={(profileId) => {
            setFormOpen(false);
            setTab(profileId === appSession.profile.id ? "mine" : "team");
          }}
        />
      ) : null}
      {correctionRecord && has("data.correct") ? (
        <SickCorrectionForm
          key={correctionRecord.id}
          record={correctionRecord}
          onClose={() => setCorrectionRecord(null)}
        />
      ) : null}
      {extensionRecord ? (
        <SickExtensionForm
          record={extensionRecord}
          onClose={() => setExtensionRecord(null)}
        />
      ) : null}

      {canSeeStatus ? (
        <WorkflowTabs
          value={tab}
          onChange={setTab}
          label="Krankmeldungsansicht"
          options={[
            { value: "mine", label: "Meine Meldungen", count: mine.length },
            {
              value: "team",
              label: canViewCertificates ? "HR-Ansicht" : "Abwesenheitsstatus",
              count: team.length,
            },
          ]}
        />
      ) : null}

      {recordsQuery.isLoading ? (
        <LoadingState label="Krankmeldungen werden geladen …" />
      ) : null}
      {recordsQuery.error ? (
        <ErrorState onRetry={() => void recordsQuery.refetch()} />
      ) : null}
      {!recordsQuery.isLoading &&
      !recordsQuery.error &&
      visible.length === 0 ? (
        <EmptyState
          title={
            tab === "mine"
              ? "Keine Krankmeldung vorhanden"
              : "Keine aktuelle Abwesenheit"
          }
          description={
            tab === "mine"
              ? "Ihre eigenen Meldungen und Attestversionen erscheinen geschützt an dieser Stelle."
              : "Aktuell ist keine für Sie sichtbare krankheitsbedingte Abwesenheit erfasst."
          }
          action={
            tab === "mine" && canCreate ? (
              <button
                type="button"
                className="wf-secondary"
                onClick={() => setFormOpen(true)}
              >
                Meldung erfassen
              </button>
            ) : null
          }
        />
      ) : null}
      {!recordsQuery.isLoading && !recordsQuery.error && visible.length > 0 ? (
        <div className="wf-list">
          {visible.map((record) => {
            const own = record.profile_id === appSession?.profile.id;
            const certificates = (certificatesQuery.data ?? []).filter(
              (document) => document.sick_leave_id === record.id,
            );
            return (
              <div key={record.id} className="page-stack">
                {has("data.correct") ? (
                  <button
                    type="button"
                    className="wf-secondary"
                    onClick={() => setCorrectionRecord(record)}
                  >
                    <Pencil size={16} /> Daten von{" "}
                    {record.profiles?.display_name ?? "Mitarbeiter/in"}{" "}
                    korrigieren
                  </button>
                ) : null}
                <SickRecordCard
                  record={record}
                  own={own}
                  certificates={certificates}
                  organizationId={appSession?.profile.organization_id ?? ""}
                  profileId={appSession?.profile.id ?? ""}
                  canViewCertificates={own || canViewCertificates}
                  canManage={canManage && !own}
                  onExtend={own ? () => setExtensionRecord(record) : undefined}
                  onStatus={(status) =>
                    updateStatus.mutate({ id: record.id, status })
                  }
                  statusPending={updateStatus.isPending}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {updateStatus.error ? (
        <MutationNotice kind="error">
          {humanizeError(
            updateStatus.error,
            "Der Bearbeitungsstatus konnte nicht gespeichert werden.",
          )}
        </MutationNotice>
      ) : null}
    </div>
  );
}

function SickExtensionForm({
  record,
  onClose,
}: {
  record: SickLeaveRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [endUnknown, setEndUnknown] = useState(record.end_unknown);
  const [expectedEndOn, setExpectedEndOn] = useState(
    record.expected_end_on ?? todayInputValue(),
  );
  const extend = useMutation({
    mutationFn: async () => {
      if (!endUnknown && !expectedEndOn) throw new Error("Enddatum fehlt");
      if (!endUnknown && expectedEndOn < record.starts_on)
        throw new Error("Enddatum ungültig");
      const { error } = await supabase.rpc("extend_sick_leave", {
        p_record_id: record.id,
        p_expected_end_on: endUnknown ? null : expectedEndOn,
        p_end_unknown: endUnknown,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sick-leave-records"] });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Abwesenheit verlängern"
      description={`Gemeldet seit ${format(parseISO(record.starts_on), "dd.MM.yyyy")}. Es wird weiterhin kein Krankheitsgrund erfasst.`}
      onClose={onClose}
    >
      <div className="wf-form">
        <label className="wf-field">
          <span>Neues voraussichtliches Ende</span>
          <input
            type="date"
            min={record.starts_on}
            value={expectedEndOn}
            disabled={endUnknown}
            onChange={(event) => setExpectedEndOn(event.target.value)}
          />
        </label>
        <label className="wf-checkbox">
          <input
            type="checkbox"
            checked={endUnknown}
            onChange={(event) => setEndUnknown(event.target.checked)}
          />
          <span>Das Enddatum ist weiterhin unbekannt.</span>
        </label>
        <MutationNotice kind="error">
          {extend.error
            ? extend.error.message === "Enddatum fehlt"
              ? "Bitte geben Sie ein Enddatum an."
              : extend.error.message === "Enddatum ungültig"
                ? "Das Enddatum darf nicht vor Beginn der Abwesenheit liegen."
                : humanizeError(
                    extend.error,
                    "Die Verlängerung konnte nicht gespeichert werden.",
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
            onClick={() => extend.mutate()}
            disabled={extend.isPending || (!endUnknown && !expectedEndOn)}
          >
            <CalendarDays size={18} />
            {extend.isPending ? "Wird gespeichert …" : "Verlängerung melden"}
          </button>
        </div>
      </div>
    </WorkflowPanel>
  );
}

function SickReportForm({
  profileId,
  organizationId,
  onClose,
  onSaved,
}: {
  profileId: string;
  organizationId: string;
  onClose: () => void;
  onSaved: (profileId: string) => void;
}) {
  const { has } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [partialSuccess, setPartialSuccess] = useState("");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SickFormValues>({
    resolver: zodResolver(sickSchema),
    defaultValues: {
      profileId: "",
      startsOn: todayInputValue(),
      expectedEndOn: "",
      endUnknown: false,
      certificatePlan: "not_required",
      privacyConfirmed: false,
    },
  });
  const endUnknown = useWatch({ control, name: "endUnknown" });
  const targetProfileId = useWatch({ control, name: "profileId" });
  const canUpload =
    Boolean(targetProfileId) &&
    (targetProfileId === profileId || has("sick_leave.view_certificates"));
  const report = useMutation({
    mutationFn: async (values: SickFormValues) => {
      const certificateFile = canUpload ? file : null;
      if (certificateFile) validateCertificate(certificateFile);
      const { data, error } = await supabase.rpc("report_sick_leave_for_user", {
        p_profile_id: values.profileId,
        p_starts_on: values.startsOn,
        p_expected_end_on: values.endUnknown
          ? null
          : values.expectedEndOn || null,
        p_end_unknown: values.endUnknown,
        p_certificate_status: certificateFile
          ? "pending"
          : values.certificatePlan,
      });
      if (error) throw error;
      const recordId = data as string;
      if (certificateFile) {
        try {
          await uploadCertificate({
            recordId,
            profileId,
            ownerProfileId: values.profileId,
            organizationId,
            file: certificateFile,
            version: 1,
          });
        } catch (uploadError) {
          return {
            recordId,
            warning: humanizeError(
              uploadError,
              "Die Meldung wurde gespeichert, das Attest aber nicht hochgeladen. Sie können es in der Historie nachreichen.",
            ),
          };
        }
      }
      return { recordId, warning: "" };
    },
    onSuccess: async (result, values) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sick-leave-records"] }),
        queryClient.invalidateQueries({
          queryKey: ["sick-leave-certificates"],
        }),
      ]);
      if (result.warning) setPartialSuccess(result.warning);
      else onSaved(values.profileId);
    },
  });
  const selectFile = (next: File | null) => {
    setFileError("");
    if (!next) return setFile(null);
    try {
      validateCertificate(next);
      setFile(next);
    } catch (error) {
      setFile(null);
      setFileError(
        error instanceof Error ? error.message : "Datei nicht zulässig.",
      );
    }
  };
  return (
    <WorkflowPanel
      title="Krankmeldung erfassen"
      description="Wählen Sie die betroffene Person. Erfassen Sie ausschließlich den Abwesenheitszeitraum und keine Diagnose."
      onClose={partialSuccess ? () => onSaved(targetProfileId) : onClose}
    >
      <form
        className="wf-form"
        onSubmit={handleSubmit((values) => report.mutate(values))}
        noValidate
      >
        <EmployeeSelect
          registration={{
            ...register("profileId"),
            onChange: async (event) => {
              setFile(null);
              setFileError("");
              await register("profileId").onChange(event);
            },
          }}
          error={errors.profileId?.message}
          disabled={report.isPending || Boolean(partialSuccess)}
        />
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Beginn</span>
            <input
              type="date"
              {...register("startsOn")}
              aria-invalid={Boolean(errors.startsOn)}
            />
            <FieldError>{errors.startsOn?.message}</FieldError>
          </label>
          <label className="wf-field">
            <span>Voraussichtliches Ende</span>
            <input
              type="date"
              {...register("expectedEndOn")}
              disabled={endUnknown}
              aria-invalid={Boolean(errors.expectedEndOn)}
            />
            <FieldError>{errors.expectedEndOn?.message}</FieldError>
          </label>
        </div>
        <label className="wf-checkbox">
          <input type="checkbox" {...register("endUnknown")} />
          <span>Das Enddatum ist noch nicht bekannt.</span>
        </label>
        <label className="wf-field">
          <span>Attest</span>
          <select {...register("certificatePlan")}>
            <option value="not_required">
              Derzeit kein Attest angekündigt
            </option>
            <option value="pending">Attest folgt</option>
          </select>
        </label>
        {canUpload ? (
          <label className="sick-upload">
            <FileUp />
            <span>
              <strong>
                {file ? file.name : "Attest direkt hochladen (optional)"}
              </strong>
              <small>PDF, JPG oder PNG · maximal 10 MB</small>
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}
        <FieldError>{fileError}</FieldError>
        <label className="wf-checkbox sick-confirm">
          <input
            type="checkbox"
            {...register("privacyConfirmed")}
            aria-invalid={Boolean(errors.privacyConfirmed)}
          />
          <span>
            Ich bestätige, dass die Datei keine Patientendaten enthält und
            ausschließlich zur Krankmeldung der ausgewählten Person gehört.
          </span>
        </label>
        <FieldError>{errors.privacyConfirmed?.message}</FieldError>
        <MutationNotice kind="error">
          {report.error
            ? humanizeError(
                report.error,
                "Die Krankmeldung konnte nicht gespeichert werden.",
              )
            : null}
        </MutationNotice>
        <MutationNotice kind="info">{partialSuccess}</MutationNotice>
        <div className="wf-form-actions">
          <button
            type="button"
            className="wf-secondary"
            onClick={partialSuccess ? () => onSaved(targetProfileId) : onClose}
          >
            {partialSuccess ? "Zur gespeicherten Meldung" : "Abbrechen"}
          </button>
          {!partialSuccess ? (
            <button
              type="submit"
              className="wf-primary"
              disabled={report.isPending}
            >
              <ShieldCheck size={18} />
              {report.isPending
                ? "Wird sicher gespeichert …"
                : "Krankmeldung speichern"}
            </button>
          ) : null}
        </div>
      </form>
    </WorkflowPanel>
  );
}

function SickRecordCard({
  record,
  own,
  certificates,
  organizationId,
  profileId,
  canViewCertificates,
  canManage,
  onExtend,
  onStatus,
  statusPending,
}: {
  record: SickLeaveRecord;
  own: boolean;
  certificates: CertificateVersion[];
  organizationId: string;
  profileId: string;
  canViewCertificates: boolean;
  canManage: boolean;
  onExtend?: () => void;
  onStatus: (status: SickStatus) => void;
  statusPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [followUp, setFollowUp] = useState<File | null>(null);
  const [localError, setLocalError] = useState("");
  const upload = useMutation({
    mutationFn: async () => {
      if (!followUp) throw new Error("Bitte eine Datei auswählen.");
      await uploadCertificate({
        recordId: record.id,
        profileId,
        ownerProfileId: record.profile_id,
        organizationId,
        file: followUp,
        version:
          Math.max(0, ...certificates.map((document) => document.version)) + 1,
      });
    },
    onSuccess: async () => {
      setFollowUp(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["sick-leave-certificates"],
        }),
        queryClient.invalidateQueries({ queryKey: ["sick-leave-records"] }),
      ]);
    },
  });
  const download = useMutation({
    mutationFn: async (document: CertificateVersion) => {
      const { data, error } = await supabase.functions.invoke<{
        signedUrl: string;
      }>("create-secure-download", {
        body: { bucket: "sick-certificates", path: document.storage_path },
      });
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Sicherer Download-Link fehlt");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    },
  });
  const meta = statusMeta[record.status] ?? statusMeta.reported;
  return (
    <article className="wf-list-card sick-card">
      <div className="wf-list-card-heading">
        <div>
          <h3>
            {own
              ? "Meine Krankmeldung"
              : (record.profiles?.display_name ?? "Mitarbeiter/in abwesend")}
          </h3>
          <p>
            {record.end_unknown
              ? "Enddatum derzeit offen"
              : `Voraussichtlich bis ${record.expected_end_on ? format(parseISO(record.expected_end_on), "dd.MM.yyyy") : "–"}`}
          </p>
        </div>
        <StatusPill label={meta.label} tone={meta.tone} />
      </div>
      <div className="wf-meta">
        <span>
          <CalendarDays />
          Beginn: {format(parseISO(record.starts_on), "dd.MM.yyyy")}
        </span>
        <span>
          <Check />
          Gemeldet am{" "}
          {format(new Date(record.created_at), "dd.MM.yyyy · HH:mm", {
            locale: de,
          })}
        </span>
      </div>
      {canViewCertificates ? (
        <section className="sick-certificates">
          <header>
            <FileCheck2 />
            <div>
              <strong>Attestarchiv</strong>
              <span>
                {record.certificate_status
                  ? (certificateLabels[record.certificate_status] ??
                    "Status wird geprüft")
                  : "Atteststatus geschützt"}{" "}
                · {certificates.length}{" "}
                {certificates.length === 1 ? "Version" : "Versionen"}
              </span>
            </div>
          </header>
          {certificates.length > 0 ? (
            <div className="sick-version-list">
              {certificates.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => download.mutate(document)}
                  disabled={download.isPending}
                >
                  <Download size={16} />
                  Version {document.version} ·{" "}
                  {format(new Date(document.created_at), "dd.MM.yyyy")}
                </button>
              ))}
            </div>
          ) : null}
          {(own || canManage) &&
          record.status !== "closed" &&
          record.status !== "cancelled" ? (
            <div className="sick-follow-up">
              <input
                type="file"
                aria-label="Folgeattest auswählen"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => {
                  setLocalError("");
                  const next = event.target.files?.[0] ?? null;
                  if (next) {
                    try {
                      validateCertificate(next);
                      setFollowUp(next);
                    } catch (error) {
                      setFollowUp(null);
                      setLocalError(
                        error instanceof Error
                          ? error.message
                          : "Datei nicht zulässig.",
                      );
                    }
                  }
                }}
              />
              <button
                type="button"
                className="wf-secondary"
                onClick={() => upload.mutate()}
                disabled={!followUp || upload.isPending}
              >
                <FileUp size={16} />
                {certificates.length
                  ? "Folgeattest hochladen"
                  : "Attest hochladen"}
              </button>
            </div>
          ) : null}
          <MutationNotice kind="error">
            {localError ||
              (upload.error
                ? humanizeError(
                    upload.error,
                    "Das Attest konnte nicht hochgeladen werden.",
                  )
                : "") ||
              (download.error
                ? humanizeError(
                    download.error,
                    "Das Attest konnte nicht geöffnet werden.",
                  )
                : "")}
          </MutationNotice>
        </section>
      ) : (
        <div className="sick-neutral-note">
          <LockKeyhole size={17} />
          Attestinformationen sind für diese Rolle nicht sichtbar.
        </div>
      )}
      {(onExtend &&
        record.status !== "closed" &&
        record.status !== "cancelled") ||
      (canManage &&
        record.status !== "closed" &&
        record.status !== "cancelled") ? (
        <div className="wf-card-actions">
          {onExtend ? (
            <button type="button" className="wf-secondary" onClick={onExtend}>
              <CalendarDays size={17} /> Verlängerung melden
            </button>
          ) : null}
          {canManage && record.status === "reported" ? (
            <button
              type="button"
              className="wf-secondary"
              onClick={() => onStatus("confirmed")}
              disabled={statusPending}
            >
              <Check size={17} /> Eingang bestätigen
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="wf-quiet"
              onClick={() => onStatus("closed")}
              disabled={statusPending}
            >
              Abwesenheit beenden
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function SickLeaveAdminPage() {
  return <SickLeavePage />;
}

function SickCorrectionForm({
  record,
  onClose,
}: {
  record: SickLeaveRecord;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [startsOn, setStartsOn] = useState(record.starts_on);
  const [endsOn, setEndsOn] = useState(record.expected_end_on ?? "");
  const [endUnknown, setEndUnknown] = useState(record.end_unknown);
  const [certificateStatus, setCertificateStatus] = useState(
    record.certificate_status ?? "not_required",
  );
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("correct_sick_leave_record", {
        p_record_id: record.id,
        p_starts_on: startsOn,
        p_expected_end_on: endUnknown ? null : endsOn,
        p_end_unknown: endUnknown,
        p_certificate_status: certificateStatus,
        p_correction_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["sick-leave-records"] });
      onClose();
    },
  });
  return (
    <WorkflowPanel
      title="Krankmeldung korrigieren"
      description="Person, Bearbeitungsstatus und Attestdateien bleiben erhalten. Korrekturen werden protokolliert. Bitte keine Diagnose eintragen."
      onClose={onClose}
    >
      <form
        className="wf-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <p>
          <strong>Mitarbeiter/in:</strong>{" "}
          {record.profiles?.display_name ?? "Bestehende Person"}
        </p>
        <div className="wf-form-grid">
          <label className="wf-field">
            <span>Beginn</span>
            <input
              type="date"
              value={startsOn}
              required
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </label>
          <label className="wf-field">
            <span>Voraussichtliches Ende</span>
            <input
              type="date"
              value={endsOn}
              required={!endUnknown}
              disabled={endUnknown}
              min={startsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </label>
          <label className="wf-checkbox">
            <input
              type="checkbox"
              checked={endUnknown}
              onChange={(event) => setEndUnknown(event.target.checked)}
            />
            <span>Ende noch unbekannt</span>
          </label>
          <label className="wf-field">
            <span>Atteststatus</span>
            <select
              value={certificateStatus}
              onChange={(event) => setCertificateStatus(event.target.value)}
            >
              {Object.entries(certificateLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="wf-field">
          <span>Korrekturgrund (ohne Diagnose)</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            required
          />
        </label>
        <MutationNotice kind="error">
          {save.error
            ? humanizeError(
                save.error,
                "Die Korrektur konnte nicht gespeichert werden. Prüfen Sie Zeitraum und Atteststatus.",
              )
            : null}
        </MutationNotice>
        <div className="wf-form-actions">
          <button
            type="submit"
            className="wf-primary"
            disabled={save.isPending || reason.trim().length < 3}
          >
            {save.isPending ? "Wird gespeichert …" : "Korrektur speichern"}
          </button>
        </div>
      </form>
    </WorkflowPanel>
  );
}
