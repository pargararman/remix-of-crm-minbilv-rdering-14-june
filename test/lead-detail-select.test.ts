import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "..", "src", "lib", "leads-detail.functions.ts"), "utf8");

describe("lead detail vehicle select", () => {
  it("loads drive_type so the overview Blocket validation can see Drivhjul", () => {
    const vehicleSelect = source.match(/\.from\("vehicles"\)\s*\.select\("([^"]+)"\)/s)?.[1];
    expect(vehicleSelect).toContain("drive_type");
  });
});
