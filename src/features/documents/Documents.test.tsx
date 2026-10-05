// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentUpload } from "./Documents";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  permissions: new Set<string>(),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
        is: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    has: (permission: string) => mocks.permissions.has(permission),
    appSession: { profile: { id: "employee", organization_id: "test-org" } },
  }),
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set(["documents.view_own"]);
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data: name === "create_document_folder" ? "new-folder" : "new-document",
  }));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  const onUploaded = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <DocumentUpload onDone={vi.fn()} onUploaded={onUploaded} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Titel"), {
    target: { value: "PDF-Testdokument" },
  });
  const file = new File(["%PDF-1.4 test"], "Test.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(screen.getByLabelText(/PDF, JPG oder PNG auswählen/), {
    target: { files: [file] },
  });
  return { onUploaded, file };
}
describe("document upload", () => {
  it("uploads a personal PDF without offering inaccessible folder creation", async () => {
    const { onUploaded, file } = mount();
    expect(
      screen.queryByLabelText("Neuen Ordner anlegen (optional)"),
    ).toBeNull();
    fireEvent.submit(
      screen.getByRole("button", { name: "Sicher hochladen" }).closest("form")!,
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("create_personal_document_upload", {
      p_title: "PDF-Testdokument",
      p_folder_id: null,
      p_category_id: null,
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^test-org\/new-document\/1\/.*\.pdf$/),
      file,
      { contentType: "application/pdf", upsert: false },
    );
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "create_personal_document_upload",
      "add_document_version",
      "finalize_document_upload",
    ]);
  });
  it("uses the created folder for upload when the employee can access folders", async () => {
    mocks.permissions.add("documents.view_folders");
    const { onUploaded } = mount();
    fireEvent.change(screen.getByLabelText("Neuen Ordner anlegen (optional)"), {
      target: { value: "Eigene Unterlagen" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Sicher hochladen" }).closest("form")!,
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("create_personal_document_upload", {
      p_title: "PDF-Testdokument",
      p_folder_id: "new-folder",
      p_category_id: null,
    });
  });
  it("explains unavailable folders and keeps the selected PDF for retry", async () => {
    mocks.rpc.mockResolvedValueOnce({
      error: { message: "folder_not_available" },
    });
    const { onUploaded } = mount();
    fireEvent.submit(
      screen.getByRole("button", { name: "Sicher hochladen" }).closest("form")!,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Ordner ist nicht mehr verfügbar",
    );
    expect(onUploaded).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(screen.getByText("Test.pdf")).toBeTruthy();
    fireEvent.submit(
      screen.getByRole("button", { name: "Sicher hochladen" }).closest("form")!,
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not acknowledge a failed file transfer as a successful upload", async () => {
    mocks.upload.mockResolvedValueOnce({
      error: new Error("Die Verbindung wurde unterbrochen."),
    });
    const { onUploaded } = mount();
    fireEvent.submit(
      screen.getByRole("button", { name: "Sicher hochladen" }).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(onUploaded).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("discard_document_upload", {
      p_document_id: "new-document",
    });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain(
      "finalize_document_upload",
    );
  });
});
