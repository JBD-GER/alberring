import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

type FunctionErrorBody = {
  error?: { message?: unknown };
};

export async function functionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const response = error.context as Response;
      const body = (await response.clone().json()) as FunctionErrorBody;
      const message = body.error?.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      // The response may be empty or already consumed. Use the safe fallback.
    }
    return fallback;
  }
  if (
    error instanceof FunctionsFetchError ||
    error instanceof FunctionsRelayError
  ) {
    return fallback;
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
