import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
// Hard fail if the key isn’t set in Production to avoid “it looks like it worked”
function requireKey() {
  if (!KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.");
  }
  return KEY!;
}

/**
 * Accepts your UI’s params:
 * - query: string (required)
 * - lat,lng: numbers (optional; if present, we’ll bias with &location and use &radius)
 * - radius_m: number in meters (optional; default 5000)
 * - open_now: "true"|"false"
 * - price_min, price_max: "0".."4" (Google price levels)
 * - diets: string (e.g. "Vegan") — we add it to the query text so Google ranks for it
 * - hide_chains: "true"|"false" (we can’t tell from Text Search reliably; leaving untampered)
 * - location: string (fallback text like “Detroit, MI” if lat/lng not provided — appended to query)
 */
export async function GET(req: Request) {
  try {
    const key = requireKey();

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") || searchParams.get("q") || "").trim();
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius_m = Number(searchParams.get("radius_m") || "5000"); // default 5km
    const open_now = (searchParams.get("open_now") || "false").toLowerCase() === "true";
    const price_min = searchParams.get("price_min");
    const price_max = searchParams.get("price_max");
    const diets = (searchParams.get("diets") || "").trim();
    const locationText = (searchParams.get("location") || "").trim();

    if (!query) {
      // Treat empty query as user error (your UI already blocks this)
      return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });
    }

    // Build the textsearch query
    const qParts: string[] = [query];
    if (diets) qParts.push(diets);           // e.g., “vegan tacos”
    if (!lat || !lng) {
      // No coordinates → append user’s location text into query (e.g., “pizza detroit mi”)
      if (locationText) qParts.push(locationText);
    }
    // You could also add “restaurant” to bias toward places
    qParts.push("restaurant");

    const params = new URLSearchParams();
    params.set("query", qParts.join(" ").replace(/\s+/g, " "));
    params.set("key", key);

    // Bias with coordinates + radius if provided
    if (lat && lng) {
      params.set("location", `${lat},${lng}`);
      // Google caps radius for textsearch at ~50,000m; clamp to safe range
      const r = Math.max(1000, Math.min(radius_m || 5000, 50000));
      params.set("radius", String(r));
    }

    // Price filters (0..4). Google supports minprice & maxprice for Text Search.
    // Only set when provided; otherwise Google will use all levels.
    if (price_min && /^[0-4]$/.test(price_min)) params.set("minprice", price_min);
    if (price_max && /^[0-4]$/.test(price_max)) params.set("maxprice", price_max);

    // Open now filter
    if (open_now) params.set("opennow", "true");

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
    const resp = await fetch(url, { cache: "no-store" });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ ok: false, error: `Google Places HTTP ${resp.status}: ${text}` }, { status: 502 });
    }

    const data = await resp.json();

    // Handle common Google status responses
    // https://developers.google.com/maps/documentation/places/web-service/search-text#PlacesTextSearchStatus
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { ok: false, error: `Google Places status ${data.status}: ${data.error_message || "No message"}` },
        { status: 502 }
      );
    }

    const results = Array.isArray(data.results) ? data.results : [];
    // Map to a clean, stable shape your UI can consume
    const mapped = results.map((p: any) => ({
      place_id: p.place_id,
      name: p.name,
      formatted_address: p.formatted_address,
      rating: p.rating,
      price_level: p.price_level,
      user_ratings_total: p.user_ratings_total,
      open_now: p.opening_hours?.open_now ?? undefined,
      location: p.geometry?.location ? { lat: p.geometry.location.lat, lng: p.geometry.location.lng } : undefined,
      types: p.types,
    }));

    return NextResponse.json({
      ok: true,
      query,
      count: mapped.length,
      results: mapped,
      google_status: data.status,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
