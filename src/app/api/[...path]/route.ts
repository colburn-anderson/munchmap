import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

type Place = {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) {
      return NextResponse.json({ ok: true, query: q, results: [] });
    }

    // Real data if you set GOOGLE_MAPS_API_KEY in Vercel env
    if (GOOGLE_MAPS_API_KEY) {
      const url =
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
        + `?query=${encodeURIComponent(q)}`
        + `&key=${GOOGLE_MAPS_API_KEY}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: await r.text() },
          { status: 502 }
        );
      }
      const data = await r.json();
      const results: Place[] = (data.results || []).map((p: any) => ({
        place_id: p.place_id,
        name: p.name,
        formatted_address: p.formatted_address,
        rating: p.rating,
      }));
      return NextResponse.json({ ok: true, query: q, results });
    }

    // Fallback demo so UI still works without a key
    return NextResponse.json({
      ok: true,
      query: q,
      results: [
        { place_id: "demo-1", name: `Demo: ${q}`, formatted_address: "—", rating: 4.6 },
      ],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
