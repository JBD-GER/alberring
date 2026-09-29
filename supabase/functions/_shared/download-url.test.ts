import { publicDownloadUrl } from "./download-url.ts";
Deno.test(
  "local public storage origin preserves the signed path and query",
  () => {
    const source =
      "http://kong:8000/storage/v1/object/sign/message-attachments/test/photo.jpg?token=test-value";
    if (
      publicDownloadUrl(source, "http://127.0.0.1:54321") !==
      source.replace("http://kong:8000", "http://127.0.0.1:54321")
    )
      throw new Error("Signed URL changed");
    if (publicDownloadUrl(source) !== source)
      throw new Error("Default URL changed");
  },
);
Deno.test(
  "public storage origin rejects insecure remote hosts and non-storage paths",
  () => {
    for (const origin of [
      "http://remote.test",
      "https://user:password@example.test",
      "https://example.test/subpath",
      "https://example.test?x=1",
      "file:///tmp/file",
    ]) {
      let denied = false;
      try {
        publicDownloadUrl(
          "https://project.supabase.co/storage/v1/object/sign/bucket/file?token=test",
          origin,
        );
      } catch {
        denied = true;
      }
      if (!denied) throw new Error("Invalid origin accepted");
    }
    let denied = false;
    try {
      publicDownloadUrl(
        "https://example.test/auth/v1/verify?token=test",
        "https://project.supabase.co",
      );
    } catch {
      denied = true;
    }
    if (!denied) throw new Error("Non-storage URL accepted");
  },
);
