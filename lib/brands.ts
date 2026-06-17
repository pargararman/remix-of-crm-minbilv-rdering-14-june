// Märken som Blocket har riktiga filter för.
// Källa: Blockets "Märke och modell"-filter.
export const BLOCKET_BRANDS_TOP = [
  "Audi",
  "BMW",
  "Chevrolet",
  "Citroen",
  "Ford",
  "Hyundai",
  "Kia",
  "Mazda",
  "Mercedes-Benz",
  "Nissan",
  "Opel",
  "Peugeot",
  "Porsche",
  "Renault",
  "Seat",
  "Skoda",
  "Subaru",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

export const BLOCKET_BRANDS_OTHER = [
  "Alfa Romeo",
  "Aston Martin",
  "Bentley",
  "Cadillac",
  "Chrysler",
  "Dacia",
  "Daewoo",
  "DS",
  "Ferrari",
  "Fiat",
  "Honda",
  "Jaguar",
  "Jeep",
  "Lamborghini",
  "Lancia",
  "Land Rover",
  "Lexus",
  "Lotus",
  "Maserati",
  "Maybach",
  "MG",
  "Mini",
  "Mitsubishi",
  "Polestar",
  "Rolls-Royce",
  "Rover",
  "Saab",
  "Smart",
  "SsangYong",
  "Suzuki",
  "Tesla",
] as const;

export const BLOCKET_BRANDS_ALL = [...BLOCKET_BRANDS_TOP, ...BLOCKET_BRANDS_OTHER].sort((a, b) =>
  a.localeCompare(b, "sv"),
);

const KNOWN = new Set(BLOCKET_BRANDS_ALL.map((b) => b.toLowerCase()));

export function isKnownBlocketBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  return KNOWN.has(brand.trim().toLowerCase());
}

/**
 * Returnerar Blockets slug för ett känt märke. Slugen används i deras `make`-filter.
 * Okänt märke → null (fall tillbaka på fri text-sökning).
 */
export function blocketBrandSlug(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const b = brand.trim();
  if (!isKnownBlocketBrand(b)) return null;
  // Blocket: lowercase, mellanslag → "-", behåll bindestreck.
  return b.toLowerCase().replace(/\s+/g, "-");
}
