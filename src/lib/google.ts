import "server-only";
import { TTLCache } from "./cache";

/**
 * Google Places API (New) client.
 *
 * The legacy endpoints (maps/api/place/textsearch, details) can no longer be
 * enabled on Google Cloud projects created after March 2025, so everything
 * here uses places.googleapis.com/v1. Only "Places API (New)" needs to be
 * enabled on the key.
 */

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8000;

export class ConfigError extends Error {}
export class UpstreamError extends Error {}

export function googleKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new ConfigError(
      "GOOGLE_MAPS_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy."
    );
  }
  return key;
}

export type LatLng = { lat: number; lng: number };

type Point = { day: number; hour: number; minute: number };
export type OpeningPeriod = { open: Point; close?: Point };

export type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  currentOpeningHours?: { openNow?: boolean; periods?: OpeningPeriod[] };
  regularOpeningHours?: { openNow?: boolean; periods?: OpeningPeriod[] };
  editorialSummary?: { text?: string };
  reviews?: {
    rating?: number;
    relativePublishTimeDescription?: string;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string };
  }[];
};

async function placesFetch<T>(path: string, fieldMask: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey(),
        "X-Goog-FieldMask": fieldMask,
        ...(init.headers || {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    throw new UpstreamError(
      e instanceof Error && e.name === "TimeoutError" ? "Google Places timed out" : "Could not reach Google Places"
    );
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = `${body.error.status ?? res.status}: ${body.error.message}`;
    } catch {}
    throw new UpstreamError(`Google Places error — ${msg}`);
  }
  return (await res.json()) as T;
}

export const PRICE_LEVELS = [
  "PRICE_LEVEL_FREE",
  "PRICE_LEVEL_INEXPENSIVE",
  "PRICE_LEVEL_MODERATE",
  "PRICE_LEVEL_EXPENSIVE",
  "PRICE_LEVEL_VERY_EXPENSIVE",
] as const;

/** "PRICE_LEVEL_MODERATE" → 2 (the 0..4 scale the UI already renders as $$). */
export function priceLevelToNumber(p?: string): number | undefined {
  const i = PRICE_LEVELS.indexOf(p as (typeof PRICE_LEVELS)[number]);
  return i >= 0 ? i : undefined;
}

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.utcOffsetMinutes",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
].join(",");

export async function searchText(opts: {
  textQuery: string;
  center?: LatLng;
  radiusM?: number;
  openNow?: boolean;
  priceMin?: number;
  priceMax?: number;
}): Promise<GooglePlace[]> {
  const body: Record<string, unknown> = {
    textQuery: opts.textQuery,
    includedType: "restaurant",
    pageSize: 20,
  };
  if (opts.center) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.center.lat, longitude: opts.center.lng },
        radius: Math.max(100, Math.min(opts.radiusM ?? 8000, 50000)),
      },
    };
  }
  if (opts.openNow) body.openNow = true;

  if (opts.priceMin !== undefined || opts.priceMax !== undefined) {
    // Google doesn't accept PRICE_LEVEL_FREE as a filter, so the range starts at 1.
    const lo = Math.max(1, opts.priceMin ?? 1);
    const hi = Math.min(4, opts.priceMax ?? 4);
    if (lo <= hi) body.priceLevels = PRICE_LEVELS.slice(lo, hi + 1);
  }

  const data = await placesFetch<{ places?: GooglePlace[] }>("/places:searchText", SEARCH_FIELDS, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.places ?? [];
}

const geocodeCache = new TTLCache<LatLng | null>(24 * 60 * 60 * 1000);

/** Resolve free text like "Detroit, MI" or "48226" to coordinates via Places. */
export async function geocode(text: string): Promise<LatLng | null> {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  const cached = geocodeCache.get(key);
  if (cached !== undefined) return cached;

  const data = await placesFetch<{ places?: GooglePlace[] }>("/places:searchText", "places.location", {
    method: "POST",
    body: JSON.stringify({ textQuery: text, pageSize: 1 }),
  });
  const loc = data.places?.[0]?.location;
  const result = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  geocodeCache.set(key, result);
  return result;
}

export async function placeDetails(placeId: string, fields: string): Promise<GooglePlace> {
  return placesFetch<GooglePlace>(`/places/${encodeURIComponent(placeId)}`, fields);
}
