import { NextResponse } from "next/server";
import { ConfigError, UpstreamError, geocode, googleKey, searchText, type LatLng } from "@/lib/google";
import { isOpenAt, removeChains, toPlace } from "@/lib/search";
import { interpretQuery } from "@/lib/ai";
import type { AppliedFilters, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RADIUS_M = 8047; // 5 mi

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function priceParam(v: string | null): number | undefined {
  return v && /^[0-4]$/.test(v) ? Number(v) : undefined;
}

function list(v: string | null): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function uniqCI(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fail(status: number, error: string) {
  return NextResponse.json<SearchResponse>({ ok: false, error }, { status });
}

/**
 * GET /api/search
 *   query (or q)            free text, required
 *   lat, lng                user coordinates (from "Use my location")
 *   location                fallback text location, e.g. "Detroit, MI" or "48226"
 *   radius_m                search radius in meters (default ~5 mi)
 *   open_now                "true" | "false"
 *   open_after              "HH:MM", venue-local (the "Late night" chip sends 22:00)
 *   price_min, price_max    0..4
 *   diets                   comma-separated, e.g. "Vegan"
 *   hide_chains             "true" | "false"
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = (sp.get("query") || sp.get("q") || "").trim().slice(0, 200);
  if (!query) return fail(400, "Type something to search");

  try {
    googleKey(); // fail fast with a clear message if the env var is missing

    const lat = num(sp.get("lat"));
    const lng = num(sp.get("lng"));
    const gps: LatLng | undefined =
      lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
    const boxLocation = (sp.get("location") || "").trim().slice(0, 120);
    const radiusM = Math.max(500, Math.min(num(sp.get("radius_m")) ?? DEFAULT_RADIUS_M, 50000));

    // AI interpretation and geocoding the location box are independent, so run them together.
    const [aiResult, boxCenter] = await Promise.all([
      interpretQuery(query),
      !gps && boxLocation ? geocode(boxLocation) : Promise.resolve(null),
    ]);
    const ai = aiResult.filters;

    // A place named in the query ("tacos in Austin") beats the location box and GPS.
    let center: LatLng | undefined = gps ?? boxCenter ?? undefined;
    let locationText = gps ? undefined : boxLocation || undefined;
    if (ai?.location_text) {
      const aiCenter = await geocode(ai.location_text);
      if (aiCenter) {
        center = aiCenter;
        locationText = ai.location_text;
      }
    }

    const diets = uniqCI([...list(sp.get("diets")), ...(ai?.diets ?? [])]);
    const cuisines = uniqCI(ai?.cuisines ?? []);
    const priceMin = priceParam(sp.get("price_min")) ?? ai?.price_min;
    const priceMax = priceParam(sp.get("price_max")) ?? ai?.price_max;
    const openNow = sp.get("open_now") === "true" || ai?.open_now === true;
    const openAfter = sp.get("open_after")?.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0] ?? ai?.open_after;
    const hideChains = sp.get("hide_chains") === "true" || ai?.hide_chains === true;

    // Build the text Google ranks against: "vegan tacos in Detroit, MI"
    const base = ai?.search_text || query;
    const extras = [...diets, ...cuisines].filter((w) => !base.toLowerCase().includes(w.toLowerCase()));
    let textQuery = [...extras, base].join(" ");
    if (locationText && !textQuery.toLowerCase().includes(locationText.toLowerCase())) {
      textQuery += ` in ${locationText}`;
    }

    const raw = await searchText({ textQuery, center, radiusM, openNow, priceMin, priceMax });

    let kept = raw.filter((g) => g.businessStatus !== "CLOSED_PERMANENTLY" && g.businessStatus !== "CLOSED_TEMPORARILY");
    if (openAfter) {
      // Only keep places whose hours confirm they're open at that time tonight.
      kept = kept.filter(
        (g) =>
          isOpenAt(
            (g.regularOpeningHours ?? g.currentOpeningHours)?.periods,
            g.utcOffsetMinutes,
            openAfter
          ) === true
      );
    }

    let results = kept.map((g) => toPlace(g, center));
    if (hideChains) results = removeChains(results);

    const filters: AppliedFilters = {
      query: textQuery,
      location_text: locationText,
      open_now: openNow,
      open_after: openAfter,
      price_min: priceMin,
      price_max: priceMax,
      diets,
      cuisines,
      hide_chains: hideChains,
      radius_m: radiusM,
      ai: ai !== null,
      ai_error: aiResult.error,
    };

    return NextResponse.json<SearchResponse>({ ok: true, count: results.length, center, filters, results });
  } catch (err) {
    if (err instanceof ConfigError) return fail(500, err.message);
    if (err instanceof UpstreamError) return fail(502, err.message);
    console.error("[search] unexpected error", err);
    return fail(500, "Something went wrong while searching. Please try again.");
  }
}
