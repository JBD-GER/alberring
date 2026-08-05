import { AuthApiError } from "npm:@supabase/supabase-js@2.110.2";
import {
  handlerError,
  HttpError,
  requireAutomation,
  shouldUseManualEmailLink,
} from "./security.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (actual !== expected)
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
};

Deno.test(
  "default SMTP restrictions return a useful public error",
  async () => {
    const response = handlerError(
      new AuthApiError(
        "Email address not authorized",
        403,
        "email_address_not_authorized",
      ),
      "request-id",
      "https://alberringapp.vercel.app",
    );
    const body = await response.json();
    assertEquals(response.status, 503);
    assertEquals(body.error.code, "email_delivery_unavailable");
  },
);

Deno.test("email rate limits return 429", async () => {
  const response = handlerError(
    new AuthApiError("Rate limit", 429, "over_email_send_rate_limit"),
    "request-id",
    "https://alberringapp.vercel.app",
  );
  const body = await response.json();
  assertEquals(response.status, 429);
  assertEquals(body.error.code, "email_rate_limit");
});

Deno.test("known mail delivery failures allow a manual invite link", () => {
  assertEquals(
    shouldUseManualEmailLink(
      new AuthApiError(
        "Email address not authorized",
        403,
        "email_address_not_authorized",
      ),
    ),
    true,
  );
  assertEquals(
    shouldUseManualEmailLink(
      new AuthApiError("Invalid email", 422, "email_address_invalid"),
    ),
    false,
  );
});

Deno.test("automation calls fail closed when the secret is missing", () => {
  const previous = Deno.env.get("AUTOMATION_SECRET");
  try {
    Deno.env.delete("AUTOMATION_SECRET");
    try {
      requireAutomation(new Request("https://example.test"));
      throw new Error("Expected requireAutomation to fail");
    } catch (error) {
      assertEquals(error instanceof HttpError && error.code, "unauthorized");
    }
  } finally {
    if (previous === undefined) Deno.env.delete("AUTOMATION_SECRET");
    else Deno.env.set("AUTOMATION_SECRET", previous);
  }
});

Deno.test("automation calls reject an incorrect secret", () => {
  const previous = Deno.env.get("AUTOMATION_SECRET");
  try {
    Deno.env.set("AUTOMATION_SECRET", "correct-secret");
    try {
      requireAutomation(
        new Request("https://example.test", {
          headers: { "x-automation-secret": "incorrect-value" },
        }),
      );
      throw new Error("Expected requireAutomation to fail");
    } catch (error) {
      assertEquals(error instanceof HttpError && error.code, "unauthorized");
    }
  } finally {
    if (previous === undefined) Deno.env.delete("AUTOMATION_SECRET");
    else Deno.env.set("AUTOMATION_SECRET", previous);
  }
});
