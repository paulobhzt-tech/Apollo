import { afterEach, expect, it, vi } from "vitest";
import { withRequestTimeout } from "./request-timeout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function pendingRequest(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

it("handles timeout and session cancellation without the static AbortSignal helpers", async () => {
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => { throw new Error("unavailable"); });
  vi.spyOn(AbortSignal, "any").mockImplementation(() => { throw new Error("unavailable"); });
  vi.useFakeTimers();

  const timedOut = expect(withRequestTimeout(pendingRequest, 5000)).rejects.toHaveProperty("name", "AbortError");
  await vi.advanceTimersByTimeAsync(5000);
  await timedOut;

  const session = new AbortController();
  const canceled = expect(withRequestTimeout(pendingRequest, 5000, session.signal)).rejects.toHaveProperty("name", "AbortError");
  session.abort();
  await canceled;
  expect(vi.getTimerCount()).toBe(0);
});
