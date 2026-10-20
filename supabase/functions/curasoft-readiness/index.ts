import { corsHeaders, json } from "../_shared/http.ts";
import { handlerError, preflight, requireUser } from "../_shared/security.ts";
import { curasoftReadiness } from "../_shared/curasoft.ts";

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
    const context = await requireUser(req, "integrations.manage");
    const result = curasoftReadiness(context.organizationId, {
      CURASOFT_ORGANIZATION_ID: Deno.env.get("CURASOFT_ORGANIZATION_ID"),
      CURASOFT_ENVIRONMENT: Deno.env.get("CURASOFT_ENVIRONMENT"),
      CURASOFT_API_KEY: Deno.env.get("CURASOFT_API_KEY"),
      CURASOFT_ACCESS_KEY: Deno.env.get("CURASOFT_ACCESS_KEY"),
    });
    return json(result, 200, requestId, corsHeaders(origin));
  } catch (error) {
    return handlerError(error, requestId, origin);
  }
});
