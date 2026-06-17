// Fordon-enums som matchar Blockets etiketter exakt.

export const FUEL_OPTIONS = [
  { value: "bensin", label: "Bensin" },
  { value: "diesel", label: "Diesel" },
  { value: "el", label: "El" },
  { value: "etanol", label: "Etanol (FFV, E85)" },
  { value: "fordonsgas", label: "Fordonsgas (CNG)" },
  { value: "hybrid_bensin", label: "Hybrid bensin" },
  { value: "hybrid_diesel", label: "Hybrid diesel" },
  { value: "hybrid_gas", label: "Hybrid gas" },
  { value: "plugin_bensin", label: "Plug-in Bensin (laddhybrid)" },
  { value: "plugin_diesel", label: "Plug-in Diesel (laddhybrid)" },
  { value: "okant", label: "Okänt" },
] as const;

export const BODY_TYPE_OPTIONS = [
  { value: "sedan", label: "Sedan" },
  { value: "kombi", label: "Kombi" },
  { value: "suv", label: "SUV" },
  { value: "halvkombi_5d", label: "Halvkombi 5-dörrar" },
  { value: "halvkombi_3d", label: "Halvkombi 3-dörrar" },
  { value: "coupe", label: "Coupé" },
  { value: "cabriolet", label: "Cabriolet" },
  { value: "familjebuss", label: "Familjebuss" },
  { value: "pickup", label: "Pickup" },
  { value: "skapbil", label: "Skåpbil" },
  { value: "annat", label: "Annat" },
  { value: "okant", label: "Okänt" },
] as const;

export const GEARBOX_OPTIONS = [
  { value: "automatisk", label: "Automatisk" },
  { value: "manuell", label: "Manuell" },
  { value: "sekventiell", label: "Sekventiell" },
  { value: "okant", label: "Okänt" },
] as const;

export const DRIVE_OPTIONS = [
  { value: "framhjulsdrift", label: "Framhjulsdrift" },
  { value: "fyrhjulsdrift", label: "Fyrhjulsdrift" },
  { value: "bakhjulsdrift", label: "Bakhjulsdrift" },
  { value: "tvahjulsdriven", label: "Tvåhjulsdriven (vet ej bak/fram)" },
  { value: "okant", label: "Okänt" },
] as const;

export const FUEL_VALUES = FUEL_OPTIONS.map((o) => o.value);
export const BODY_TYPE_VALUES = BODY_TYPE_OPTIONS.map((o) => o.value);
export const GEARBOX_VALUES = GEARBOX_OPTIONS.map((o) => o.value);
export const DRIVE_VALUES = DRIVE_OPTIONS.map((o) => o.value);
