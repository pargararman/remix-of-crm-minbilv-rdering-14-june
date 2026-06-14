import { describe, it, expect, vi } from "vitest";
import { withTimeout, TimeoutError } from "../src/lib/async";

describe("withTimeout", () => {
  it("resolves when the inner promise resolves before the timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000);
    expect(result).toBe("ok");
  });

  it("rejects with TimeoutError when the inner promise hangs", async () => {
    vi.useFakeTimers();
    const hanging = new Promise<string>(() => {}); // never resolves
    const p = withTimeout(hanging, 50);
    vi.advanceTimersByTime(60);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    vi.useRealTimers();
  });

  it("propagates the inner rejection unchanged", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 100)).rejects.toThrow("boom");
  });
});
