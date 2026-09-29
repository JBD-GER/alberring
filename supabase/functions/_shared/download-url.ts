/** Storage signs the path/query, while local Edge uses an internal Docker host.
 * A server-owned public origin lets browsers consume the same signed URL. */
export function publicDownloadUrl(
  signedUrl: string,
  publicOrigin?: string,
): string {
  if (!publicOrigin) return signedUrl;
  const source = new URL(signedUrl);
  const target = new URL(publicOrigin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/" ||
    (target.protocol !== "https:" && !(local && target.protocol === "http:"))
  ) {
    throw new Error("public_storage_origin_invalid");
  }
  if (!source.pathname.startsWith("/storage/v1/object/sign/"))
    throw new Error("signed_storage_path_invalid");
  target.pathname = source.pathname;
  target.search = source.search;
  return target.toString();
}
