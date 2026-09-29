export type EmailLinkTarget = "/accept-invite" | "/reset-password";
export type EmailLinkToken = {
  tokenHash: string;
  type: "invite" | "recovery";
};

/** Null means a malformed token link; undefined preserves existing auth flows. */
export function parseEmailLinkToken(
  search: string,
  hash: string,
  target: EmailLinkTarget,
): EmailLinkToken | null | undefined {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const tokens = [
    ...query.getAll("token_hash"),
    ...fragment.getAll("token_hash"),
  ];
  if (!tokens.length) return undefined;
  const types = [...query.getAll("type"), ...fragment.getAll("type")];
  if (
    tokens.length !== 1 ||
    types.length !== 1 ||
    !/^[a-zA-Z0-9_-]{16,512}$/.test(tokens[0]) ||
    ["access_token", "refresh_token", "code", "error", "error_code"].some(
      (key) => query.has(key) || fragment.has(key),
    )
  )
    return null;
  const type = types[0];
  if (
    type !== "recovery" &&
    !(type === "invite" && target === "/accept-invite")
  )
    return null;
  return { tokenHash: tokens[0], type };
}
