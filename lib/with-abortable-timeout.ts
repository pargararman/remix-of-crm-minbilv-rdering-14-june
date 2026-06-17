// Run a promise with both an AbortController and a hard timeout. Guarantees
// the returned promise ALWAYS settles within `ms` ms and that the underlying
// request is actually aborted (not just the wrapper). The Supabase JS client
// supports `.abortSignal(signal)` on query builders, which cancels the HTTP
// request — this is the real reason this helper exists.
export async function withAbortableTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: number | undefined;
  let fallbackId: number | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, ms);
  });

  const fallback = new Promise<never>((_, reject) => {
    fallbackId = window.setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, ms + 1000);
  });

  const operation = (async () => {
    try {
      return await run(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(message);
      throw error;
    }
  })();

  try {
    return await Promise.race([operation, timeout, fallback]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (fallbackId) window.clearTimeout(fallbackId);
  }
}
