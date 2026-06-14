# Blocket valuation — test / eval run setup

This adds a from-scratch **Blocket API valuation provider** plus a **test/eval
run** for plate **TNH357** (the Volvo XC90 from the Biluppgifter screenshot).

It values a car from the asking prices of comparable **live** Blocket listings:
pull comps → take the 25th–75th percentile of asking prices → discount ~5%
(asking > sold) → that's the market range, which can feed the existing
margin/pricing engine to produce a customer offer.

> Scope of this round = **test/eval run setup** (you selected this). The provider
> is included because the eval needs it. Wiring the actual on-screen **Blocket
> button** to call this provider is the next step — see "Next step" below.

## Files added

```
src/lib/valuation/
  blocket-provider.ts     # the provider: build search → fetch → parse → percentile range
  blocket-brands.ts       # brand name → Blocket numeric "make" id (Volvo = 0.818)
  types.ts                # shared types
test/
  blocket-eval.ts         # the eval runner (live or --fixture)
  blocket-provider.test.ts# vitest unit tests (percentile, parsing, valuation)
  fixtures/
    vehicle-tnh357.ts     # TNH357 vehicle, mapped to CRM `vehicles` columns
    blocket-xc90-t8.json  # offline comp fixture (so it runs with no network)
```

No new dependencies. Plain server-side `fetch`; no API key, no token, no Python.

## The test vehicle — TNH357 (matches Biluppgifter + CRM fields)

Source: `https://biluppgifter.se/fordon/tnh357/` — "Volvo XC90 II T8 Polestar AWD,
303hk, 2019", VIN `YV1LFBMUDK1432465`. Mapped to the exact `vehicles` table
columns and enum values:

| CRM field        | Value             | Biluppgifter / screenshot         |
|------------------|-------------------|-----------------------------------|
| `brand`          | `Volvo`           | header                            |
| `model`          | `XC90`            | header                            |
| `version`        | `T8 Polestar AWD` | header                            |
| `year`           | `2019`            | Modellår 2019                     |
| `mileage_mil`    | `14255`           | Mätarställning 14 255 mil          |
| `fuel`           | `plugin_bensin`   | Bränsle: Bensin, El (T8 = laddhybrid) |
| `gearbox`        | `automatisk`      | Växellåda: Automat                |
| `drive_type`     | `fyrhjulsdrift`   | Drivhjul: 4WD                     |
| `body_type`      | `suv`             | XC90 = SUV                        |
| `horsepower`     | `303`             | Hästkrafter: 303 HK              |

Extra Biluppgifter facts with **no matching column** (kept in
`TNH357_EXTRA_INFO` for reference, not written to mismatched fields): Färg Grå,
Typ Personbil, Utsläpp 199 g/km, Förbrukning 7,8 l/100km, 4 ägare, 17 händelser.

## Run the eval

**Offline (fixture) — works anywhere, no network:**
```
npx tsx test/blocket-eval.ts --fixture
```

**Live — in your own environment (Cloudflare / local) where blocket.se is reachable:**
```
npx tsx test/blocket-eval.ts
```

**Unit tests:**
```
npx vitest run test/blocket-provider.test.ts
```

> The sandbox this was built in has no network access to blocket.se, so only the
> fixture run + unit tests were executed here. Run the **live** command in your
> environment to hit the real endpoint.

## Verified result (fixture run)

For TNH357, the provider produced:

```
Search params : q="Volvo XC90", make=0.818, year 2018–2020, mileage 11255–17255 mil, transmission=2 (auto)
Comparable listings : 12
Median asking       : 412 000 kr
Market range (P25–P75 asking) : 386 500 kr – 433 000 kr
Est. sold range (–5% asking)  : 367 200 kr – 411 400 kr
Confidence          : 72%
```

All 12 unit assertions pass (percentile math, defensive price parsing,
param-mapping, valuation pipeline, and the no-comps failure path).

## How it connects to the test account / e2e

`scripts-e2e-test.mjs` already creates a lead via the intake webhook. To run the
full chain on the test account:

1. Create the test lead for TNH357 (e2e script or manually), then set the
   vehicle fields to the values in the table above (or import `TNH357_VEHICLE`).
2. Run the eval — it reads those same attributes and returns the market range.
3. Compare the range to the Bilia screenshot / your expectation to validate.

## Next step — wiring the Blocket button (not in this round)

Today `src/components/leads/external-buttons.tsx` builds a blocket.se **search
URL** via `buildBlocketUrl` (in `src/lib/external-links.ts`). To override that
with the API: expose `valuateWithBlocket` as a TanStack **server function**, call
it on button click for the current lead's vehicle, and show the returned range
(feeding `in_price`/`out_price`). Keep the call server-side. Say the word and I'll
do that wiring.

## Caveats

- Asking price ≠ sold price ≠ buy-in — it's a market signal; the margin engine
  must account for it (the 5% discount is a starting assumption, tune it).
- Unofficial endpoint — can change or rate-limit. Keep it **server-side**, and
  get Blocket's OK before high volume.
- Searches by attributes only, so you need make/model/year/mileage first (from
  Biluppgifter or similar) — which the CRM already collects.
- `blocket-brands.ts` make-ids: Volvo/Toyota verified; others should be checked
  against a live blocket.se URL before relying on them (unknown brand safely
  falls back to free-text search).
