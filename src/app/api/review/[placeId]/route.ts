import { NextResponse } from "next/server";
import { ConfigError, UpstreamError, placeDetails, type GooglePlace } from "@/lib/google";
import { TTLCache } from "@/lib/cache";
import type { ReviewResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new TTLCache<ReviewResponse>(24 * 60 * 60 * 1000);

function firstSentence(s: string, maxLen = 180): string {
  const text = s.trim().replace(/\s+/g, " ");
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.length > maxLen ? first.slice(0, maxLen - 1).trimEnd() + "…" : first;
}

function extractBlurb(placeId: string, g: GooglePlace): ReviewResponse {
  const editorial = g.editorialSummary?.text;
  if (editorial) {
    return { ok: true, place_id: placeId, blurb: firstSentence(editorial), source: "google_editorial" };
  }
  // Prefer a positive review with actual text for the "vibe".
  const reviews = (g.reviews ?? []).filter((r) => (r.text?.text || r.originalText?.text || "").trim());
  const r = reviews.find((x) => (x.rating ?? 0) >= 4) ?? reviews[0];
  if (r) {
    return {
      ok: true,
      place_id: placeId,
      blurb: firstSentence(r.text?.text || r.originalText?.text || ""),
      source: "google_review",
      author: r.authorAttribution?.displayName,
      rating: r.rating,
      relative_time: r.relativePublishTimeDescription,
    };
  }
  return { ok: true, place_id: placeId, blurb: null, source: "none" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) {
    return NextResponse.json<ReviewResponse>({ ok: false, error: "Invalid place id" }, { status: 400 });
  }

  const cached = cache.get(placeId);
  if (cached) return NextResponse.json(cached);

  try {
    const g = await placeDetails(placeId, "editorialSummary,reviews");
    const payload = extractBlurb(placeId, g);
    cache.set(placeId, payload);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof ConfigError) {
      return NextResponse.json<ReviewResponse>({ ok: false, error: err.message }, { status: 500 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json<ReviewResponse>({ ok: false, error: err.message }, { status: 502 });
    }
    console.error("[review] unexpected error", err);
    return NextResponse.json<ReviewResponse>({ ok: false, error: "Couldn't load reviews" }, { status: 500 });
  }
}
