import type { NextRequest } from "next/server";

export const runtime = "nodejs";        // ensure Node runtime so localhost calls work
export const dynamic = "force-dynamic"; // no caching in dev

// You can override in web/.env.local as API_BASE=http://127.0.0.1:8000
const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8000";

// Internal helper to forward requests to FastAPI
async function forward(
  req: NextRequest,
  method: string,
  body?: BodyInit | null,
  extraHeaders: HeadersInit = {}
) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\//, ""); // strip leading /api/
  const target = `${API_BASE}/api/${path}${url.search}`;

  // Forward minimal headers (avoid forwarding host/origin)
  const headers: HeadersInit = {
    accept: req.headers.get("accept") || "application/json",
    ...extraHeaders,
  };

  // Note: no 'duplex' needed; Next/Node can handle buffered bodies here.
  const res = await fetch(target, { method, headers, body });

  // Pass through body + a few headers
  const text = await res.text();
  const outHeaders = new Headers();
  ["content-type", "cache-control", "x-chat-model", "x-embed-model"].forEach((k) => {
    const v = res.headers.get(k);
    if (v) outHeaders.set(k, v);
  });

  return new Response(text, { status: res.status, headers: outHeaders });
}

// GET /api/**
export async function GET(req: NextRequest) {
  return forward(req, "GET");
}

// POST /api/**
export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  const ct = req.headers.get("content-type") || "application/json";
  return forward(req, "POST", body, { "content-type": ct });
}

// PUT /api/**
export async function PUT(req: NextRequest) {
  const body = await req.arrayBuffer();
  const ct = req.headers.get("content-type") || "application/json";
  return forward(req, "PUT", body, { "content-type": ct });
}

// DELETE /api/**
export async function DELETE(req: NextRequest) {
  return forward(req, "DELETE");
}

// OPTIONS /api/**
export async function OPTIONS(req: NextRequest) {
  return forward(req, "OPTIONS");
}
