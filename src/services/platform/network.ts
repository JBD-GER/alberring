/** Bound every backend request. Retrying writes could duplicate business actions. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const source =
    init?.signal ?? (input instanceof Request ? input.signal : null);
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener("abort", abort, { once: true });
  const upload = init?.body instanceof FormData || init?.body instanceof Blob;
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException("Die Anfrage hat zu lange gedauert.", "TimeoutError"),
      ),
    upload ? 120_000 : 25_000,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    source?.removeEventListener("abort", abort);
  }
}
