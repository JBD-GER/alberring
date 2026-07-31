import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  File,
  FileText,
  FolderPlus,
  LockKeyhole,
  FolderOpen,
  Plus,
  Search,
  UploadCloud,
} from "lucide-react";
import { format } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fileAllowed } from "../../lib/validation";
import { useAuth } from "../auth/AuthProvider";
type DocumentRow = {
  id: string;
  title: string;
  visibility: "organization" | "team" | "personal";
  created_at: string;
  owner_profile_id: string | null;
  document_folders: { id: string; name: string } | null;
  document_versions: Array<{
    id: string;
    version: number;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
  }>;
};
type FolderRow = { id: string; name: string; scope: "organization" | "personal" | "role" };
type SickDocumentRow = {
  id: string;
  storage_path: string;
  version: number;
  created_at: string;
  original_name: string;
  sick_leave_records: { profile_id: string; starts_on: string; profiles: { display_name: string } | null } | null;
};
const humanSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function Documents() {
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [upload, setUpload] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | "sick" | null>(null);
  const canUpload = has("documents.view_own") || has("documents.manage");
  const { data: folders = [] } = useQuery({
    queryKey: ["document-folders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_folders").select("id,name,scope").is("archived_at", null).order("name");
      if (error) throw error;
      return data as FolderRow[];
    },
  });
  const { data: sickDocuments = [] } = useQuery({
    queryKey: ["my-sick-documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sick_leave_document_versions")
        .select("id,storage_path,version,created_at,original_name,sick_leave_records!inner(profile_id,starts_on,profiles(display_name))")
        .eq("sick_leave_records.profile_id", appSession!.profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SickDocumentRow[];
    }, enabled: Boolean(appSession),
  });
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id,title,visibility,created_at,owner_profile_id,document_folders(id,name),document_versions(id,version,storage_path,mime_type,size_bytes,created_at)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DocumentRow[];
    },
  });
  const download = useMutation({
    mutationFn: async ({ path, bucket = "documents" }: { path: string; bucket?: "documents" | "sick-certificates" }) => {
      const { data, error } = await supabase.functions.invoke(
        "create-secure-download",
        { body: { bucket, path } },
      );
      if (error) throw error;
      if (!data?.signedUrl)
        throw new Error(data?.error?.message ?? "Download nicht verfügbar.");
      location.assign(data.signedUrl);
    },
  });
  const filtered = data.filter((d) =>
    (activeFolder === null || (activeFolder !== "sick" && d.document_folders?.id === activeFolder)) &&
    d.title.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de")),
  );
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2>Dokumente</h2>
          <p>Freigegebene und persönliche Unterlagen.</p>
        </div>
        {canUpload && (
          <button
            className="primary compact"
            onClick={() => setUpload((v) => !v)}
          >
            <Plus /> Dokument hochladen
          </button>
        )}
      </section>
      <div className="document-folder-grid">
        <button className={`document-folder ${activeFolder === null ? "active" : ""}`} onClick={() => setActiveFolder(null)}>
          <FolderOpen /><strong>Alle Dokumente</strong><span>{data.length} Dateien</span>
        </button>
        <button className={`document-folder protected ${activeFolder === "sick" ? "active" : ""}`} onClick={() => setActiveFolder("sick")}>
          <LockKeyhole /><strong>Krankmeldungen</strong><span>{sickDocuments.length} eigene Atteste</span>
        </button>
        {folders.map((folder) => (
          <button key={folder.id} className={`document-folder ${activeFolder === folder.id ? "active" : ""}`} onClick={() => setActiveFolder(folder.id)}>
            <FolderOpen /><strong>{folder.name}</strong><span>{folder.scope === "personal" ? "Nur für mich" : folder.scope === "role" ? "Durch Rolle vorgegeben" : "Allgemein"}</span>
          </button>
        ))}
        <button className="document-folder add" onClick={() => setFolderOpen((value) => !value)}>
          <FolderPlus /><strong>Ordner anlegen</strong><span>Privat oder als Admin vorgeben</span>
        </button>
      </div>
      {folderOpen && <FolderForm onDone={() => { setFolderOpen(false); void client.invalidateQueries({ queryKey: ["document-folders"] }); }} />}
      {upload && (
        <DocumentUpload
          onDone={() => {
            setUpload(false);
            void client.invalidateQueries({ queryKey: ["documents"] });
          }}
        />
      )}
      <label className="search">
        <Search />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Dokumente durchsuchen …"
          aria-label="Dokumente durchsuchen"
        />
      </label>
      {download.error && (
        <div className="alert error">
          Dokument konnte nicht sicher abgerufen werden.
        </div>
      )}
      {activeFolder === "sick" ? (
        <div className="document-list">
          {sickDocuments.length === 0 ? <section className="empty"><h3>Keine Atteste vorhanden</h3><p>Eigene Atteste aus Krankmeldungen erscheinen hier automatisch.</p></section> : sickDocuments.map((document) => {
            const employee = document.sick_leave_records?.profiles?.display_name ?? "Eigener Upload";
            return <article className="document-row" key={document.id}>
              <span className="file-icon"><FileText /></span><div><h3>{employee} – {document.original_name}</h3><p>Krankmeldung vom {document.sick_leave_records?.starts_on ? format(new Date(`${document.sick_leave_records.starts_on}T00:00:00`), "dd.MM.yyyy") : "–"}</p><small>Attest-Version {document.version} · {format(new Date(document.created_at), "dd.MM.yyyy")}</small></div>
              <span className="status info">Privat</span><button className="icon-button" onClick={() => download.mutate({ path: document.storage_path, bucket: "sick-certificates" })} aria-label="Attest herunterladen"><Download /></button>
            </article>;
          })}
        </div>
      ) : isLoading ? (
        <div className="skeleton-list">
          <span />
          <span />
          <span />
        </div>
      ) : error ? (
        <section className="empty">
          <h3>Dokumente nicht verfügbar</h3>
          <p>Bitte versuchen Sie es erneut.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty">
          <div className="empty-icon">
            <FolderOpen />
          </div>
          <h3>Keine Dokumente vorhanden</h3>
          <p>Für Sie freigegebene Dokumente erscheinen hier.</p>
        </section>
      ) : (
        <div className="document-list">
          {filtered.map((doc) => {
            const version = [...doc.document_versions].sort(
              (a, b) => b.version - a.version,
            )[0];
            return (
              <article className="document-row" key={doc.id}>
                <span className="file-icon">
                  <FileText />
                </span>
                <div>
                  <h3>
                    <Link to={`/app/documents/${doc.id}`}>{doc.title}</Link>
                  </h3>
                  <p>
                    {doc.document_folders?.name ??
                      (doc.visibility === "personal"
                        ? "Persönliche Dokumente"
                        : "Allgemeine Dokumente")}
                  </p>
                  {version && (
                    <small>
                      Version {version.version} ·{" "}
                      {humanSize(version.size_bytes)} ·{" "}
                      {format(new Date(version.created_at), "dd.MM.yyyy")}
                    </small>
                  )}
                </div>
                <span className="status info">
                  {doc.visibility === "personal"
                    ? "Persönlich"
                    : doc.visibility === "team"
                      ? "Team"
                      : "Organisation"}
                </span>
                {version && (
                  <button
                    className="icon-button"
                    onClick={() => download.mutate({ path: version.storage_path })}
                    aria-label={`${doc.title} herunterladen`}
                  >
                    <Download />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FolderForm({ onDone }: { onDone: () => void }) {
  const { has } = useAuth();
  const canManageFolders = has("documents.manage_folders");
  const [scope, setScope] = useState<"personal" | "role" | "organization">("personal");
  const [error, setError] = useState("");
  const { data: roles = [] } = useQuery({
    queryKey: ["document-folder-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id,name").eq("active", true).order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: canManageFolders,
  });
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const { error } = await supabase.rpc("create_document_folder", {
        p_name: String(fd.get("name") ?? "").trim(), p_scope: scope,
        p_role_id: scope === "role" ? String(fd.get("roleId") ?? "") || null : null,
      });
      if (error) throw error;
    },
    onSuccess: onDone,
    onError: (value) => setError(value instanceof Error ? value.message : "Ordner konnte nicht angelegt werden."),
  });
  return <section className="editor-card"><form className="form two-column" onSubmit={(event) => { event.preventDefault(); create.mutate(event.currentTarget); }}>
    <label>Ordnername<input name="name" required maxLength={120} /></label>
    <label>Sichtbarkeit<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
      <option value="personal">Nur für mich</option>
      {canManageFolders && <option value="role">Für eine Rolle vorgeben</option>}
      {canManageFolders && <option value="organization">Für alle vorgeben</option>}
    </select></label>
    {scope === "role" && <label className="full">Rolle<select name="roleId" required><option value="">Bitte auswählen</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}
    {error && <div className="alert error full">{error}</div>}
    <div className="form-actions full"><button type="button" className="secondary" onClick={onDone}>Abbrechen</button><button className="primary" disabled={create.isPending}>Ordner anlegen</button></div>
  </form></section>;
}

function DocumentUpload({ onDone }: { onDone: () => void }) {
  const { appSession, has } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const canManage = has("documents.manage");
  const [visibility, setVisibility] = useState(canManage ? "organization" : "personal");
  const { data: teams = [] } = useQuery({
    queryKey: ["document-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });
  const { data: folders = [] } = useQuery({
    queryKey: ["document-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_folders")
        .select("id,name")
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["document-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_categories")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });
  const upload = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!appSession || !file) throw new Error("Bitte eine Datei auswählen.");
      if (
        !fileAllowed(file, ["application/pdf", "image/jpeg", "image/png"], 20)
      )
        throw new Error("Erlaubt sind PDF, JPG und PNG bis 20 MB.");
      const fd = new FormData(form),
        title = String(fd.get("title")).trim(),
        teamId = String(fd.get("teamId") ?? "");
      if (!title) throw new Error("Titel fehlt.");
      if (visibility === "team" && !teamId)
        throw new Error("Bitte ein Team auswählen.");
      let folderId = String(fd.get("folderId") ?? "");
      const newFolder = String(fd.get("newFolder") ?? "").trim();
      if (newFolder) {
        const { data: folder, error: folderError } = await supabase.rpc("create_document_folder", { p_name: newFolder, p_scope: "personal", p_role_id: null });
        if (folderError) throw folderError;
        folderId = folder as string;
      }
      const { data: documentId, error: createError } = visibility === "personal" && !canManage
        ? await supabase.rpc("create_personal_document_upload", { p_title: title, p_folder_id: folderId || null, p_category_id: String(fd.get("categoryId") ?? "") || null })
        : await supabase.rpc("create_document_upload", {
          p_title: title,
          p_visibility: visibility,
          p_team_id: teamId || null,
          p_folder_id: folderId || null,
          p_category_id: String(fd.get("categoryId") ?? "") || null,
          p_ack_required: fd.get("ackRequired") === "on",
        });
      if (createError) throw createError;
      const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "bin",
        path = `${appSession.profile.organization_id}/${documentId}/1/${crypto.randomUUID()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (storageError) {
        await supabase.from("documents").delete().eq("id", documentId);
        throw storageError;
      }
      const { error: versionError } = await supabase.rpc(
        "add_document_version",
        {
          p_document_id: documentId,
          p_storage_path: path,
          p_mime_type: file.type,
          p_size_bytes: file.size,
          p_original_name: file.name
            .replace(/[^\p{L}\p{N}._ -]/gu, "_")
            .slice(0, 180),
          p_change_note: "Erstveröffentlichung",
        },
      );
      if (versionError) {
        await supabase.storage.from("documents").remove([path]);
        await supabase.from("documents").delete().eq("id", documentId);
        throw versionError;
      }
      const { error: finalizeError } = await supabase.rpc(
        "finalize_document_upload",
        { p_document_id: documentId },
      );
      if (finalizeError) {
        await supabase.storage.from("documents").remove([path]);
        await supabase.from("documents").delete().eq("id", documentId);
        throw finalizeError;
      }
    },
    onSuccess: onDone,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen."),
  });
  return (
    <section className="editor-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">DOKUMENTE</span>
          <h2>Dokument hochladen</h2>
        </div>
        <button className="icon-button" onClick={onDone} aria-label="Schließen">
          ×
        </button>
      </div>
      <form
        className="form two-column"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate(e.currentTarget);
        }}
      >
        <label>
          Titel
          <input name="title" required maxLength={160} />
        </label>
        <label>
          Sichtbarkeit
          <select
            name="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            {canManage && <option value="organization">Gesamte Organisation</option>}
            {canManage && <option value="team">Team</option>}
            <option value="personal">Nur persönlich</option>
          </select>
        </label>
        {visibility === "team" && (
          <label className="full">
            Zielteam
            <select name="teamId" required>
              <option value="">Bitte auswählen</option>
              {teams.map((team) => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Ordner
          <select name="folderId">
            <option value="">Ohne Ordner</option>
            {folders.map((folder) => (
              <option value={folder.id} key={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Neuen Ordner anlegen (optional)
          <input name="newFolder" maxLength={120} />
        </label>
        <label>
          Kategorie
          <select name="categoryId">
            <option value="">Keine Kategorie</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="ackRequired" /> Lesebestätigung
          erforderlich
        </label>
        <label className="file-drop full">
          <UploadCloud />
          <span>{file ? file.name : "PDF, JPG oder PNG auswählen"}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        {error && <div className="alert error full">{error}</div>}
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={onDone}>
            Abbrechen
          </button>
          <button className="primary" disabled={upload.isPending}>
            <File />{" "}
            {upload.isPending ? "Wird hochgeladen …" : "Sicher hochladen"}
          </button>
        </div>
      </form>
    </section>
  );
}

type DocumentDetailRow = DocumentRow & {
  acknowledgement_required: boolean;
  document_acknowledgements: Array<{
    acknowledged_at: string;
    profile_id: string;
    profiles: { display_name: string } | null;
  }>;
};
export function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { appSession, has } = useAuth();
  const client = useQueryClient();
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [showAcknowledgements, setShowAcknowledgements] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id,title,visibility,created_at,owner_profile_id,acknowledgement_required,document_folders(id,name),document_versions(id,version,storage_path,mime_type,size_bytes,created_at),document_acknowledgements(acknowledged_at,profile_id,profiles(display_name))",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as DocumentDetailRow;
    },
    enabled: Boolean(id),
  });
  const download = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.functions.invoke(
        "create-secure-download",
        { body: { bucket: "documents", path } },
      );
      if (error || !data?.signedUrl)
        throw error ?? new Error("Download nicht verfügbar");
      location.assign(data.signedUrl);
    },
  });
  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!appSession || !id) throw new Error();
      const versions = data?.document_versions ?? [],
        current = [...versions].sort((a, b) => b.version - a.version)[0];
      const { error } = await supabase.from("document_acknowledgements").upsert(
        {
          organization_id: appSession.profile.organization_id,
          document_id: id,
          profile_id: appSession.profile.id,
          version_id: current?.id ?? null,
          acknowledged_at: new Date().toISOString(),
        },
        { onConflict: "document_id,profile_id" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["document", id] }),
  });
  const addVersion = useMutation({
    mutationFn: async () => {
      if (!appSession || !id || !versionFile)
        throw new Error("Bitte eine Datei auswählen.");
      if (
        !fileAllowed(
          versionFile,
          ["application/pdf", "image/jpeg", "image/png"],
          20,
        )
      )
        throw new Error("Erlaubt sind PDF, JPG und PNG bis 20 MB.");
      const nextVersion =
        Math.max(
          0,
          ...(data?.document_versions ?? []).map((item) => item.version),
        ) + 1;
      const ext =
        versionFile.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${appSession.profile.organization_id}/${id}/${nextVersion}/${crypto.randomUUID()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(path, versionFile, {
          contentType: versionFile.type,
          upsert: false,
        });
      if (storageError) throw storageError;
      const { error } = await supabase.rpc("add_document_version", {
        p_document_id: id,
        p_storage_path: path,
        p_original_name: versionFile.name
          .replace(/[^\p{L}\p{N}._ -]/gu, "_")
          .slice(0, 180),
        p_mime_type: versionFile.type,
        p_size_bytes: versionFile.size,
        p_change_note: changeNote.trim() || null,
      });
      if (error) {
        await supabase.storage.from("documents").remove([path]);
        throw error;
      }
    },
    onSuccess: async () => {
      setVersionFile(null);
      setChangeNote("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["document", id] }),
        client.invalidateQueries({ queryKey: ["documents"] }),
      ]);
    },
  });
  const archive = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Dokument fehlt.");
      const { error } = await supabase.rpc("archive_document", {
        p_document_id: id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["documents"] });
      navigate("/app/documents", { replace: true });
    },
  });
  if (isLoading)
    return (
      <div className="skeleton-list">
        <span />
        <span />
      </div>
    );
  if (error || !data)
    return (
      <section className="empty">
        <h2>Dokument nicht verfügbar</h2>
        <p>Es wurde nicht gefunden oder ist für Sie nicht freigegeben.</p>
      </section>
    );
  const versions = [...data.document_versions].sort(
      (a, b) => b.version - a.version,
    ),
    acknowledged = data.document_acknowledgements.some(
      (a) => a.profile_id === appSession?.profile.id,
    );
  return (
    <div className="page-stack">
      <Link to="/app/documents" className="back-link">
        ← Zurück zu Dokumenten
      </Link>
      <section className="news-detail document-detail">
        <header>
          <span className="status info">
            {data.visibility === "personal"
              ? "Persönlich"
              : data.visibility === "team"
                ? "Team"
                : "Organisation"}
          </span>
          <h2>{data.title}</h2>
          <p className="lead">
            {data.document_folders?.name ?? "Dokumentenablage"} ·{" "}
            {versions.length} {versions.length === 1 ? "Version" : "Versionen"}
          </p>
        </header>
        <div className="version-list">
          {versions.map((version) => (
            <article key={version.id}>
              <div>
                <strong>Version {version.version}</strong>
                <small>
                  {format(new Date(version.created_at), "dd.MM.yyyy")} ·{" "}
                  {humanSize(version.size_bytes)}
                </small>
              </div>
              <button
                className="secondary"
                onClick={() => download.mutate(version.storage_path)}
              >
                <Download /> Öffnen
              </button>
            </article>
          ))}
        </div>
        {has("documents.manage") && (
          <section className="document-version-upload">
            <div>
              <strong>Neue Version bereitstellen</strong>
              <p>
                Die bisherige Version bleibt revisionssicher erhalten; offene
                Lesebestätigungen beginnen für die neue Version erneut.
              </p>
            </div>
            <label className="file-drop">
              <UploadCloud />
              <span>
                {versionFile ? versionFile.name : "PDF, JPG oder PNG auswählen"}
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                  setVersionFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label>
              Änderungshinweis (optional)
              <input
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                maxLength={500}
              />
            </label>
            <div className="form-actions">
              <button
                className="primary"
                onClick={() => addVersion.mutate()}
                disabled={!versionFile || addVersion.isPending}
              >
                <UploadCloud /> Neue Version hochladen
              </button>
              <button
                className="secondary"
                onClick={() =>
                  window.confirm("Dokument wirklich archivieren?") &&
                  archive.mutate()
                }
                disabled={archive.isPending}
              >
                <Archive /> Archivieren
              </button>
            </div>
          </section>
        )}
        {data.acknowledgement_required && (
          <footer className="ack-box">
            {acknowledged ? (
              <div className="ack-done">Gelesen bestätigt</div>
            ) : (
              <>
                <p>
                  Bitte bestätigen Sie, dass Sie die aktuelle Version gelesen
                  haben.
                </p>
                <button
                  className="primary"
                  onClick={() => acknowledge.mutate()}
                  disabled={acknowledge.isPending}
                >
                  Als gelesen bestätigen
                </button>
              </>
            )}
            {has("documents.view_acknowledgements") && (
              <div className="ack-review">
                <button type="button" className="secondary" onClick={() => setShowAcknowledgements((value) => !value)}>
                  {data.document_acknowledgements.length} Bestätigungen anzeigen
                </button>
                {showAcknowledgements && <div className="ack-person-list">
                  {data.document_acknowledgements.length === 0 ? <p>Noch keine Bestätigung.</p> : data.document_acknowledgements.map((item) => (
                    <div key={item.profile_id}><strong>{item.profiles?.display_name ?? "Mitarbeiter/in"}</strong><span>{format(new Date(item.acknowledged_at), "dd.MM.yyyy · HH:mm")}</span></div>
                  ))}
                </div>}
              </div>
            )}
          </footer>
        )}
        {(download.error ||
          acknowledge.error ||
          addVersion.error ||
          archive.error) && (
          <div className="alert error">
            {addVersion.error instanceof Error
              ? addVersion.error.message
              : "Aktion konnte nicht abgeschlossen werden."}
          </div>
        )}
      </section>
    </div>
  );
}
