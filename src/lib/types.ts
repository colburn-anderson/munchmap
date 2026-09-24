export type Unit = "mi" | "km";

/** A restaurant as returned by /api/search and rendered by RestaurantCard. */
export type Place = {
  place_id: string;
  name: string;
  address?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number; // 0..4, same scale as the old Google API
  open_now?: boolean;
  cuisines?: string[];
  distance_km?: number;
  brand_key?: string;
  maps_url?: string;
  location?: { lat: number; lng: number };
};

/** The filters actually applied to a search (echoed back so the UI can show them). */
export type AppliedFilters = {
  query: string;
  location_text?: string;
  open_now: boolean;
  open_after?: string; // "HH:MM" in the venue's local time
  price_min?: number;
  price_max?: number;
  diets: string[];
  cuisines: string[];
  hide_chains: boolean;
  radius_m: number;
  ai: boolean; // whether the AI interpreter contributed
  ai_error?: string; // short reason AI was skipped/failed, e.g. "http_429_insufficient_quota"
};

export type SearchResponse =
  | {
      ok: true;
      count: number;
      center?: { lat: number; lng: number };
      filters: AppliedFilters;
      results: Place[];
    }
  | { ok: false; error: string };

export type ReviewResponse =
  | {
      ok: true;
      place_id: string;
      blurb: string | null;
      source: "google_editorial" | "google_review" | "none";
      author?: string;
      rating?: number;
      relative_time?: string;
    }
  | { ok: false; error: string };
