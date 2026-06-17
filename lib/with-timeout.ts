// Wrap a promise so it ALWAYS settles within `ms` milliseconds.
// If the inner promise hasn't resolved/rejected in time we reject with
// `message`, guaranteeing that callers (e.g. react-query mutations) reset
// their loading state instead of spinning forever.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}
