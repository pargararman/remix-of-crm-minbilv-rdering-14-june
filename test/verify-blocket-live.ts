// Live Blocket verification runner.
// Run in an environment where blocket.se is reachable:
//   npx tsx test/verify-blocket-live.ts
// or:
//   node --experimental-strip-types test/verify-blocket-live.ts

import { buildSearchParams, toQueryString, valuateWithBlocket } from "../src/lib/valuation/blocket-provider";
import { TNH357_VEHICLE } from "./fixtures/vehicle-tnh357";

const params = buildSearchParams(TNH357_VEHICLE);
console.log("Blocket query:", `https://www.blocket.se/mobility/search/api/search/SEARCH_ID_CAR_USED?${toQueryString(params)}`);

const result = await valuateWithBlocket(TNH357_VEHICLE);
console.log(JSON.stringify({
  ok: result.ok,
  note: result.note,
  diagnostics: result.diagnostics,
  totalCount: result.totalCount,
  comparableCount: result.comparableCount,
  dealerCount: result.dealerCount,
  privateCount: result.privateCount,
  sellerTypeAvailable: result.sellerTypeAvailable,
  customerOffer: result.customerOffer,
  firstComps: result.comps.slice(0, 5),
}, null, 2));
