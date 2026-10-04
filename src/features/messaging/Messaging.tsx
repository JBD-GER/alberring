import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Download,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Pin,
  RefreshCw,
  Search,
  Send,
  SmilePlus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { MessageSafetyActions, safetyError } from "../safety/Safety";
import { Link, useNavigate, useParams } from "react-router";
import { format, isToday, isYesterday } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "../../lib/supabase";
import { fileAllowed } from "../../lib/validation";
import {
  AudioPreview,
  ChatDeviceActions,
} from "../../components/common/DeviceActions";
import { messageMimeTypes } from "../../services/platform/audio";
import { uploadPrivateFile } from "../../services/platform/uploads";
import { UploadProgress } from "../../components/common/UploadProgress";
import { useAuth } from "../auth/AuthProvider";

type Conversation = {
  id: string;
  type: "direct" | "group" | "team" | "announcement";
  name: string | null;
  avatar_path?: string | null;
  created_by?: string;
  team_id?: string | null;
  can_manage?: boolean;
  created_at: string;
  updated_at?: string;
  unread_count?: number;
  muted_until?: string | null;
  conversation_members: Array<{
    profile_id: string;
    profiles: { display_name: string } | null;
  }>;
  messages?: Array<{
    body: string;
    created_at: string;
    sender_id: string;
    retracted_at?: string | null;
  }>;
};
type Attachment = {
  id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};
type Reaction = { emoji: string; profile_id: string };
type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  edited_at: string | null;
  retracted_at: string | null;
  reply_to_id: string | null;
  reply: {
    id: string;
    body: string;
    sender_id: string;
    profiles: { display_name: string } | null;
  } | null;
  profiles: { display_name: string; avatar_url: string | null } | null;
  message_attachments: Attachment[];
  message_reactions: Reaction[];
  message_read_receipts: Array<{ profile_id: string; read_at: string }>;
  conversation_pins: Array<{ pinned_by: string }>;
};
type MessageWithoutReply = Omit<Message, "reply">;
type ReplyMessage = NonNullable<Message["reply"]>;
type ConversationPerson = {
  id: string;
  display_name: string;
  teams: Array<{ id: string; name: string }>;
};
const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const actionErrorMessage = (error: unknown, fallback: string) => {
  if (
    !error ||
    typeof error !== "object" ||
    !("message" in error) ||
    typeof error.message !== "string"
  )
    return fallback;
  const messages: Record<string, string> = {
    permission_denied:
      "Sie können diesen Chat nicht mehr verwalten. Bitte öffnen Sie die Chatdetails erneut.",
    conversation_manager_required:
      "Die verwaltende Person muss Mitglied des Chats bleiben.",
    conversation_requires_members: "Bitte mindestens ein Mitglied auswählen.",
    member_not_available:
      "Eine ausgewählte Person ist nicht mehr verfügbar. Bitte öffnen Sie die Chatdetails erneut.",
    invalid_member_selection:
      "Die Auswahl konnte nicht gespeichert werden. Bitte wählen Sie die Mitglieder erneut aus.",
    avatar_not_available:
      "Das Gruppenbild ist nicht verfügbar. Bitte laden Sie es erneut hoch.",
  };
  return messages[error.message] ?? fallback;
};
const conversationTitle = (c: Conversation, me?: string) =>
  c.type === "direct"
    ? (c.conversation_members.find((m) => m.profile_id !== me)?.profiles
        ?.display_name ?? "Direktnachricht")
    : (c.name ?? "Unterhaltung");
const stamp = (value: string) => {
  const date = new Date(value);
  return isToday(date)
    ? format(date, "HH:mm")
    : isYesterday(date)
      ? `Gestern · ${format(date, "HH:mm")}`
      : format(date, "dd.MM. · HH:mm", { locale: de });
};
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", {
    maximumFractionDigits: 1,
  })} MB`;
};
const conversationLabel = (conversation: Conversation) => {
  if (conversation.type === "direct") return "Direktchat";
  if (conversation.type === "announcement") return "Ankündigungen";
  if (conversation.type === "team") return "Team";
  return "Gruppe";
};
const conversationPreview = (conversation: Conversation) => {
  const latest = conversation.messages?.[0];
  if (latest?.retracted_at) return "Nachricht zurückgezogen";
  const body = latest?.body;
  if (!body) return "Noch keine Nachrichten";
  return body === "Anhang" ? "📎 Anhang" : body;
};

export function ConversationList() {
  const { appSession, has } = useAuth();
  const nav = useNavigate();
  const client = useQueryClient();
  const [filter, setFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [conversationType, setConversationType] = useState<
    "group" | "team" | "announcement"
  >("group");
  const [teamId, setTeamId] = useState("");
  const {
    data = [],
    isLoading,
    error,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_conversations");
      if (error) throw error;
      return data as unknown as Conversation[];
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel("conversation-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void client.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members" },
        () => void client.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void client.invalidateQueries({ queryKey: ["conversations"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client]);
  const { data: people = [] } = useQuery({
    queryKey: ["conversation-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory_entries", {
        p_search: null,
      });
      if (error) throw error;
      return data as Array<{
        id: string;
        display_name: string;
        teams: Array<{ id: string; name: string }>;
      }>;
    },
    enabled: groupOpen,
  });
  const { data: teams = [] } = useQuery({
    queryKey: ["conversation-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name,lead_profile_id")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        lead_profile_id: string | null;
      }>;
    },
    enabled: groupOpen,
  });
  const createGroup = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const type = String(fd.get("type")) as "group" | "team" | "announcement";
      const selectedTeamId = String(fd.get("teamId") ?? "");
      const members =
        type === "group"
          ? fd.getAll("members").map(String)
          : type === "team"
            ? people
                .filter((person) =>
                  person.teams.some((team) => team.id === selectedTeamId),
                )
                .map((person) => person.id)
            : people.map((person) => person.id);
      if (type === "group" && members.length < 1)
        throw new Error("Bitte mindestens eine weitere Person auswählen.");
      if (type === "team" && !selectedTeamId)
        throw new Error("Bitte ein Team auswählen.");
      const { data, error } = await supabase.rpc("create_group_conversation", {
        p_name: String(fd.get("name")).trim(),
        p_member_ids: members,
        p_type: type,
        p_team_id: type === "team" ? selectedTeamId : null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      setGroupOpen(false);
      void client.invalidateQueries({ queryKey: ["conversations"] });
      nav(`/app/messages/${id}`);
    },
  });
  const shown = data.filter(
    (c) =>
      conversationTitle(c, appSession?.profile.id)
        .toLocaleLowerCase("de")
        .includes(filter.toLocaleLowerCase("de")) &&
      (!unreadOnly || Number(c.unread_count ?? 0) > 0),
  );
  const eligibleTeams = teams.filter(
    (team) =>
      has("teams.manage") || team.lead_profile_id === appSession?.profile.id,
  );
  return (
    <div className="page-stack messages-page">
      <section className="page-intro messages-page-intro">
        <div>
          <span className="eyebrow">SICHER IM TEAM ABSTIMMEN</span>
          <h2>Chats</h2>
          <p>Direkt, übersichtlich und nah am Pflegealltag.</p>
        </div>
        <div className="header-actions">
          <Link className="secondary compact" to="/app/directory">
            <MessageCircle /> Neuer Chat
          </Link>
          <button
            className="primary compact"
            onClick={() => setGroupOpen((v) => !v)}
          >
            <Plus /> Neue Gruppe
          </button>
        </div>
      </section>
      {groupOpen && (
        <div
          className="messaging-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setGroupOpen(false);
          }}
        >
          <section
            className="editor-card messaging-group-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-conversation-title"
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">NEUER CHAT</span>
                <h2 id="new-conversation-title">Gruppe oder Kanal erstellen</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setGroupOpen(false)}
                aria-label="Schließen"
              >
                <X />
              </button>
            </div>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                createGroup.mutate(e.currentTarget);
              }}
            >
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="z. B. Frühdienst Nord"
                  autoFocus
                />
              </label>
              <label>
                Gesprächsart
                <select
                  name="type"
                  value={conversationType}
                  onChange={(event) => {
                    setConversationType(
                      event.target.value as "group" | "team" | "announcement",
                    );
                    setTeamId("");
                  }}
                >
                  <option value="group">Gruppe</option>
                  {eligibleTeams.length > 0 && (
                    <option value="team">Teamkanal</option>
                  )}
                  {has("news.publish") && (
                    <option value="announcement">Ankündigungskanal</option>
                  )}
                </select>
              </label>
              {conversationType === "team" && (
                <label>
                  Team
                  <select
                    name="teamId"
                    value={teamId}
                    onChange={(event) => setTeamId(event.target.value)}
                    required
                  >
                    <option value="">Bitte auswählen</option>
                    {eligibleTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {conversationType === "group" && (
                <fieldset className="member-picker">
                  <legend>Mitglieder auswählen</legend>
                  {people
                    .filter((p) => p.id !== appSession?.profile.id)
                    .map((person) => (
                      <label key={person.id}>
                        <input
                          type="checkbox"
                          name="members"
                          value={person.id}
                        />
                        <span className="avatar">
                          {person.display_name.slice(0, 2).toUpperCase()}
                        </span>
                        {person.display_name}
                      </label>
                    ))}
                </fieldset>
              )}
              {conversationType !== "group" && (
                <div className="alert">
                  {conversationType === "team"
                    ? "Aktive Mitglieder des gewählten Teams werden automatisch aufgenommen."
                    : "Alle aktiven Mitarbeitenden werden aufgenommen; schreiben dürfen nur berechtigte Herausgeber."}
                </div>
              )}
              {createGroup.error && (
                <div className="alert error">
                  {createGroup.error instanceof Error
                    ? createGroup.error.message
                    : "Gruppe konnte nicht erstellt werden."}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setGroupOpen(false)}
                >
                  Abbrechen
                </button>
                <button className="primary" disabled={createGroup.isPending}>
                  {createGroup.isPending ? "Wird erstellt …" : "Chat erstellen"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <section className="messages-list-panel" aria-label="Unterhaltungen">
        <div className="conversation-filters">
          <label className="search">
            <Search />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Unterhaltungen durchsuchen"
              placeholder="Chats durchsuchen"
            />
          </label>
          <button
            type="button"
            className={`unread-filter ${unreadOnly ? "active" : ""}`}
            onClick={() => setUnreadOnly((current) => !current)}
            aria-pressed={unreadOnly}
          >
            Ungelesen
          </button>
        </div>
        {isLoading ? (
          <ConversationSkeleton />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => void refetchConversations()}
          />
        ) : shown.length === 0 ? (
          <section className="empty messages-empty">
            <div className="empty-icon">
              <MessageCircle />
            </div>
            <h3>
              {filter || unreadOnly
                ? "Keine passenden Chats"
                : "Noch keine Unterhaltung"}
            </h3>
            <p>
              {filter || unreadOnly
                ? "Passen Sie die Suche oder den Filter an."
                : "Wählen Sie eine Person aus dem Team und beginnen Sie den sicheren Austausch."}
            </p>
            {!filter && !unreadOnly && (
              <Link to="/app/directory" className="primary">
                Neuen Chat starten
              </Link>
            )}
          </section>
        ) : (
          <div className="conversation-list">
            {shown.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                me={appSession?.profile.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function Chat() {
  const { conversationId } = useParams();
  const { appSession, has } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [body]);
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const [messageSearch, setMessageSearch] = useState("");
  const [chatListSearch, setChatListSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messageLimit, setMessageLimit] = useState(100);
  const [downloadError, setDownloadError] = useState("");
  const [fileError, setFileError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), [conversationId]);
  const [currentTime, setCurrentTime] = useState(Date.now);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const preserveMessageRef = useRef<string | null>(null);
  const newestMessageRef = useRef<string | null>(null);
  const clearSelectedFile = () => {
    setFile(null);
    setFileError("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const selectFile = (nextFile: File | null) => {
    setFileError("");
    if (!nextFile) {
      clearSelectedFile();
      return;
    }
    if (!fileAllowed(nextFile, messageMimeTypes, 10)) {
      clearSelectedFile();
      setFileError(
        "Erlaubt sind PDF, JPG, PNG und Audio (M4A, AAC, WebM, Ogg) bis 10 MB.",
      );
      return;
    }
    setFile(nextFile);
  };
  const { data: editWindowMinutes = 15 } = useQuery({
    queryKey: ["message-edit-window"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("message_edit_window_minutes")
        .single();
      if (error) throw error;
      return data.message_edit_window_minutes;
    },
  });
  const {
    data: conversation,
    isLoading: conversationLoading,
    error: conversationError,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id,type,name,avatar_path,created_by,team_id,created_at,conversation_members(profile_id,profiles(display_name))",
        )
        .eq("id", conversationId!)
        .single();
      if (error) throw error;
      return data as unknown as Conversation;
    },
    enabled: Boolean(conversationId),
  });
  const { data: conversations = [], isLoading: conversationsLoading } =
    useQuery({
      queryKey: ["conversations"],
      queryFn: async () => {
        const { data, error } = await supabase.rpc("list_conversations");
        if (error) throw error;
        return data as unknown as Conversation[];
      },
      refetchInterval: 30_000,
    });
  const {
    data: messages = [],
    isLoading,
    error,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["messages", conversationId, messageLimit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id,body,created_at,sender_id,edited_at,retracted_at,reply_to_id,profiles!messages_sender_id_fkey(display_name,avatar_url),message_attachments(id,storage_path,original_name,mime_type,size_bytes),message_reactions(emoji,profile_id),message_read_receipts(profile_id,read_at),conversation_pins(pinned_by)",
        )
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(messageLimit);
      if (error) throw error;

      const baseMessages = data as unknown as MessageWithoutReply[];
      const replyIds = [
        ...new Set(
          baseMessages
            .map((message) => message.reply_to_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let replies: ReplyMessage[] = [];
      if (replyIds.length > 0) {
        const { data: replyData, error: replyError } = await supabase
          .from("messages")
          .select(
            "id,body,sender_id,profiles!messages_sender_id_fkey(display_name)",
          )
          .eq("conversation_id", conversationId!)
          .in("id", replyIds);
        if (!replyError) {
          replies = replyData as unknown as ReplyMessage[];
        }
      }
      const repliesById = new Map(replies.map((reply) => [reply.id, reply]));

      return baseMessages
        .map((message): Message => ({
          ...message,
          reply: message.reply_to_id
            ? (repliesById.get(message.reply_to_id) ?? null)
            : null,
          message_attachments: message.message_attachments ?? [],
          message_reactions: message.message_reactions ?? [],
          message_read_receipts: message.message_read_receipts ?? [],
          conversation_pins: message.conversation_pins ?? [],
        }))
        .reverse();
    },
    enabled: Boolean(conversationId),
  });
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["conversation", conversationId],
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["conversation", conversationId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["conversation-management", conversationId],
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () =>
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_attachments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () =>
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_pins",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () =>
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_read_receipts" },
        () =>
          void queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preserveMessageRef.current) {
      document
        .getElementById(`message-${preserveMessageRef.current}`)
        ?.scrollIntoView({ block: "start" });
      preserveMessageRef.current = null;
    } else if (
      messages.at(-1)?.id &&
      messages.at(-1)?.id !== newestMessageRef.current
    ) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    newestMessageRef.current = messages.at(-1)?.id ?? null;
    if (!appSession) return;
    const unread = messages
      .filter(
        (m) =>
          m.sender_id !== appSession.profile.id &&
          !m.message_read_receipts.some(
            (receipt) => receipt.profile_id === appSession.profile.id,
          ),
      )
      .map((m) => ({
        message_id: m.id,
        profile_id: appSession.profile.id,
        read_at: new Date().toISOString(),
      }));
    if (unread.length) {
      void supabase
        .from("message_read_receipts")
        .upsert(unread, { onConflict: "message_id,profile_id" })
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        );
    }
  }, [messages, appSession, queryClient]);
  const send = useMutation({
    mutationFn: async () => {
      if (!appSession || !conversationId) throw new Error("Sitzung fehlt");
      if (file && !fileAllowed(file, messageMimeTypes, 10))
        throw new Error("Erlaubt sind PDF, JPG, PNG und Audio bis 10 MB.");
      const text = body.trim() || (file ? "Anhang" : "");
      if (!text) throw new Error("Nachricht fehlt.");
      const controller = new AbortController();
      uploadController.current = controller;
      const { data: messageId, error } = await supabase.rpc("send_message", {
        p_conversation_id: conversationId,
        p_body: text,
        p_reply_to_id: replyTo?.id ?? null,
        p_client_nonce: crypto.randomUUID(),
      });
      if (error)
        throw new Error(
          safetyError(error, "Die Nachricht konnte nicht gesendet werden."),
        );
      if (file) {
        const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${appSession.profile.organization_id}/${conversationId}/${messageId}/${crypto.randomUUID()}.${ext}`;
        try {
          await uploadPrivateFile(
            "message-attachments",
            path,
            file,
            setUploadProgress,
            controller.signal,
          );
        } catch (uploadError) {
          await supabase.storage.from("message-attachments").remove([path]);
          await supabase.rpc("retract_message", {
            p_message_id: messageId,
            p_reason: "Anhang konnte nicht gespeichert werden",
          });
          throw uploadError;
        }
        const { error: metaError } = await supabase
          .from("message_attachments")
          .insert({
            organization_id: appSession.profile.organization_id,
            conversation_id: conversationId,
            message_id: messageId,
            storage_path: path,
            original_name: file.name
              .replace(/[^\p{L}\p{N}._ -]/gu, "_")
              .slice(0, 180),
            mime_type: file.type,
            size_bytes: file.size,
            uploaded_by: appSession.profile.id,
          });
        if (metaError) {
          await supabase.storage.from("message-attachments").remove([path]);
          await supabase.rpc("retract_message", {
            p_message_id: messageId,
            p_reason: "Anhang konnte nicht registriert werden",
          });
          throw metaError;
        }
      }
    },
    onSuccess: () => {
      setBody("");
      clearSelectedFile();
      setReplyTo(null);
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onSettled: () => {
      uploadController.current = null;
      setUploadProgress(null);
    },
  });
  const react = useMutation({
    mutationFn: async ({
      messageId,
      emoji,
    }: {
      messageId: string;
      emoji: string;
    }) => {
      if (!appSession) throw new Error();
      const exists = messages
        .find((message) => message.id === messageId)
        ?.message_reactions.some(
          (reaction) =>
            reaction.profile_id === appSession.profile.id &&
            reaction.emoji === emoji,
        );
      const result = exists
        ? await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("profile_id", appSession.profile.id)
            .eq("emoji", emoji)
        : await supabase.from("message_reactions").insert({
            message_id: messageId,
            profile_id: appSession.profile.id,
            emoji,
          });
      if (result.error) throw result.error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      }),
  });
  const changeMessage = useMutation({
    mutationFn: async (input: {
      id: string;
      kind: "edit" | "retract";
      body?: string;
    }) => {
      const result =
        input.kind === "edit"
          ? await supabase.rpc("edit_message", {
              p_message_id: input.id,
              p_new_body: input.body,
            })
          : await supabase.rpc("retract_message", {
              p_message_id: input.id,
              p_reason: "Vom Absender zurückgezogen",
            });
      if (result.error)
        throw new Error(
          safetyError(
            result.error,
            "Die Nachricht konnte nicht geändert werden.",
          ),
        );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      }),
  });
  const togglePin = useMutation({
    mutationFn: async (message: Message) => {
      if (!appSession || !conversationId) throw new Error("Sitzung fehlt.");
      const ownPin = message.conversation_pins.some(
        (pin) => pin.pinned_by === appSession.profile.id,
      );
      const result =
        ownPin ||
        (message.conversation_pins.length > 0 && has("messages.moderate"))
          ? await supabase
              .from("conversation_pins")
              .delete()
              .eq("conversation_id", conversationId)
              .eq("message_id", message.id)
          : await supabase.from("conversation_pins").insert({
              organization_id: appSession.profile.organization_id,
              conversation_id: conversationId,
              message_id: message.id,
              pinned_by: appSession.profile.id,
            });
      if (result.error) throw result.error;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      }),
  });
  const download = async (attachment: Attachment) => {
    setDownloadError("");
    const attachmentWindow = window.open("", "_blank");
    if (attachmentWindow) attachmentWindow.opener = null;
    const { data, error } = await supabase.functions.invoke(
      "create-secure-download",
      {
        body: {
          bucket: "message-attachments",
          path: attachment.storage_path,
        },
      },
    );
    if (error || !data?.signedUrl) {
      attachmentWindow?.close();
      setDownloadError("Der Anhang konnte nicht sicher geöffnet werden.");
      return;
    }
    if (attachmentWindow) attachmentWindow.location.replace(data.signedUrl);
    else window.location.assign(data.signedUrl);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if ((body.trim() || file) && !send.isPending) send.mutate();
  };
  const visibleMessages = messages.filter((message) => {
    const needle = messageSearch.trim().toLocaleLowerCase("de");
    if (!needle) return true;
    return [
      message.body,
      message.profiles?.display_name ?? "",
      ...message.message_attachments.map(
        (attachment) => attachment.original_name,
      ),
    ].some((value) => value.toLocaleLowerCase("de").includes(needle));
  });
  const visibleConversations = conversations.filter((item) =>
    conversationTitle(item, appSession?.profile.id)
      .toLocaleLowerCase("de")
      .includes(chatListSearch.trim().toLocaleLowerCase("de")),
  );
  if (conversationLoading)
    return (
      <section className="chat messaging-chat messaging-chat-loading">
        <ConversationSkeleton />
      </section>
    );
  if (conversationError)
    return (
      <ErrorState
        error={conversationError}
        onRetry={() => void refetchConversation()}
      />
    );
  return (
    <section
      className={`chat messaging-chat messaging-chat-${conversation?.type ?? "direct"}`}
    >
      <aside className="chat-sidebar" aria-label="Chatliste">
        <div className="chat-sidebar-header">
          <div>
            <span className="eyebrow">NACHRICHTEN</span>
            <h2>Chats</h2>
          </div>
          <Link
            className="icon-button"
            to="/app/directory"
            aria-label="Neuen Chat starten"
          >
            <Plus />
          </Link>
        </div>
        <label className="chat-list-search">
          <Search />
          <input
            value={chatListSearch}
            onChange={(event) => setChatListSearch(event.target.value)}
            placeholder="Chats durchsuchen"
            aria-label="Chats durchsuchen"
          />
        </label>
        <nav className="chat-sidebar-list">
          {conversationsLoading ? (
            <ConversationSkeleton />
          ) : visibleConversations.length > 0 ? (
            visibleConversations.map((item) => (
              <ConversationRow
                key={item.id}
                conversation={item}
                me={appSession?.profile.id}
                active={item.id === conversationId}
              />
            ))
          ) : (
            <p className="chat-sidebar-empty">Kein passender Chat gefunden.</p>
          )}
        </nav>
      </aside>
      <div className="chat-main">
        <header className={`chat-header ${searchOpen ? "search-open" : ""}`}>
          <Link
            className="icon-button mobile-back"
            to="/app/messages"
            aria-label="Zurück zu Nachrichten"
          >
            <ArrowLeft />
          </Link>
          {conversation && conversation.type !== "direct" ? (
            <button
              type="button"
              className="chat-avatar-toggle"
              aria-label="Gruppenbild und Chatdetails öffnen"
              onClick={() => setDetailsOpen(true)}
            >
              <ConversationAvatar
                conversation={conversation}
                me={appSession?.profile.id}
                className="chat-contact-avatar"
              />
            </button>
          ) : (
            <ConversationAvatar
              conversation={conversation}
              me={appSession?.profile.id}
              className="chat-contact-avatar"
            />
          )}
          <div className="chat-contact">
            <h2>
              {conversation
                ? conversationTitle(conversation, appSession?.profile.id)
                : "Unterhaltung"}
            </h2>
            <p>
              {conversation
                ? conversation.type === "direct"
                  ? "Sicherer Direktchat"
                  : `${conversationLabel(conversation)} · ${conversation.conversation_members.length} Mitglieder`
                : "Interner Chat"}
            </p>
          </div>
          {conversation && conversation.type !== "direct" && (
            <button
              className="icon-button chat-details-toggle"
              type="button"
              aria-label="Chatdetails und Mitglieder öffnen"
              title="Chatdetails und Mitglieder"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen(true)}
            >
              <Users />
            </button>
          )}
          <button
            className="icon-button chat-search-toggle"
            type="button"
            aria-label={
              searchOpen ? "Nachrichtensuche schließen" : "Nachrichten suchen"
            }
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((current) => !current);
              if (searchOpen) setMessageSearch("");
            }}
          >
            {searchOpen ? <X /> : <Search />}
          </button>
          <div className="chat-search">
            <Search />
            <input
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              placeholder="Im Verlauf suchen"
              aria-label="Im Nachrichtenverlauf suchen"
            />
            {messageSearch && (
              <button
                type="button"
                onClick={() => setMessageSearch("")}
                aria-label="Suche leeren"
              >
                <X />
              </button>
            )}
          </div>
        </header>
        <div className="message-history" aria-live="polite">
          {isLoading ? (
            <ConversationSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetchMessages()} />
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <MessageCircle />
              <h3>Beginnen Sie die Unterhaltung</h3>
              <p>
                Nachrichten sind nur für Mitglieder dieser Unterhaltung
                sichtbar.
              </p>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="chat-empty">
              <Search />
              <h3>Keine passende Nachricht</h3>
              <p>Versuchen Sie einen anderen Suchbegriff.</p>
            </div>
          ) : (
            <>
              {messages.length === messageLimit && !messageSearch && (
                <button
                  type="button"
                  className="load-older"
                  onClick={() => {
                    preserveMessageRef.current = visibleMessages[0]?.id ?? null;
                    setMessageLimit((current) => current + 100);
                  }}
                >
                  Ältere Nachrichten laden
                </button>
              )}
              {visibleMessages.map((m, i) => {
                const own = m.sender_id === appSession?.profile.id;
                const newDay =
                  i === 0 ||
                  format(
                    new Date(visibleMessages[i - 1].created_at),
                    "yyyy-MM-dd",
                  ) !== format(new Date(m.created_at), "yyyy-MM-dd");
                const reactions = Object.entries(
                  m.message_reactions.reduce<Record<string, number>>(
                    (all, r) => ({
                      ...all,
                      [r.emoji]: (all[r.emoji] ?? 0) + 1,
                    }),
                    {},
                  ),
                );
                const editable =
                  own &&
                  !m.retracted_at &&
                  currentTime - new Date(m.created_at).getTime() <
                    editWindowMinutes * 60 * 1000;
                return (
                  <div key={m.id} id={`message-${m.id}`}>
                    {newDay && (
                      <div className="date-divider">
                        <span>
                          {format(new Date(m.created_at), "EEEE, dd. MMMM", {
                            locale: de,
                          })}
                        </span>
                      </div>
                    )}
                    <article
                      className={`message ${own ? "own" : ""} ${m.conversation_pins.length ? "pinned" : ""}`}
                    >
                      {!own && conversation?.type !== "direct" && (
                        <span className="message-avatar" aria-hidden="true">
                          {(m.profiles?.display_name ?? "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                      <div className="bubble">
                        {!own && conversation?.type !== "direct" && (
                          <strong className="message-sender">
                            {m.profiles?.display_name}
                          </strong>
                        )}
                        {m.conversation_pins.length > 0 && (
                          <span className="pin-label">
                            <Pin /> Angeheftet
                          </span>
                        )}
                        {m.reply && !m.retracted_at && (
                          <button
                            type="button"
                            className="reply-quote"
                            onClick={() =>
                              document
                                .getElementById(`message-${m.reply?.id}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                })
                            }
                          >
                            <strong>
                              {m.reply.profiles?.display_name ?? "Nachricht"}
                            </strong>
                            <span>{m.reply.body}</span>
                          </button>
                        )}
                        {(m.retracted_at ||
                          m.body !== "Anhang" ||
                          m.message_attachments.length === 0) && (
                          <p
                            className={
                              m.retracted_at ? "retracted-message" : ""
                            }
                          >
                            {m.retracted_at
                              ? "Diese Nachricht wurde zurückgezogen."
                              : m.body}
                          </p>
                        )}
                        {!m.retracted_at &&
                          m.message_attachments.map((a) =>
                            a.mime_type.startsWith("image/") ? (
                              <MessageImage
                                key={a.id}
                                attachment={a}
                                onOpen={() => void download(a)}
                              />
                            ) : a.mime_type.startsWith("audio/") ? (
                              <MessageAudio key={a.id} attachment={a} />
                            ) : (
                              <button
                                type="button"
                                className="message-file"
                                key={a.id}
                                onClick={() => void download(a)}
                                aria-label={`${a.original_name} sicher öffnen`}
                              >
                                <span className="message-file-icon">
                                  <FileText />
                                </span>
                                <span className="message-file-details">
                                  <strong>{a.original_name}</strong>
                                  <small>
                                    PDF · {formatBytes(a.size_bytes)}
                                  </small>
                                </span>
                                <span className="message-file-open">
                                  <Download />
                                </span>
                              </button>
                            ),
                          )}
                        <div className="reaction-row">
                          {reactions.map(([emoji, count]) => (
                            <button
                              type="button"
                              key={emoji}
                              className={
                                m.message_reactions.some(
                                  (reaction) =>
                                    reaction.profile_id ===
                                      appSession?.profile.id &&
                                    reaction.emoji === emoji,
                                )
                                  ? "active"
                                  : ""
                              }
                              aria-pressed={m.message_reactions.some(
                                (reaction) =>
                                  reaction.profile_id ===
                                    appSession?.profile.id &&
                                  reaction.emoji === emoji,
                              )}
                              onClick={() =>
                                react.mutate({ messageId: m.id, emoji })
                              }
                            >
                              {emoji} {count}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="add-reaction"
                            aria-label="Reaktion hinzufügen"
                            onClick={() =>
                              setReactionFor((current) =>
                                current === m.id ? null : m.id,
                              )
                            }
                          >
                            <SmilePlus />
                          </button>
                          {reactionFor === m.id && (
                            <span
                              className="emoji-picker"
                              aria-label="Reaktion auswählen"
                            >
                              {["👍", "❤️", "👏", "✅", "😊", "🙏"].map(
                                (emoji) => (
                                  <button
                                    type="button"
                                    key={emoji}
                                    onClick={() => {
                                      react.mutate({ messageId: m.id, emoji });
                                      setReactionFor(null);
                                    }}
                                    aria-label={`Mit ${emoji} reagieren`}
                                  >
                                    {emoji}
                                  </button>
                                ),
                              )}
                            </span>
                          )}
                        </div>
                        {!m.retracted_at && (
                          <div className="message-actions">
                            <button type="button" onClick={() => setReplyTo(m)}>
                              <CornerUpLeft /> Antworten
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void navigator.clipboard.writeText(m.body)
                              }
                            >
                              <Copy /> Kopieren
                            </button>
                            {(m.conversation_pins.length === 0 ||
                              m.conversation_pins.some(
                                (pin) =>
                                  pin.pinned_by === appSession?.profile.id,
                              ) ||
                              has("messages.moderate")) && (
                              <button
                                type="button"
                                onClick={() => togglePin.mutate(m)}
                              >
                                <Pin />{" "}
                                {m.conversation_pins.length
                                  ? "Lösen"
                                  : "Anheften"}
                              </button>
                            )}
                            {editable && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = window.prompt(
                                    "Nachricht bearbeiten",
                                    m.body,
                                  );
                                  if (next?.trim())
                                    changeMessage.mutate({
                                      id: m.id,
                                      kind: "edit",
                                      body: next.trim(),
                                    });
                                }}
                              >
                                <Pencil /> Bearbeiten
                              </button>
                            )}
                            {editable && (
                              <button
                                type="button"
                                onClick={() =>
                                  window.confirm(
                                    "Nachricht für alle zurückziehen?",
                                  ) &&
                                  changeMessage.mutate({
                                    id: m.id,
                                    kind: "retract",
                                  })
                                }
                              >
                                <Trash2 /> Zurückziehen
                              </button>
                            )}
                          </div>
                        )}
                        {!own && !m.retracted_at && (
                          <div className="message-safety-actions">
                            <MessageSafetyActions
                              messageId={m.id}
                              senderId={m.sender_id}
                              senderName={
                                m.profiles?.display_name ?? "dieser Person"
                              }
                            />
                          </div>
                        )}
                        <span className="message-meta">
                          <time>
                            {format(new Date(m.created_at), "HH:mm")}
                            {m.edited_at ? " · bearbeitet" : ""}
                          </time>
                          {own && (
                            <span
                              className={`message-read-status ${
                                m.message_read_receipts.some(
                                  (receipt) =>
                                    receipt.profile_id !==
                                    appSession?.profile.id,
                                )
                                  ? "read"
                                  : ""
                              }`}
                              aria-label={
                                m.message_read_receipts.some(
                                  (receipt) =>
                                    receipt.profile_id !==
                                    appSession?.profile.id,
                                )
                                  ? "Gelesen"
                                  : "Gesendet"
                              }
                              title={
                                m.message_read_receipts.some(
                                  (receipt) =>
                                    receipt.profile_id !==
                                    appSession?.profile.id,
                                )
                                  ? "Gelesen"
                                  : "Gesendet"
                              }
                            >
                              {m.message_read_receipts.some(
                                (receipt) =>
                                  receipt.profile_id !== appSession?.profile.id,
                              ) ? (
                                <CheckCheck />
                              ) : (
                                <Check />
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                    </article>
                  </div>
                );
              })}
            </>
          )}
          {(react.error ||
            changeMessage.error ||
            togglePin.error ||
            downloadError) && (
            <div className="chat-action-error" role="alert">
              {downloadError ||
                "Die Nachrichtenaktion konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form
          className="composer"
          onSubmit={submit}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files"))
              event.preventDefault();
          }}
          onDrop={(event) => {
            const droppedFile = event.dataTransfer.files?.[0] ?? null;
            if (!droppedFile) return;
            event.preventDefault();
            selectFile(droppedFile);
          }}
        >
          {replyTo && (
            <div className="reply-preview">
              <CornerUpLeft />
              <span>
                <strong>
                  Antwort an {replyTo.profiles?.display_name ?? "Nachricht"}
                </strong>
                <small>{replyTo.body}</small>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Antwortbezug entfernen"
              >
                <X />
              </button>
            </div>
          )}
          {file && (
            <div className="selected-file">
              <span className="selected-file-icon">
                {file.type.startsWith("image/") ? <ImageIcon /> : <FileText />}
              </span>
              <span>
                <strong>{file.name}</strong>
                <small>{formatBytes(file.size)} · bereit zum Senden</small>
              </span>
              <button
                type="button"
                onClick={clearSelectedFile}
                aria-label="Anhang entfernen"
              >
                <X />
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />
          {file?.type.startsWith("audio/") && <AudioPreview file={file} />}
          <ChatDeviceActions
            key={conversationId}
            onFile={selectFile}
            onLocation={(text) =>
              setBody((current) =>
                `${current}${current ? "\n" : ""}${text}`.slice(0, 10000),
              )
            }
            disabled={send.isPending}
          />
          {uploadProgress !== null && (
            <UploadProgress
              percent={uploadProgress}
              onCancel={() => uploadController.current?.abort()}
            />
          )}
          <button
            type="button"
            className="icon-button attachment-button"
            aria-label="Bild oder PDF anhängen"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
          </button>
          <textarea
            ref={composerInputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(
                event.currentTarget.scrollHeight,
                120,
              )}px`;
            }}
            onPaste={(event) => {
              const pastedFile = Array.from(event.clipboardData.files).find(
                (candidate) => candidate.type.startsWith("image/"),
              );
              if (pastedFile) selectFile(pastedFile);
            }}
            rows={1}
            maxLength={10000}
            placeholder="Nachricht schreiben …"
            aria-label="Nachricht"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="send-button"
            disabled={(!body.trim() && !file) || send.isPending}
            aria-label="Nachricht senden"
          >
            <Send />
          </button>
          {(send.error || fileError) && (
            <div className="composer-error">
              {fileError ||
                (send.error instanceof Error
                  ? send.error.message
                  : "Senden fehlgeschlagen. Bitte erneut versuchen.")}
            </div>
          )}
        </form>
      </div>
      {detailsOpen && conversation && conversation.type !== "direct" && (
        <ConversationDetails
          key={conversation.id}
          conversation={conversation}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </section>
  );
}
function ConversationDetails({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const { appSession } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [avatarNotice, setAvatarNotice] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberDraft, setMemberDraft] = useState<string[] | null>(null);
  const [membersSaved, setMembersSaved] = useState(false);
  const {
    data: canManage = false,
    isLoading: permissionsLoading,
    error: permissionError,
  } = useQuery({
    queryKey: ["conversation-management", conversation.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_manage_conversation", {
        p_conversation_id: conversation.id,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
  const {
    data: people = [],
    isLoading: peopleLoading,
    error: peopleError,
    refetch: refetchPeople,
  } = useQuery({
    queryKey: ["conversation-people"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory_entries", {
        p_search: null,
      });
      if (error) throw error;
      return data as ConversationPerson[];
    },
    enabled: canManage,
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);
  const clearAvatarDraft = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setAvatarFile(null);
    setAvatarError("");
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };
  const refreshConversation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversation.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      queryClient.invalidateQueries({
        queryKey: ["conversation-management", conversation.id],
      }),
    ]);
  };
  const saveAvatar = useMutation({
    mutationFn: async (image: File | null) => {
      if (!appSession || !canManage)
        throw new Error("Keine Berechtigung zum Ändern des Gruppenbilds.");
      if (image && !fileAllowed(image, avatarMimeTypes, 5))
        throw new Error("Erlaubt sind JPG, PNG, WebP und GIF bis 5 MB.");
      let nextPath: string | null = null;
      if (image) {
        const extension = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
        }[image.type];
        nextPath = `${appSession.profile.organization_id}/${conversation.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
          .from("conversation-avatars")
          .upload(nextPath, image, {
            contentType: image.type,
            upsert: false,
          });
        if (error) throw error;
      }
      const { error } = await supabase.rpc("set_conversation_avatar", {
        p_conversation_id: conversation.id,
        p_storage_path: nextPath,
      });
      if (error) {
        if (nextPath)
          await supabase.storage
            .from("conversation-avatars")
            .remove([nextPath]);
        throw error;
      }
      const previousPath = conversation.avatar_path;
      if (previousPath && previousPath !== nextPath)
        await supabase.storage
          .from("conversation-avatars")
          .remove([previousPath]);
      return nextPath;
    },
    onSuccess: async (nextPath) => {
      clearAvatarDraft();
      setAvatarNotice(
        nextPath ? "Gruppenbild gespeichert." : "Gruppenbild entfernt.",
      );
      await refreshConversation();
    },
  });
  const currentMemberIds = conversation.conversation_members.map(
    (member) => member.profile_id,
  );
  const selectedIds = memberDraft ?? currentMemberIds;
  const saveMembers = useMutation({
    mutationFn: async (memberIds: string[]) => {
      const { error } = await supabase.rpc("set_conversation_members", {
        p_conversation_id: conversation.id,
        p_member_ids: memberIds,
      });
      if (error) throw error;
      return memberIds;
    },
    onSuccess: async (memberIds) => {
      if (appSession && !memberIds.includes(appSession.profile.id)) {
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        onClose();
        navigate("/app/messages");
        return;
      }
      await refreshConversation();
      setMemberDraft(null);
      setMembersSaved(true);
    },
  });
  const busy = saveAvatar.isPending || saveMembers.isPending;
  const memberOptions = new Map<string, { id: string; display_name: string }>();
  for (const member of conversation.conversation_members) {
    memberOptions.set(member.profile_id, {
      id: member.profile_id,
      display_name: member.profiles?.display_name ?? "Mitarbeitende",
    });
  }
  if (canManage)
    for (const person of people) memberOptions.set(person.id, person);
  const matchingPeople = [...memberOptions.values()]
    .sort(
      (a, b) =>
        Number(currentMemberIds.includes(b.id)) -
          Number(currentMemberIds.includes(a.id)) ||
        a.display_name.localeCompare(b.display_name, "de"),
    )
    .filter((person) =>
      person.display_name
        .toLocaleLowerCase("de")
        .includes(memberSearch.trim().toLocaleLowerCase("de")),
    );
  const membershipChanged =
    selectedIds.length !== currentMemberIds.length ||
    currentMemberIds.some((id) => !selectedIds.includes(id));
  const addedCount = selectedIds.filter(
    (id) => !currentMemberIds.includes(id),
  ).length;
  const removedCount = currentMemberIds.filter(
    (id) => !selectedIds.includes(id),
  ).length;
  return (
    <dialog
      ref={dialogRef}
      className="messaging-group-editor conversation-details"
      aria-labelledby="conversation-details-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">CHATDETAILS</span>
          <h2 id="conversation-details-title">
            {conversation.name ?? "Unterhaltung"}
          </h2>
          <p>
            {conversationLabel(conversation)} · {currentMemberIds.length}{" "}
            Mitglieder
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Chatdetails schließen"
        >
          <X />
        </button>
      </div>
      <section
        className="conversation-avatar-editor"
        aria-labelledby="group-avatar-title"
      >
        <div className="conversation-avatar-preview">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau des neuen Gruppenbilds"
              onError={() =>
                setAvatarError(
                  "Das Bild kann nicht angezeigt werden. Bitte wählen Sie ein anderes Bild.",
                )
              }
            />
          ) : (
            <ConversationAvatar
              conversation={conversation}
              className="conversation-avatar-large"
            />
          )}
        </div>
        <div className="conversation-avatar-controls">
          <h3 id="group-avatar-title">Gruppenbild</h3>
          <p>
            {canManage
              ? "JPG, PNG, WebP oder GIF · bis 5 MB"
              : "Das Bild erscheint in der Chatliste und im Chat."}
          </p>
          {canManage && (
            <>
              <input
                ref={avatarInputRef}
                type="file"
                hidden
                accept={avatarMimeTypes.join(",")}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0];
                  if (!nextFile) return;
                  clearAvatarDraft();
                  saveAvatar.reset();
                  setAvatarNotice("");
                  if (!fileAllowed(nextFile, avatarMimeTypes, 5)) {
                    setAvatarError(
                      "Erlaubt sind JPG, PNG, WebP und GIF bis 5 MB.",
                    );
                    return;
                  }
                  const url = URL.createObjectURL(nextFile);
                  previewUrlRef.current = url;
                  setPreviewUrl(url);
                  setAvatarFile(nextFile);
                }}
              />
              <div className="conversation-details-actions">
                <button
                  type="button"
                  className="secondary compact"
                  disabled={busy}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <ImageIcon />{" "}
                  {conversation.avatar_path || avatarFile
                    ? "Bild ändern"
                    : "Bild hinzufügen"}
                </button>
                {conversation.avatar_path && !avatarFile && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      saveAvatar.reset();
                      setAvatarNotice("");
                      saveAvatar.mutate(null);
                    }}
                  >
                    Bild entfernen
                  </button>
                )}
              </div>
              {avatarFile && (
                <div className="conversation-details-actions">
                  <button
                    type="button"
                    className="primary compact"
                    disabled={busy || Boolean(avatarError)}
                    onClick={() => saveAvatar.mutate(avatarFile)}
                  >
                    {saveAvatar.isPending
                      ? "Wird gespeichert …"
                      : "Bild speichern"}
                  </button>
                  <button
                    type="button"
                    className="secondary compact"
                    disabled={busy}
                    onClick={clearAvatarDraft}
                  >
                    Abbrechen
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {(avatarError || saveAvatar.error) && (
          <p className="alert error conversation-details-notice" role="alert">
            {avatarError ||
              actionErrorMessage(
                saveAvatar.error,
                "Gruppenbild konnte nicht gespeichert werden.",
              )}
          </p>
        )}
        {avatarNotice && (
          <p className="conversation-details-notice" role="status">
            {avatarNotice}
          </p>
        )}
      </section>
      <section
        className="conversation-members-editor"
        aria-labelledby="chat-members-title"
      >
        <h3 id="chat-members-title">
          Mitglieder{canManage ? " verwalten" : ""}
        </h3>
        <p>
          {canManage
            ? "Personen auswählen oder abwählen und die Änderungen speichern."
            : permissionsLoading
              ? "Berechtigungen werden geladen …"
              : "Die Chatverwaltung kann Mitglieder und das Gruppenbild ändern."}
        </p>
        {conversation.type === "team" && canManage && (
          <p>
            Änderungen gelten nur für diesen Chat. Auch Vertretungen aus anderen
            Teams können teilnehmen.
          </p>
        )}
        <label className="search conversation-member-search">
          <Search />
          <input
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
            placeholder="Mitarbeitende suchen"
            aria-label="Chatmitglieder durchsuchen"
          />
        </label>
        {peopleError && (
          <div className="alert error" role="alert">
            Die Mitarbeitenden konnten nicht geladen werden.{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => void refetchPeople()}
            >
              Erneut laden
            </button>
          </div>
        )}
        {permissionError && (
          <p className="alert error" role="alert">
            Die Verwaltungsberechtigung konnte nicht geladen werden. Öffnen Sie
            die Chatdetails bitte erneut.
          </p>
        )}
        {peopleLoading ? (
          <p role="status">Mitarbeitende werden geladen …</p>
        ) : (
          <div className="conversation-member-options">
            {matchingPeople.map((person) => {
              const selected = selectedIds.includes(person.id);
              const isOwnMembership = person.id === appSession?.profile.id;
              return (
                <label
                  key={person.id}
                  className={`conversation-member-option ${selected ? "selected" : ""}`}
                >
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={busy || isOwnMembership || Boolean(peopleError)}
                      onChange={() => {
                        setMembersSaved(false);
                        saveMembers.reset();
                        setMemberDraft(
                          selected
                            ? selectedIds.filter((id) => id !== person.id)
                            : [...selectedIds, person.id],
                        );
                      }}
                    />
                  )}
                  <span className="avatar" aria-hidden="true">
                    {person.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>
                      {person.display_name}
                      {person.id === appSession?.profile.id ? " (Sie)" : ""}
                    </strong>
                    <small>
                      {isOwnMembership && canManage
                        ? "Sie verwalten diesen Chat · bleiben Mitglied"
                        : currentMemberIds.includes(person.id)
                          ? selected
                            ? "Mitglied"
                            : "Wird entfernt"
                          : selected
                            ? "Wird hinzugefügt"
                            : "Hinzufügen"}
                    </small>
                  </span>
                </label>
              );
            })}
            {matchingPeople.length === 0 && (
              <p>Keine passenden Mitarbeitenden.</p>
            )}
          </div>
        )}
        {membershipChanged && (
          <p className="conversation-details-notice" role="status">
            {addedCount} hinzugefügt · {removedCount} entfernt nach dem
            Speichern.
          </p>
        )}
        {saveMembers.error && (
          <p className="alert error" role="alert">
            {actionErrorMessage(
              saveMembers.error,
              "Mitglieder konnten nicht gespeichert werden.",
            )}
          </p>
        )}
        {membersSaved && (
          <p className="conversation-details-notice" role="status">
            Mitglieder gespeichert.
          </p>
        )}
        {canManage && (
          <div className="conversation-details-actions member-save-actions">
            <button
              type="button"
              className="primary"
              disabled={
                busy ||
                !membershipChanged ||
                peopleLoading ||
                Boolean(peopleError)
              }
              onClick={() => saveMembers.mutate(selectedIds)}
            >
              {saveMembers.isPending
                ? "Wird gespeichert …"
                : "Mitglieder speichern"}
            </button>
            {membershipChanged && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setMemberDraft(null)}
              >
                Verwerfen
              </button>
            )}
          </div>
        )}
      </section>
    </dialog>
  );
}
function ConversationSkeleton() {
  return (
    <div className="skeleton-list" aria-label="Wird geladen">
      <span />
      <span />
      <span />
    </div>
  );
}
function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const errorCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.slice(0, 32)
      : navigator.onLine
        ? "CHAT_LOAD_FAILED"
        : "OFFLINE";
  return (
    <section className="empty chat-load-error" role="alert">
      <h3>Nachrichten konnten nicht geladen werden</h3>
      <p>
        Die Unterhaltung ist gerade nicht erreichbar. Versuchen Sie es bitte
        erneut.
      </p>
      <small>Fehlercode: {errorCode}</small>
      <button type="button" className="secondary" onClick={onRetry}>
        <RefreshCw /> Erneut laden
      </button>
    </section>
  );
}

function ConversationAvatar({
  conversation,
  me,
  className = "",
}: {
  conversation?: Conversation;
  me?: string;
  className?: string;
}) {
  const title = conversation ? conversationTitle(conversation, me) : "";
  const avatarPath = conversation?.avatar_path;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { data: signedUrl } = useQuery({
    queryKey: ["conversation-avatar", avatarPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("conversation-avatars")
        .createSignedUrl(avatarPath!, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: Boolean(avatarPath),
    staleTime: 45_000,
    refetchInterval: avatarPath ? 45_000 : false,
  });
  return (
    <span
      className={`avatar conversation-avatar conversation-avatar-${conversation?.type ?? "direct"} ${className}`}
      aria-hidden="true"
    >
      {signedUrl && failedUrl !== signedUrl ? (
        <img src={signedUrl} alt="" onError={() => setFailedUrl(signedUrl)} />
      ) : conversation?.type && conversation.type !== "direct" ? (
        <Users />
      ) : (
        title.slice(0, 2).toUpperCase() || "–"
      )}
    </span>
  );
}

function ConversationRow({
  conversation,
  me,
  active = false,
}: {
  conversation: Conversation;
  me?: string;
  active?: boolean;
}) {
  const last = conversation.messages?.[0];
  const unread = Number(conversation.unread_count ?? 0);
  return (
    <Link
      to={`/app/messages/${conversation.id}`}
      className={`conversation-card ${active ? "active" : ""} ${
        unread > 0 ? "has-unread" : ""
      }`}
      aria-current={active ? "page" : undefined}
    >
      <ConversationAvatar conversation={conversation} me={me} />
      <span className="conversation-copy">
        <span className="conversation-title-line">
          <strong>{conversationTitle(conversation, me)}</strong>
          {conversation.type !== "direct" && (
            <small className="conversation-kind">
              {conversationLabel(conversation)}
            </small>
          )}
        </span>
        <small className="conversation-preview">
          {conversationPreview(conversation)}
        </small>
      </span>
      <span className="conversation-meta">
        <time>{last ? stamp(last.created_at) : ""}</time>
        {unread > 0 ? (
          <strong
            className="conversation-unread"
            aria-label={`${unread} ungelesene Nachrichten`}
          >
            {unread > 99 ? "99+" : unread}
          </strong>
        ) : (
          <ChevronRight className="conversation-chevron" aria-hidden="true" />
        )}
      </span>
    </Link>
  );
}

function MessageAudio({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const { data, error: downloadError } = await supabase.functions.invoke(
        "create-secure-download",
        {
          body: {
            bucket: "message-attachments",
            path: attachment.storage_path,
          },
        },
      );
      if (downloadError || !data?.signedUrl)
        throw new Error("Audio konnte nicht geladen werden.");
      setUrl(data.signedUrl);
    } catch {
      setError(
        "Die Aufnahme konnte nicht geladen werden. Bitte erneut versuchen.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="message-audio">
      <strong>Sprachnachricht</strong>
      <small>{formatBytes(attachment.size_bytes)}</small>
      {url ? (
        <audio
          controls
          preload="none"
          src={url}
          aria-label="Sprachnachricht abspielen"
          onError={() => {
            setUrl("");
            setError(
              "Die Wiedergabe ist fehlgeschlagen: Der Zugriff kann abgelaufen oder das Audioformat auf diesem Gerät nicht unterstützt sein. Bitte neu laden.",
            );
          }}
        />
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Audio wird geladen …" : "Sprachnachricht laden"}
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

function MessageImage({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const {
    data: signedUrl,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["message-image", attachment.storage_path],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "create-secure-download",
        {
          body: {
            bucket: "message-attachments",
            path: attachment.storage_path,
          },
        },
      );
      if (error || !data?.signedUrl)
        throw error ?? new Error("Bild nicht verfügbar.");
      return data.signedUrl;
    },
    staleTime: 25_000,
  });
  return (
    <button
      type="button"
      className="message-image"
      onClick={
        failedUrl === signedUrl
          ? () => {
              void refetch().then(() => setFailedUrl(null));
            }
          : onOpen
      }
      aria-label={`${attachment.original_name} sicher öffnen`}
    >
      <span className="message-image-frame">
        {signedUrl && failedUrl !== signedUrl ? (
          <img
            src={signedUrl}
            alt={attachment.original_name}
            loading="lazy"
            onError={() => setFailedUrl(signedUrl)}
          />
        ) : (
          <span className="message-image-state">
            <ImageIcon />
            {isError || failedUrl === signedUrl
              ? "Bild nicht verfügbar. Zum Wiederholen tippen."
              : "Bild wird sicher geladen …"}
          </span>
        )}
        {signedUrl && (
          <span className="message-image-open" aria-hidden="true">
            <Download />
          </span>
        )}
      </span>
      <span className="message-image-caption">
        <span>{attachment.original_name}</span>
        <small>Bild · {formatBytes(attachment.size_bytes)}</small>
      </span>
    </button>
  );
}
