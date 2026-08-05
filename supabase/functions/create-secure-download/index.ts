import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

const input = z
  .object({
    bucket: z.enum([
      "sick-certificates",
      "documents",
      "employee-documents",
      "message-attachments",
      "vehicle-files",
      "material-request-files",
    ]),
    path: z.string().min(5).max(1024).optional(),
    storagePath: z.string().min(5).max(1024).optional(),
  })
  .refine((value) => Boolean(value.path ?? value.storagePath), {
    message: "path_required",
  });

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("origin");
  const options = preflight(req);
  if (options) return options;
  if (req.method !== "POST")
    return json(
      {
        error: {
          code: "method_not_allowed",
          message: "Methode nicht erlaubt.",
        },
      },
      405,
      requestId,
      corsHeaders(origin),
    );
  try {
    const context = await requireUser(req);
    const parsed = input.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(422, "invalid_input", "Dateianfrage ist ungültig.");
    const storagePath = parsed.data.path ?? parsed.data.storagePath!;
    if (storagePath.includes("..") || storagePath.startsWith("/"))
      throw new HttpError(422, "invalid_input", "Dateianfrage ist ungültig.");
    const { data: rows, error: authorizationError } = await context.caller.rpc(
      "authorize_secure_download",
      {
        p_bucket: parsed.data.bucket,
        p_storage_path: storagePath,
        p_request_id: requestId,
      },
    );
    const authorization = Array.isArray(rows) ? rows[0] : rows;
    if (authorizationError || !authorization?.allowed)
      throw new HttpError(
        403,
        "download_forbidden",
        "Dateizugriff wurde verweigert.",
      );
    const configuredTtl = Number(
      Deno.env.get("SIGNED_URL_TTL_SECONDS") ?? "60",
    );
    const expiresIn = Number.isFinite(configuredTtl)
      ? Math.min(120, Math.max(30, Math.trunc(configuredTtl)))
      : 60;
    const { data, error } = await context.admin.storage
      .from(parsed.data.bucket)
      .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl)
      throw new HttpError(404, "file_not_found", "Datei wurde nicht gefunden.");
    return json(
      { signedUrl: data.signedUrl, expiresIn },
      200,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
