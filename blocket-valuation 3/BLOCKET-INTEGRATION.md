# Blocket-API valuation — code integration

This wires the Blocket button on the lead profile to run a **server-side
Blocket-API valuation** and write the result into the pricing fields, replacing
the old "open a blocket.se search link" behaviour.

Push these files to GitHub → Lovable picks them up. No new dependencies, no DB
migration required (uses the existing `vehicles`, `pricing`, `activity_timeline`
tables and the existing save flow).

## Files

New:

```
src/lib/valuation/blocket-provider.ts   # the provider (fetch + parse + percentile range)
src/lib/valuation/blocket-brands.ts     # brand -> Blocket "make" id (Volvo = 0.818)
src/lib/valuation/types.ts              # shared types
src/lib/valuation.functions.ts          # valuateBlocket() TanStack server function
src/components/leads/blocket-valuation-result.tsx  # the result panel UI
```

Modified:

```
src/components/leads/external-buttons.tsx          # Blocket btn -> API mode (with link fallback)
src/components/leads/external-link-logo-button.tsx # supports action-button + spinner
src/components/leads/quick-valuation-panel.tsx     # runs valuation, renders result, applies to pricing
```

Tests / eval (optional to push):

```
test/blocket-eval.ts            test/blocket-provider.test.ts
test/fixtures/vehicle-tnh357.ts test/fixtures/vehicle-zja092.ts
test/fixtures/blocket-xc90-t8.json test/fixtures/blocket-xc90-t8-2023.json
```

## Flow

1. User opens a lead → `QuickValuationPanel`.
2. Clicks the yellow **Blocket** button. Because `quick-valuation-panel` now
   passes `onBlocketValuate`, the button runs the `valuateBlocket` server
   function instead of opening a link (shows a spinner while it runs).
3. `valuateBlocket` (server-side) reads the lead's vehicle, calls
   `valuateWithBlocket` against blocket.se, and returns the range. A best-effort
   `activity_timeline` row is written (`type: "blocket_valuation"`).
4. The **Blocket-värdering (API)** panel appears under the buttons with the
   market range, est. market price (−5%), sample size, confidence and the comps.
5. **Använd i prissättning** writes the spread into the pricing patch
   (`out_price_from/to` = market asking range, `valuation_from/to` = est. −5%
   range for the customer SMS). Then the normal Save bar persists it.

## Backwards compatibility

`ExternalButtons` only switches to API mode when given `onBlocketValuate`. Other
places that render it (lead-card, lead-overview-header) pass no such prop, so the
Blocket button there still opens the blocket.se search link as before.

## Before relying on it beyond Volvo

`make` ids in `blocket-brands.ts` are verified for Volvo/Toyota; check the others
against a live blocket.se URL. Unknown brands safely fall back to free-text
search. The endpoint is unofficial — keep it server-side (it already is) and
tune the 5% asking→sold discount in `valuateWithBlocket` to your real buy-in
margin.
