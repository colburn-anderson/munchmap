import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports which keys are configured (never their values) so a deploy can be
// sanity-checked by visiting /api/health.
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    google_key: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY),
    ai_key: Boolean(process.env.OPENAI_API_KEY),
  });
}
