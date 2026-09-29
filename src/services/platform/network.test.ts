import { afterEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./network";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("cancels hung calls without silently retrying writes", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    (_input, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const request = fetchWithTimeout("https://example.test", {
    method: "POST",
    body: "{}",
  });
  const result = expect(request).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(25_000);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("honors caller aborts and releases timeout after success", async () => {
  const original = new AbortController();
  original.abort();
  const fetcher = vi.fn(async (_input, init) => {
    expect(init.signal.aborted).toBe(true);
    return new Response("ok");
  });
  vi.stubGlobal("fetch", fetcher);
  await fetchWithTimeout("https://example.test", { signal: original.signal });
});
