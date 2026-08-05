import { FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { functionErrorMessage } from "./function-errors";

describe("functionErrorMessage", () => {
  it("uses the structured Edge Function message", async () => {
    const error = new FunctionsHttpError(
      new Response(
        JSON.stringify({
          error: { message: "Bitte verwenden Sie Einladung erneut senden." },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(functionErrorMessage(error, "Fallback")).resolves.toBe(
      "Bitte verwenden Sie Einladung erneut senden.",
    );
  });

  it("does not expose an invalid response body", async () => {
    const error = new FunctionsHttpError(
      new Response("Gateway-Ausgabe", { status: 502 }),
    );

    await expect(functionErrorMessage(error, "Sichere Meldung")).resolves.toBe(
      "Sichere Meldung",
    );
  });

  it("uses the safe fallback for relay failures", async () => {
    await expect(
      functionErrorMessage(new FunctionsRelayError({}), "Sichere Meldung"),
    ).resolves.toBe("Sichere Meldung");
  });
});
