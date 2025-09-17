"use client";

import { useState } from "react";

type Result = { place_id: string; name: string; formatted_address?: string; rating?: number };
type ApiResp = { ok: boolean; query: string; results: Result[]; error?: string };

export default function SearchClient() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();                           // ← stop full page reload
    if (!q.trim()) return;
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        method: "GET",
        cache: "no-store",                         // ← avoid stale/SSR caching
      });
      if (!res.ok) throw new Error(await res.text());
      const json: ApiResp = await res.json();
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">MunchMap Search (debug)</h1>
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try: pizza detroit"
          className="border px-3 py-2 rounded w-full"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {err && <div className="text-red-600 text-sm whitespace-pre-wrap">{err}</div>}

      {data && (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Query: <b>{data.query}</b></div>
          {data.results.length === 0 ? (
            <div className="text-sm">No results.</div>
          ) : (
            <ul className="divide-y">
              {data.results.map((r) => (
                <li key={r.place_id} className="py-2">
                  <div className="font-medium">{r.name}</div>
                  {r.formatted_address && (
                    <div className="text-sm text-gray-600">{r.formatted_address}</div>
                  )}
                  {typeof r.rating === "number" && (
                    <div className="text-xs text-gray-500">Rating: {r.rating}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
