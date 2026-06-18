import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExternalButtons } from "../src/components/leads/external-buttons";

vi.mock("@/lib/settings.functions", () => ({
  logAuditAction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(() => Promise.resolve({})),
}));

const completeVehicle = {
  brand: "Volvo",
  model: "XC90",
  version: "T8 AWD",
  year: 2023,
  mileage_mil: 12816,
  fuel: "plugin_bensin",
  gearbox: "automatisk",
  body_type: "suv",
  drive_type: "fyrhjulsdrift",
  horsepower: 310,
};

describe("ExternalButtons", () => {
  it("shows separate Blocket API and Blocket.se buttons when valuation mode is enabled", () => {
    render(
      <ExternalButtons
        leadId="lead-1"
        regnr="ABC123"
        vehicle={completeVehicle}
        onBlocketValuate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /hämta blocket-värdering/i })).toHaveTextContent("Blocket API");

    const blocketLink = screen.getByRole("link", { name: /öppna blocket-sökning/i });
    expect(blocketLink).toHaveTextContent("Blocket.se");
    expect(blocketLink).toHaveAttribute("href", expect.stringContaining("https://www.blocket.se/mobility/search/car"));
  });
});
