import { z } from "npm:zod@4.4.3";
import { corsHeaders, json } from "../_shared/http.ts";
import { userDeletionError } from "../_shared/user-deletion.ts";
import {
  handlerError,
  HttpError,
  preflight,
  requireUser,
} from "../_shared/security.ts";

const input = z.object({ profileId: z.uuid() });

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
    const { error } = await context.caller.rpc(
      "admin_delete_unused_invited_user",
      {
        p_profile_id: parsed.data.profileId,
        p_request_id: requestId,
      },
    );
    if (error) throw userDeletionError(error) ?? error;
    return json(
      { profileId: parsed.data.profileId, deleted: true, dataRetained: true },
      200,
      requestId,
      corsHeaders(origin),
    );
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
