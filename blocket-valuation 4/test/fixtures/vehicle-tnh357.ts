// Test vehicle for the Blocket eval run.
//
// Source of truth: Biluppgifter for plate TNH357
//   https://biluppgifter.se/fordon/tnh357/
// Header: "Volvo XC90 II T8 Polestar AWD, 303hk, 2019"
// VIN:    YV1LFBMUDK1432465
//
// The `vehicle` object below uses the EXACT field names + enum values of the
// CRM `vehicles` table, so the same object can be used to populate the CRM
// fields for the test lead and to drive the valuation provider.

import type { ValuationVehicle } from "../../src/lib/valuation/types";

export const TNH357_REGNR = "TNH357";
export const TNH357_VIN = "YV1LFBMUDK1432465";

/** Maps 1:1 onto the CRM `vehicles` table columns. */
export const TNH357_VEHICLE: ValuationVehicle & {
  registration_number: string;
  horsepower: number;
} = {
  registration_number: TNH357_REGNR,
  brand: "Volvo",
  model: "XC90",
  version: "T8 Polestar AWD",
  year: 2019,
  mileage_mil: 14255, // Mätarställning: 14 255 mil  (= 142 550 km)
  fuel: "plugin_bensin", // Bränsle: "Bensin, El" => T8 = plug-in hybrid bensin
  gearbox: "automatisk", // Växellåda: Automat
  drive_type: "fyrhjulsdrift", // Drivhjul: 4WD / AWD
  body_type: "suv", // XC90 = SUV
  horsepower: 303, // Hästkrafter: 303 HK
};

/**
 * Extra Biluppgifter facts that have NO dedicated column in the `vehicles`
 * table. Kept here for traceability / to drop into a notes field if wanted.
 */
export const TNH357_EXTRA_INFO = {
  color: "Grå", // Färg
  type: "Personbil", // Typ
  co2_g_per_km: 199, // Utsläpp
  consumption_l_per_100km: 7.8, // Förbrukning
  owners: 4, // Brukare: 4 Ägare
  history_events: 17, // I Historiken: 17 Händelser
} as const;
