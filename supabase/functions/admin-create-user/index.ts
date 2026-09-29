import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import { createInvitation } from "../_shared/invitations.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

const input = z.object({
  email: z.string().trim().pipe(z.email()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  roleId: z.uuid(),
  teamId: z.uuid().optional().nullable(),
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
    const context = await requireUser(req, "users.manage");
    const parsed = input.safeParse(await req.json());
    if (!parsed.success)
      throw new HttpError(422, "invalid_input", "Eingaben sind ungültig.");
    const appUrl = Deno.env.get("APP_URL");
    if (!appUrl) throw new Error("app_url_missing");
    const result = await createInvitation(
      context,
      parsed.data,
      `${appUrl.replace(/\/$/, "")}/accept-invite`,
      requestId,
    );
    return json(
      result,
      result.delivery === "failed" ? 207 : 201,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
