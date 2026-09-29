// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./Messaging";

const state = vi.hoisted(() => ({
  actor: "creator",
  canManage: true,
  avatarPath: null as string | null,
  memberIds: ["creator", "member"],
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signedUrl: vi.fn(),
  revokeObjectURL: vi.fn(),
}));
const people = [
  {
    id: "creator",
    display_name: "Anna Leitung",
    teams: [{ id: "team", name: "Pflege" }],
  },
  {
    id: "member",
    display_name: "Ben Pflege",
    teams: [{ id: "team", name: "Pflege" }],
  },
  {
    id: "guest",
    display_name: "Clara Vertretung",
    teams: [{ id: "other-team", name: "Verwaltung" }],
  },
];
function conversation() {
  return {
    id: "chat",
    type: "team",
    name: "Pflege Austausch",
    created_by: "creator",
    team_id: "team",
    avatar_path: state.avatarPath,
    created_at: "2026-01-01T12:00:00Z",
    conversation_members: state.memberIds.map((id) => ({
      profile_id: id,
      profiles: {
        display_name: people.find((person) => person.id === id)?.display_name,
      },
    })),
    messages: [],
  };
}
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    appSession: { profile: { id: state.actor, organization_id: "org" } },
    has: () => false,
  }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async () => ({
          data:
            table === "conversations"
              ? conversation()
              : { message_edit_window_minutes: 15 },
          error: null,
        }),
        limit: async () => ({ data: [], error: null }),
      };
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
    storage: {
      from: () => ({
        upload: state.upload,
        remove: state.remove,
        createSignedUrl: state.signedUrl,
      }),
    },
  },
}));
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/messages/chat"]}>
        <Routes>
          <Route path="/app/messages/:conversationId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function openDetails() {
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Chatdetails und Mitglieder öffnen",
    }),
  );
  return await screen.findByRole("dialog");
}
beforeEach(() => {
  state.actor = "creator";
  state.canManage = true;
  state.avatarPath = null;
  state.memberIds = ["creator", "member"];
  state.rpc
    .mockReset()
    .mockImplementation(
      async (
        name: string,
        args?: { p_member_ids?: string[]; p_storage_path?: string | null },
      ) => {
        if (name === "list_conversations")
          return { data: [conversation()], error: null };
        if (name === "can_manage_conversation")
          return { data: state.canManage, error: null };
        if (name === "list_directory_entries")
          return { data: people, error: null };
        if (name === "set_conversation_members")
          state.memberIds = args?.p_member_ids ?? [];
        if (name === "set_conversation_avatar")
          state.avatarPath = args?.p_storage_path ?? null;
        return { data: null, error: null };
      },
    );
  state.upload.mockReset().mockResolvedValue({ error: null });
  state.remove.mockReset().mockResolvedValue({ error: null });
  state.signedUrl.mockReset().mockResolvedValue({
    data: { signedUrl: "https://example.test/private-avatar" },
    error: null,
  });
  state.revokeObjectURL.mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:avatar-preview";
      }
      static revokeObjectURL = state.revokeObjectURL;
    },
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Chatdetails", () => {
  it("speichert Hinzufügen einer Vertretung aus anderem Team und Entfernen zusammen", async () => {
    mount();
    const dialog = within(await openDetails());
    const guest = await dialog.findByRole("checkbox", {
      name: /Clara Vertretung/,
    });
    const creator = dialog.getByRole("checkbox", {
      name: /Anna Leitung/,
    }) as HTMLInputElement;
    expect(creator.disabled).toBe(true);
    fireEvent.click(guest);
    fireEvent.click(dialog.getByRole("checkbox", { name: /Ben Pflege/ }));
    expect(
      state.rpc.mock.calls.some(
        ([name]) => name === "set_conversation_members",
      ),
    ).toBe(false);
    fireEvent.click(
      dialog.getByRole("button", { name: "Mitglieder speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("set_conversation_members", {
        p_conversation_id: "chat",
        p_member_ids: ["creator", "guest"],
      }),
    );
    await dialog.findByText("Mitglieder gespeichert.");
  });

  it("zeigt normalen Mitgliedern Details ohne Verwaltungsaktionen", async () => {
    state.canManage = false;
    mount();
    const dialog = within(await openDetails());
    await dialog.findByText(
      "Die Chatverwaltung kann Mitglieder und das Gruppenbild ändern.",
    );
    expect(dialog.queryByRole("checkbox")).toBeNull();
    expect(
      dialog.queryByRole("button", { name: "Bild hinzufügen" }),
    ).toBeNull();
    expect(
      dialog.queryByRole("button", { name: "Mitglieder speichern" }),
    ).toBeNull();
    expect(
      state.rpc.mock.calls.some(([name]) => name === "list_directory_entries"),
    ).toBe(false);
  });

  it("lässt eine andere berechtigte Person den Chatersteller entfernen", async () => {
    state.actor = "member";
    mount();
    const dialog = within(await openDetails());
    const creator = await dialog.findByRole("checkbox", {
      name: /Anna Leitung/,
    });
    expect((creator as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(creator);
    fireEvent.click(
      dialog.getByRole("button", { name: "Mitglieder speichern" }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("set_conversation_members", {
        p_conversation_id: "chat",
        p_member_ids: ["member"],
      }),
    );
    await dialog.findByText("Mitglieder gespeichert.");
  });

  it("lädt das Bild erst nach Vorschau und Speichern hoch und erneuert die private Anzeige", async () => {
    mount();
    const element = await openDetails();
    const dialog = within(element);
    await dialog.findByRole("button", { name: "Bild hinzufügen" });
    const input =
      element.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["image"], "gruppenbild.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(
      dialog
        .getByAltText("Vorschau des neuen Gruppenbilds")
        .getAttribute("src"),
    ).toBe("blob:avatar-preview");
    expect(state.upload).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Bild speichern" }));
    await dialog.findByText("Gruppenbild gespeichert.");
    expect(state.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^org\/chat\/.+\.png$/),
      file,
      { contentType: "image/png", upsert: false },
    );
    expect(state.rpc).toHaveBeenCalledWith("set_conversation_avatar", {
      p_conversation_id: "chat",
      p_storage_path: state.avatarPath,
    });
    await waitFor(() =>
      expect(state.signedUrl).toHaveBeenCalledWith(state.avatarPath, 60),
    );
    expect(state.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-preview");
  });

  it("verhindert ungeeignete oder zu große Gruppenbilder", async () => {
    mount();
    const element = await openDetails();
    const dialog = within(element);
    await dialog.findByRole("button", { name: "Bild hinzufügen" });
    const input =
      element.querySelector<HTMLInputElement>('input[type="file"]')!;
    for (const file of [
      new File(["pdf"], "datei.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "gross.png", {
        type: "image/png",
      }),
    ]) {
      fireEvent.change(input, { target: { files: [file] } });
      await dialog.findByText("Erlaubt sind JPG, PNG, WebP und GIF bis 5 MB.");
      expect(
        dialog.queryByRole("button", { name: "Bild speichern" }),
      ).toBeNull();
    }
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("räumt einen fehlgeschlagenen Bildupload nach abgewiesener Zuordnung auf", async () => {
    state.rpc.mockImplementation(async (name: string) => {
      if (name === "list_conversations")
        return { data: [conversation()], error: null };
      if (name === "can_manage_conversation")
        return { data: true, error: null };
      if (name === "list_directory_entries")
        return { data: people, error: null };
      return { data: null, error: { message: "permission_denied" } };
    });
    mount();
    const element = await openDetails();
    const dialog = within(element);
    await dialog.findByRole("button", { name: "Bild hinzufügen" });
    fireEvent.change(element.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "bild.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Bild speichern" }));
    await dialog.findByText(
      "Sie können diesen Chat nicht mehr verwalten. Bitte öffnen Sie die Chatdetails erneut.",
    );
    expect(state.remove).toHaveBeenCalledWith([state.upload.mock.calls[0][0]]);
    expect(state.avatarPath).toBeNull();
  });
});
