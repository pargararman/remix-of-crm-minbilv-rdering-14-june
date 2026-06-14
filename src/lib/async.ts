// Generic async helpers.

/**
 * Wraps a promise with a hard timeout. If `promise` does not settle within
 * `ms` milliseconds the returned promise rejects with a TimeoutError so a
 * surrounding try/catch can surface a user-facing error toast and clear
 * any in-flight loading state.
 */
export class TimeoutError extends Error {
  constructor(message = "Operationen tog för lång tid") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 15000, message?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
