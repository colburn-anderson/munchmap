import "server-only";
import type { Place } from "./types";
import { priceLevelToNumber, type GooglePlace, type LatLng, type OpeningPeriod } from "./google";

/* ---------- distance ---------- */

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- chains ---------- */

export function normBrand(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Known large chains. Entries are normalized the same way as place names.
const CHAIN_BLACKLIST = new Set(
  [
    "McDonald's", "Starbucks", "Taco Bell", "Wendy's", "Burger King", "Subway",
    "Domino's", "Domino's Pizza", "Little Caesars", "KFC", "Chipotle", "Chipotle Mexican Grill",
    "Panera Bread", "Panera", "Dunkin'", "Dunkin", "Tim Hortons", "P.F. Chang's", "Panda Express",
    "Olive Garden", "Applebee's", "Chili's", "Five Guys", "Popeyes", "Red Lobster", "Red Robin",
    "Raising Cane's", "Shake Shack", "Wingstop", "Pizza Hut", "Papa John's", "Arby's",
    "Jimmy John's", "Jersey Mike's", "Culver's", "Buffalo Wild Wings", "IHOP", "Denny's",
    "Texas Roadhouse", "Cracker Barrel", "Outback Steakhouse", "Chick-fil-A", "Sonic Drive-In",
    "Jack in the Box", "Qdoba", "Noodles & Company", "Potbelly", "Qdoba Mexican Eats",
    "Olga's Kitchen", "Bob Evans", "Steak 'n Shake", "White Castle", "Hooters", "TGI Fridays",
    "Cheesecake Factory", "The Cheesecake Factory", "Waffle House", "Del Taco", "Carl's Jr.",
    "Hardee's", "Dairy Queen", "Firehouse Subs", "Zaxby's", "Bojangles", "Whataburger",
    "In-N-Out Burger", "Longhorn Steakhouse", "Ruby Tuesday", "Marco's Pizza", "sweetgreen",
  ].map(normBrand)
);

function isKnownChain(brand: string): boolean {
  if (CHAIN_BLACKLIST.has(brand)) return true;
  // "Taco Bell Cantina", "Starbucks Reserve", "Subway #1234"...
  for (const chain of CHAIN_BLACKLIST) {
    if (brand.startsWith(chain + " ")) return true;
  }
  return false;
}

/**
 * Drop known chains, plus any brand that shows up more than once in this
 * result set (a strong local signal that it's a multi-location chain).
 */
export function removeChains(places: Place[]): Place[] {
  const counts = new Map<string, number>();
  for (const p of places) counts.set(p.brand_key!, (counts.get(p.brand_key!) ?? 0) + 1);
  return places.filter((p) => !isKnownChain(p.brand_key!) && (counts.get(p.brand_key!) ?? 0) < 2);
}

/* ---------- opening hours ---------- */

const WEEK = 7 * 24 * 60;

/**
 * Is the place open at `hhmm` (venue-local) today? Handles overnight hours
 * (e.g. 6pm–2am) and 24/7 places. Returns undefined when Google has no hours.
 */
export function isOpenAt(
  periods: OpeningPeriod[] | undefined,
  utcOffsetMinutes: number | undefined,
  hhmm: string,
  now = new Date()
): boolean | undefined {
  if (!periods?.length) return undefined;

  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;

  // Day of week where the venue is (0 = Sunday, same as Google).
  const local = new Date(now.getTime() + (utcOffsetMinutes ?? 0) * 60_000);
  const target = local.getUTCDay() * 1440 + h * 60 + m;

  for (const p of periods) {
    // A single period with no close means open 24 hours, every day.
    if (!p.close) return true;
    const open = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    let close = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (close <= open) close += WEEK; // wraps past Saturday night
    for (const t of [target, target + WEEK]) {
      if (t >= open && t < close) return true;
    }
  }
  return false;
}

/* ---------- normalization ---------- */

const GENERIC_TYPES = new Set([
  "restaurant", "food", "point_of_interest", "establishment", "store", "food_store",
  "meal_takeaway", "meal_delivery", "service", "health",
]);

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "mexican_restaurant" → "Mexican", "coffee_shop" → "Coffee Shop" */
function cuisinesFromTypes(g: GooglePlace): string[] {
  const out: string[] = [];
  const add = (s?: string) => {
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  for (const t of g.types ?? []) {
    if (GENERIC_TYPES.has(t)) continue;
    add(titleCase(t.replace(/_restaurant$/, "").replace(/_/g, " ")));
  }
  const primary = g.primaryTypeDisplayName?.text;
  if (!out.length && primary && primary.toLowerCase() !== "restaurant") add(primary);
  return out.slice(0, 6);
}

export function toPlace(g: GooglePlace, center?: LatLng): Place {
  const name = g.displayName?.text ?? "Unnamed";
  const location = g.location ? { lat: g.location.latitude, lng: g.location.longitude } : undefined;
  return {
    place_id: g.id,
    name,
    address: g.formattedAddress ?? g.shortFormattedAddress,
    rating: g.rating,
    user_ratings_total: g.userRatingCount ?? 0,
    price_level: priceLevelToNumber(g.priceLevel),
    open_now: g.currentOpeningHours?.openNow ?? g.regularOpeningHours?.openNow,
    cuisines: cuisinesFromTypes(g),
    distance_km: center && location ? haversineKm(center, location) : undefined,
    brand_key: normBrand(name),
    maps_url: g.googleMapsUri,
    location,
  };
}
