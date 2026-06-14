import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SaveBar } from "../src/components/leads/save-bar";
import { withTimeout } from "../src/lib/async";

// Mock sonner so we can assert toast.error was called.
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

beforeEach(() => {
  toastError.mockClear();
  toastSuccess.mockClear();
});

function Wrapper({ saveFn }: { saveFn: () => Promise<void> }) {
  const [saving, setSaving] = (require("react") as typeof import("react")).useState(false);
  const onSave = async () => {
    setSaving(true);
    try {
      await withTimeout(saveFn(), 15000);
      (await import("sonner")).toast.success("Sparat");
    } catch {
      (await import("sonner")).toast.error("Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SaveBar
      isDirty={true}
      isSaving={saving}
      lastSavedAt={null}
      onSave={onSave}
    />
  );
}

describe("SaveBar onSave error path", () => {
  it("returns to idle and shows error toast when save rejects", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("nope"));
    render(<Wrapper saveFn={saveFn} />);

    const btn = screen.getByRole("button", { name: /spara/i });
    fireEvent.click(btn);

    // Button should reach "Sparar…" briefly, then return to idle.
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Kunde inte spara");
    });
    // After failure, button is re-enabled and labelled "Spara" again.
    expect(btn).toHaveTextContent(/spara/i);
    expect(btn).not.toHaveTextContent(/sparar…/i);
  });
});
