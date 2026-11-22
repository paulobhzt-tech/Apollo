export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, milliseconds);
  try {
    controller.signal.throwIfAborted();
    return await request(controller.signal);
  } finally {
    clearTimeout(timeout);
    parent?.removeEventListener("abort", abort);
  }
}
