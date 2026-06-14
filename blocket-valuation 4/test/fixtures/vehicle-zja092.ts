// Second test vehicle for the Blocket eval run.
//
// Source of truth: Biluppgifter for plate ZJA092
//   https://biluppgifter.se/fordon/zja092/
// Header: "Volvo XC90 II T8 AWD, 310hk, 2023"
// VIN:    YV1LFH5V4P1949645
//
// Field names + enum values match the CRM `vehicles` table exactly.

import type { ValuationVehicle } from "../../src/lib/valuation/types";

export const ZJA092_REGNR = "ZJA092";
export const ZJA092_VIN = "YV1LFH5V4P1949645";

export const ZJA092_VEHICLE: ValuationVehicle & {
  registration_number: string;
  horsepower: number;
} = {
  registration_number: ZJA092_REGNR,
  brand: "Volvo",
  model: "XC90",
  version: "T8 AWD",
  year: 2023,
  mileage_mil: 12816, // Mätarställning: 12 816 mil (= 128 160 km)
  fuel: "plugin_bensin", // Bränsle: "Bensin, El" => T8 = plug-in hybrid bensin
  gearbox: "automatisk", // Växellåda: Automat
  drive_type: "fyrhjulsdrift", // Drivhjul: 4WD / AWD
  body_type: "suv", // XC90 = SUV
  horsepower: 310, // Hästkrafter: 310 HK
};

export const ZJA092_EXTRA_INFO = {
  color: "Grå", // Färg
  type: "Personbil", // Typ
  co2_g_per_km: 32, // Utsläpp
  consumption_l_per_100km: null, // Förbrukning: Okänd
  owners: 4, // Brukare: 4 Ägare
  history_events: 13, // I Historiken: 13 Händelser
} as const;
