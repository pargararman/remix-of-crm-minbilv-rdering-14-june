import type { ValuationVehicle } from "@/lib/valuation/types";

type VehiclePatch = Partial<
  ValuationVehicle & {
    inspection_until: string | null;
    equipment_notes: string | null;
    fuel_needs_review: boolean;
    body_type_needs_review: boolean;
  }
>;

export interface BiluppgifterLookupResult {
  ok: boolean;
  patch: VehiclePatch;
  rawVehicle: unknown | null;
  sourceUrl: string | null;
  warnings: string[];
  error?: string;
}

const DEFAULT_BASE_URL = "https://data.biluppgifter.se";
const DEFAULT_PATH = "/api/v1/vehicle/regno/{regno}";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o");
}

function vehicleFromPayload(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  const direct = payload.vehicle;
  if (isRecord(direct)) return direct;
  const data = payload.data;
  if (isRecord(data)) {
    if (isRecord(data.vehicle)) return data.vehicle;
    if (isRecord(data.attributes)) return data.attributes;
  }
  return payload;
}

function splitModelAndVersion(args: {
  make: string | null;
  model: string | null;
  marketName: string | null;
  name: string | null;
  variant: string | null;
  version: string | null;
}): { model: string | null; version: string | null } {
  const modelSource = args.marketName ?? args.model ?? args.name;
  if (!modelSource) return { model: null, version: args.variant ?? args.version };

  let cleaned = modelSource.trim();
  if (args.make) {
    cleaned = cleaned.replace(new RegExp(`^${args.make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { model: null, version: args.variant ?? args.version };

  const model =
    /^[a-z]{1,4}\d{1,3}$/i.test(words[0]) ||
    /^[a-z]{1,4}$/i.test(words[0]) ||
    /^\d{1,3}[a-z]?$/i.test(words[0])
      ? words[0]
      : words.slice(0, Math.min(2, words.length)).join(" ");

  const inferredVersion = words.slice(model.split(/\s+/).length).join(" ").trim();
  const version = [args.variant, args.version, inferredVersion || null]
    .filter((v): v is string => !!v && norm(v) !== norm(model))
    .join(" ")
    .trim();

  return { model, version: version || null };
}

function mapTransmission(value: unknown): VehiclePatch["gearbox"] | undefined {
  const v = norm(value);
  if (!v) return undefined;
  if (v.includes("automat") || v.includes("variomatic")) return "automatisk";
  if (v.includes("manuell") || v.includes("manual")) return "manuell";
  return "okant";
}

function mapBodyType(vehicle: Record<string, unknown>): { body_type?: VehiclePatch["body_type"]; review?: boolean } {
  const technical = isRecord(vehicle.technical) ? vehicle.technical : {};
  const chassi = Array.isArray(technical.chassi) ? technical.chassi.map(norm).join(" ") : norm(technical.chassi);
  const hay = norm(`${vehicle.model ?? ""} ${vehicle.market_name ?? ""} ${vehicle.name ?? ""} ${vehicle.variant ?? ""} ${chassi}`);

  if (hay.includes("cabriolet")) return { body_type: "cabriolet" };
  if (hay.includes("kupe") || hay.includes("coupe")) return { body_type: "coupe" };
  if (hay.includes("pickup")) return { body_type: "pickup" };
  if (hay.includes("skapbil") || hay.includes("skap")) return { body_type: "skapbil" };
  if (hay.includes("sedan")) return { body_type: "sedan" };
  if (
    /\b(xc40|xc60|xc90|x1|x2|x3|x4|x5|x6|x7|q2|q3|q4|q5|q7|q8)\b/.test(hay) ||
    /\b(suv|rav4|tiguan|touareg|kodiaq|karoq|sportage|sorento|tucson|santa fe|cx-3|cx-5|cx-7|cx-9|glc|gle|gla|glb|gls)\b/.test(hay)
  ) {
    return { body_type: "suv" };
  }
  if (hay.includes("halvkombi")) return { body_type: "halvkombi_5d", review: true };
  if (hay.includes("kombi") || hay.includes("stationsvagn")) return { body_type: "kombi" };
  if (hay.includes("personbefordran") || hay.includes("minibuss") || hay.includes("familjebuss")) {
    return { body_type: "familjebuss" };
  }
  return {};
}

function mapDriveType(vehicle: Record<string, unknown>): VehiclePatch["drive_type"] | undefined {
  const technical = isRecord(vehicle.technical) ? vehicle.technical : {};
  if (technical.four_wheel_drive === true) return "fyrhjulsdrift";
  const hay = norm(`${vehicle.name ?? ""} ${vehicle.model ?? ""} ${vehicle.market_name ?? ""} ${vehicle.variant ?? ""} ${vehicle.version ?? ""}`);
  if (/\b(awd|4wd|4x4|quattro|xdrive|4motion|fyrhjul)\b/.test(hay)) return "fyrhjulsdrift";
  if (/\b(fwd|framhjul)\b/.test(hay)) return "framhjulsdrift";
  if (/\b(rwd|bakhjul)\b/.test(hay)) return "bakhjulsdrift";
  return undefined;
}

function mapFuel(vehicle: Record<string, unknown>): VehiclePatch["fuel"] | undefined {
  const technical = isRecord(vehicle.technical) ? vehicle.technical : {};
  const drives = Array.isArray(technical.drive) ? technical.drive.filter(isRecord) : [];
  const fuels = drives.map((d) => norm(d.fuel)).filter(Boolean);
  const hay = norm(
    `${vehicle.name ?? ""} ${vehicle.model ?? ""} ${vehicle.market_name ?? ""} ${vehicle.variant ?? ""} ${vehicle.version ?? ""} ${technical.electric_vehicle_configuration ?? ""} ${fuels.join(" ")}`,
  );

  const hasElectric = fuels.some((f) => f.includes("el")) || hay.includes(" el") || hay.includes("laddhybrid") || hay.includes("plugin");
  const hasPetrol = fuels.some((f) => f.includes("bensin")) || hay.includes("bensin");
  const hasDiesel = fuels.some((f) => f.includes("diesel")) || hay.includes("diesel");
  const isPlugin = hay.includes("laddhybrid") || hay.includes("plug") || hay.includes("recharge") || /\bt[68]\b/.test(hay);

  if (hasElectric && hasPetrol) return isPlugin ? "plugin_bensin" : "hybrid_bensin";
  if (hasElectric && hasDiesel) return isPlugin ? "plugin_diesel" : "hybrid_diesel";
  if (hasElectric) return "el";
  if (hasPetrol) return "bensin";
  if (hasDiesel) return "diesel";
  if (fuels.some((f) => f.includes("etanol"))) return "etanol";
  if (fuels.some((f) => f.includes("gas") || f.includes("cng") || f.includes("lng") || f.includes("metan"))) return "fordonsgas";
  return undefined;
}

function meterKmToMil(value: number | null): number | null {
  if (value == null || value <= 0) return null;
  return Math.round(value / 10);
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^\d{4}-\d{2}-\d{2}/);
  return m?.[0] ?? null;
}

export function mapBiluppgifterVehicle(payload: unknown): BiluppgifterLookupResult {
  const vehicle = vehicleFromPayload(payload);
  if (!vehicle) {
    return { ok: false, patch: {}, rawVehicle: null, sourceUrl: null, warnings: [], error: "Tomt Biluppgifter-svar" };
  }

  const technical = isRecord(vehicle.technical) ? vehicle.technical : {};
  const drives = Array.isArray(technical.drive) ? technical.drive.filter(isRecord) : [];
  const firstDrive = drives[0] ?? {};
  const make = firstString(vehicle.make, vehicle.brand, vehicle.manufacturer);
  const { model, version } = splitModelAndVersion({
    make,
    model: firstString(vehicle.model),
    marketName: firstString(vehicle.market_name),
    name: firstString(vehicle.name),
    variant: firstString(vehicle.variant),
    version: firstString(vehicle.version),
  });
  const body = mapBodyType(vehicle);

  const patch: VehiclePatch = {};
  if (make) patch.brand = make;
  if (model) patch.model = model;
  if (version) patch.version = version;
  const year = firstNumber(vehicle.model_year, vehicle.vehicle_year);
  if (year && year > 1900) patch.year = year;
  const mileage = meterKmToMil(firstNumber(vehicle.meter));
  if (mileage) patch.mileage_mil = mileage;
  const fuel = mapFuel(vehicle);
  if (fuel) patch.fuel = fuel;
  const gearbox = mapTransmission(vehicle.transmission);
  if (gearbox) patch.gearbox = gearbox;
  const drive = mapDriveType(vehicle);
  if (drive) patch.drive_type = drive;
  if (body.body_type) patch.body_type = body.body_type;
  if (body.review) patch.body_type_needs_review = true;
  const horsepower = firstNumber(vehicle.power_hp, firstDrive.power_hp);
  if (horsepower && horsepower > 0) patch.horsepower = Math.round(horsepower);
  const inspectionUntil = isoDate(vehicle.inspection_valid_until);
  if (inspectionUntil) patch.inspection_until = inspectionUntil;

  const notes = [
    firstString(vehicle.vin) ? `VIN: ${firstString(vehicle.vin)}` : null,
    firstString(vehicle.exterior_color, vehicle.color) ? `Färg: ${firstString(vehicle.exterior_color, vehicle.color)}` : null,
    firstNumber(vehicle.no_users) != null ? `Antal brukare/ägare: ${firstNumber(vehicle.no_users)}` : null,
  ].filter(Boolean);
  if (notes.length > 0) patch.equipment_notes = notes.join("\n");

  const warnings: string[] = [];
  if (!patch.fuel) warnings.push("Biluppgifter saknade tolkningsbart drivmedel.");
  if (!patch.drive_type) warnings.push("Biluppgifter saknade tolkningsbara drivhjul.");
  if (!patch.body_type) warnings.push("Biluppgifter saknade tolkningsbar karosstyp.");
  if (!patch.horsepower) warnings.push("Biluppgifter saknade hästkrafter.");

  return {
    ok: Object.keys(patch).length > 0,
    patch,
    rawVehicle: vehicle,
    sourceUrl: firstString(vehicle.regnr) ? `https://biluppgifter.se/fordon/${vehicle.regnr}` : null,
    warnings,
  };
}

export async function fetchBiluppgifterByRegnr(regnr: string): Promise<BiluppgifterLookupResult> {
  const token = process.env.BILUPPGIFTER_API_TOKEN ?? process.env.BILUPPGIFTER_TOKEN;
  if (!token) {
    return {
      ok: false,
      patch: {},
      rawVehicle: null,
      sourceUrl: null,
      warnings: [],
      error: "BILUPPGIFTER_API_TOKEN saknas",
    };
  }

  const baseUrl = (process.env.BILUPPGIFTER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const path = process.env.BILUPPGIFTER_VEHICLE_PATH ?? DEFAULT_PATH;
  const url = `${baseUrl}${path.replace("{regno}", encodeURIComponent(regnr))}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "MinBilVardering CRM",
      },
    });

    if (!res.ok) {
      const snippet = await res.text().then((t) => t.replace(/\s+/g, " ").slice(0, 300)).catch(() => "");
      return {
        ok: false,
        patch: {},
        rawVehicle: null,
        sourceUrl: null,
        warnings: [],
        error: `Biluppgifter svarade ${res.status}${snippet ? `: ${snippet}` : ""}`,
      };
    }

    return mapBiluppgifterVehicle(await res.json());
  } catch (error) {
    return {
      ok: false,
      patch: {},
      rawVehicle: null,
      sourceUrl: null,
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
