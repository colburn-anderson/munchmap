import "server-only";

/**
 * Optional AI query interpretation (OpenAI). Turns free text like
 * "cheap late-night vegan tacos in Midtown" into structured filters.
 *
 * Entirely optional: with no OPENAI_API_KEY, or if the call fails or takes
 * longer than AI_TIMEOUT_MS, search falls back to the chip filters alone.
 */

const AI_TIMEOUT_MS = 4000;

export type AiFilters = {
  search_text?: string; // the food part of the query, with location/time/price words removed
  location_text?: string;
  open_now?: boolean;
  open_after?: string;
  price_min?: number;
  price_max?: number;
  cuisines?: string[];
  diets?: string[];
  hide_chains?: boolean;
};

const SYSTEM_PROMPT = `You convert natural-language restaurant queries into JSON filters for Munchmap.
Return ONLY a JSON object with any of these keys (omit keys you can't infer):
- search_text: string — the food/vibe part of the query, stripped of location, time and price words (e.g. "vegan tacos")
- location_text: string — an explicit place the user named ("Midtown Detroit", "Austin, TX", "48226"). Omit for "near me".
- open_now: boolean — true if they say "open now" / "right now"
- open_after: "HH:MM" 24h — "late night"/"open late" → "22:00"; "after 9" → "21:00"
- price_min, price_max: integers 1..4 — cheap → max 1-2, moderate → 2, upscale/fancy → min 3
- cuisines: string[] — e.g. ["Korean", "Ethiopian"]
- diets: string[] — from Vegan, Vegetarian, Gluten-free, Halal, Kosher, Keto, Dairy-free
- hide_chains: boolean — true if they say "local", "no chains", "independent", "hole in the wall"`;

function clampPrice(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(4, Math.round(n))) : undefined;
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return out.length ? out.slice(0, 5) : undefined;
}

function sanitize(raw: Record<string, unknown>): AiFilters {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
  const openAfter = str(raw.open_after);
  return {
    search_text: str(raw.search_text),
    location_text: str(raw.location_text),
    open_now: raw.open_now === true ? true : undefined,
    open_after: openAfter && /^([01]\d|2[0-3]):[0-5]\d$/.test(openAfter) ? openAfter : undefined,
    price_min: clampPrice(raw.price_min),
    price_max: clampPrice(raw.price_max),
    cuisines: strList(raw.cuisines),
    diets: strList(raw.diets),
    hide_chains: raw.hide_chains === true ? true : undefined,
  };
}

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Result of interpretation; `error` is a short, non-secret reason when AI was skipped or failed. */
export type AiResult = { filters: AiFilters | null; error?: string };

export async function interpretQuery(query: string): Promise<AiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { filters: null, error: "not_configured" };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      // OpenAI error codes like "insufficient_quota" or "model_not_found" are safe to surface.
      const body = await res.json().catch(() => null);
      const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
      console.warn(`[ai] OpenAI HTTP ${res.status} ${code ?? ""}; falling back to classic filters`);
      return { filters: null, error: `http_${res.status}${code ? `_${code}` : ""}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { filters: null, error: "empty_response" };
    return { filters: sanitize(JSON.parse(content)) };
  } catch (e) {
    console.warn("[ai] interpretation failed; falling back to classic filters:", e instanceof Error ? e.message : e);
    return { filters: null, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "request_failed" };
  }
}
