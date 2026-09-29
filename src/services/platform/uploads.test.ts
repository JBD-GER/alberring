// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPrivateFile, validateUploadUrl } from "./uploads";

const signed = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUploadUrl: signed }) } },
}));
class Request {
  static latest: Request;
  status = 200;
  upload = {
    onprogress: undefined as
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | undefined,
  };
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  ontimeout?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort() {
    this.onabort?.();
  }
  constructor() {
    Request.latest = this;
  }
}
const backend = "http://127.0.0.1:54321";
const path = "org/chat/message/photo.jpg";
beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", backend);
  vi.stubGlobal("XMLHttpRequest", Request);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  signed.mockReset().mockResolvedValue({
    data: {
      signedUrl: `${backend}/storage/v1/object/upload/sign/message-attachments/${path}?token=temporary`,
    },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("private upload progress", () => {
  it("only marks 100% after the server confirms success", async () => {
    const progress = vi.fn();
    const result = uploadPrivateFile(
      "message-attachments",
      path,
      new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
      progress,
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(Request.latest.send).toHaveBeenCalledOnce());
    Request.latest.upload.onprogress?.({
      lengthComputable: true,
      loaded: 100,
      total: 100,
    });
    expect(progress).toHaveBeenLastCalledWith(99);
    Request.latest.onload?.();
    await result;
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(signed).toHaveBeenCalledWith(path, { upsert: false });
  });
  it.each([403, 413, 500])(
    "rejects server failure %s without reporting success",
    async (status) => {
      const progress = vi.fn();
      const result = uploadPrivateFile(
        "message-attachments",
        path,
        new File(["photo"], "p.jpg"),
        progress,
        new AbortController().signal,
      );
      const rejected = expect(result).rejects.toThrow();
      await vi.waitFor(() =>
        expect(Request.latest.send).toHaveBeenCalledOnce(),
      );
      Request.latest.status = status;
      Request.latest.onload?.();
      await rejected;
      expect(progress).not.toHaveBeenCalledWith(100);
    },
  );
  it("aborts an in-flight upload and preserves retry semantics", async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    const result = uploadPrivateFile(
      "message-attachments",
      path,
      new File(["photo"], "p.jpg"),
      progress,
      controller.signal,
    );
    const rejected = expect(result).rejects.toThrow("abgebrochen");
    await vi.waitFor(() => expect(Request.latest.send).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(progress).not.toHaveBeenCalledWith(100);
  });
  it("blocks offline signing and a pre-cancelled upload", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(
      uploadPrivateFile(
        "message-attachments",
        path,
        new File(["p"], "p.jpg"),
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Internetverbindung");
    expect(signed).not.toHaveBeenCalled();
  });
  it("rejects an unexpected destination or object path", () => {
    expect(() =>
      validateUploadUrl(
        "https://other.invalid/storage/v1/object/upload/sign/message-attachments/a?token=secret",
        backend,
        "message-attachments",
        "a",
      ),
    ).toThrow();
    expect(() =>
      validateUploadUrl(
        `${backend}/storage/v1/object/upload/sign/message-attachments/b?token=secret`,
        backend,
        "message-attachments",
        "a",
      ),
    ).toThrow();
    expect(() =>
      validateUploadUrl(
        `${backend}/storage/v1/object/upload/sign/message-attachments/a`,
        backend,
        "message-attachments",
        "a",
      ),
    ).toThrow();
  });
});
