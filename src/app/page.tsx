"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ResultsList from "./components/ResultsList";
import type { AppliedFilters, Place, SearchResponse, Unit } from "@/lib/types";

/* ---------- helpers ---------- */
type Theme = "system" | "light" | "dark";
const unitLabel = (u: Unit) => (u === "mi" ? "mi" : "km");
const toMeters = (value: number, unit: Unit) =>
  Math.round(value * (unit === "mi" ? 1609.34 : 1000));

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", !!isDark);
  try { localStorage.setItem("mm_theme", theme); } catch {}
}

/** Fetch JSON with a hard timeout so UI never hangs; surfaces the API's error message. */
async function fetchJSONWithTimeout<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("Search timed out — try again.");
    throw e;
  } finally {
    clearTimeout(id);
  }
}

function describeFilters(f: AppliedFilters): string {
  const parts = [`“${f.query}”`];
  if (f.open_now) parts.push("open now");
  if (f.open_after) parts.push(`open at ${f.open_after}`);
  if (f.price_min !== undefined || f.price_max !== undefined) {
    const lo = Math.max(1, f.price_min ?? 1), hi = f.price_max ?? 4;
    parts.push(lo === hi ? "$".repeat(lo) : `${"$".repeat(lo)}–${"$".repeat(hi)}`);
  }
  if (f.hide_chains) parts.push("no chains");
  return parts.join(" · ");
}

/* ---------- tiny chip ---------- */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full px-3 py-1.5 text-sm transition border " +
        (active
          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400/30"
          : "bg-black/5 text-neutral-700 hover:bg-black/10 border-black/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 dark:border-white/10")
      }
    >
      {children}
    </button>
  );
}

/* ================================================================== */

export default function Home() {
  /* location + radius */
  const [locationText, setLocationText] = useState("Detroit, MI");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [unit, setUnit] = useState<Unit>("mi");
  const [radiusValue, setRadiusValue] = useState(5); // in current unit

  /* simple toggles (no checkboxes) */
  const [tOpenNow, setTOpenNow] = useState(false);
  const [tNoChains, setTNoChains] = useState(true);
  const [tLateNight, setTLateNight] = useState(false); // maps to open_after=22:00
  const [tVegan, setTVegan] = useState(false);         // maps to diets=Vegan
  const [tBudget, setTBudget] = useState(false);       // price <= 2
  const [tFancy, setTFancy] = useState(false);         // price >= 3

  /* theme + ui state */
  const [theme, setTheme] = useState<Theme>("dark");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [raw, setRaw] = useState<SearchResponse | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const radiusMeters = useMemo(() => toMeters(radiusValue, unit), [radiusValue, unit]);

  /* persist unit/theme */
  useEffect(() => {
    try {
      const savedUnit = localStorage.getItem("mm_unit");
      const savedTheme = localStorage.getItem("mm_theme");
      if (savedUnit === "mi" || savedUnit === "km") setUnit(savedUnit);
      if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mm_unit", unit); } catch {}
  }, [unit]);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // Follow OS changes while on "System".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  /* ⌘K / Ctrl+K focuses the search box, Esc closes settings */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      } else if (e.key === "Escape") {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* geolocation */
  const locateMe = () => {
    if (coords) {
      setCoords(null); // toggle back to the typed location
      return;
    }
    if (!navigator.geolocation) {
      setError("Geolocation not supported by this browser.");
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? "Location permission denied — type a city or ZIP instead." : err.message || "Failed to get location");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  /* main search */
  const runSearch = async () => {
    if (loading) return;
    const q = query.trim();
    if (!q) {
      setError("Type something to search");
      searchInput.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    setResults([]);
    setApplied(null);
    setRaw(null);
    try {
      const params = new URLSearchParams({
        query: q,
        hide_chains: String(tNoChains),
        open_now: String(tOpenNow),
      });
      if (tLateNight) params.set("open_after", "22:00");
      if (tVegan) params.set("diets", "Vegan");
      if (tBudget && !tFancy) { params.set("price_min", "1"); params.set("price_max", "2"); }
      if (tFancy && !tBudget) { params.set("price_min", "3"); params.set("price_max", "4"); }

      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
        params.set("radius_m", String(radiusMeters));
      } else {
        params.set("location", locationText);
      }

      const json = await fetchJSONWithTimeout<SearchResponse>(`/api/search?${params.toString()}`);
      setRaw(json);
      if (!json.ok) throw new Error(json.error);

      setResults(json.results);
      setApplied(json.filters);
      if (json.results.length === 0) {
        setNotice("No results. Try broadening filters or radius.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to search");
    } finally {
      setLoading(false);
    }
  };

  /* slider bounds by unit */
  const rangeMin = unit === "mi" ? 1 : 2;
  const rangeMax = unit === "mi" ? 25 : 40;

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 text-neutral-900 dark:from-neutral-950 dark:to-neutral-900 dark:text-white">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-16">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-emerald-500 dark:text-emerald-400">Munch</span>map
          </h1>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full px-3 py-1.5 border border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 transition"
            aria-label="Open settings"
          >
            ⚙️ Settings
          </button>
        </header>

        {/* Hero Search */}
        <section className="rounded-3xl border border-black/10 bg-white/70 dark:border-white/10 dark:bg-neutral-900/60 backdrop-blur p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-medium text-neutral-800 dark:text-neutral-200 mb-4">
            Find a spot you’ll actually love.
          </h2>

          {/* Big search input */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                ref={searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g., late-night vegan tacos, cozy Korean BBQ, cheap Ethiopian"
                aria-label="What are you hungry for?"
                className="w-full rounded-xl bg-white border border-black/10 dark:bg-neutral-950 dark:border-white/10 px-4 py-3 pr-12 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-600">⌘K</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={locateMe}
                disabled={locating}
                className="rounded-xl border border-black/10 bg-black/5 hover:bg-black/10 dark:border-white/10 px-3 py-3 dark:bg-white/5 dark:hover:bg-white/10 text-sm disabled:opacity-50"
              >
                {locating ? "Locating…" : coords ? "📍 Using your location" : "Use my location"}
              </button>
              <button
                onClick={runSearch}
                className="rounded-xl px-4 py-3 bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-black text-sm font-medium dark:hover:bg-neutral-200 transition disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {/* Minimal, tasteful chips (no checkboxes) */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip active={tOpenNow} onClick={() => setTOpenNow(v => !v)}>Open now</Chip>
            <Chip active={tNoChains} onClick={() => setTNoChains(v => !v)}>No chains</Chip>
            <Chip active={tLateNight} onClick={() => setTLateNight(v => !v)}>Late night</Chip>
            <Chip active={tVegan} onClick={() => setTVegan(v => !v)}>Vegan</Chip>
            <Chip active={tBudget} onClick={() => { setTBudget(v => !v); setTFancy(false); }}>Budget</Chip>
            <Chip active={tFancy} onClick={() => { setTFancy(v => !v); setTBudget(false); }}>Fancy</Chip>
          </div>

          {/* Location / Radius – compact row */}
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            {!coords ? (
              <div className="flex items-center gap-2">
                <span className="w-24 text-sm text-neutral-600 dark:text-neutral-300">Location</span>
                <input
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Detroit, MI or 48226"
                  aria-label="Location"
                  className="flex-1 rounded-lg bg-white border border-black/10 dark:bg-neutral-950 dark:border-white/10 px-3 py-2 placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-24 text-sm text-neutral-600 dark:text-neutral-300">Radius</span>
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  step={1}
                  value={Math.min(Math.max(radiusValue, rangeMin), rangeMax)}
                  onChange={(e) => setRadiusValue(Number(e.target.value))}
                  aria-label="Search radius"
                  className="accent-emerald-500"
                />
                <span className="text-sm text-neutral-600 dark:text-neutral-300">
                  {radiusValue} {unitLabel(unit)}
                </span>
                <button
                  onClick={() => setCoords(null)}
                  className="ml-2 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  Type a location instead
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">Units</span>
                <div className="inline-flex rounded-full bg-black/5 dark:bg-white/5 p-0.5">
                  <button
                    onClick={() => setUnit("mi")}
                    className={`px-2 py-1 rounded-full ${unit === "mi" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200" : "text-neutral-600 dark:text-neutral-300"}`}
                  >
                    mi
                  </button>
                  <button
                    onClick={() => setUnit("km")}
                    className={`px-2 py-1 rounded-full ${unit === "km" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200" : "text-neutral-600 dark:text-neutral-300"}`}
                  >
                    km
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="mt-8" aria-live="polite">
          {error && <div className="mb-3 text-rose-600 dark:text-rose-400 text-sm">Error: {error}</div>}
          {applied && (
            <p className="mb-3 text-xs text-neutral-500">
              {applied.ai && <span className="text-emerald-600 dark:text-emerald-400">✨ AI · </span>}
              {describeFilters(applied)} · {results.length} result{results.length === 1 ? "" : "s"}
            </p>
          )}
          {notice && <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">{notice}</p>}
          {loading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Searching…</p>
          ) : (
            !notice && <ResultsList results={results} unit={unit} />
          )}
          {raw && process.env.NODE_ENV === "development" && (
            <details className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
              <summary className="cursor-pointer">Debug: raw /api/search JSON</summary>
              <pre className="mt-2 p-3 bg-white border border-black/10 dark:bg-neutral-950 dark:border-white/10 rounded overflow-auto">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>

      {/* Settings slide-over (kept minimal) */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="fixed right-0 top-0 h-full w-80 max-w-[90%] bg-white dark:bg-neutral-950 z-50 shadow-2xl border-l border-black/10 dark:border-white/10 p-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              <section>
                <h3 className="text-sm font-medium mb-2">Theme</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="theme" checked={theme === "system"} onChange={() => setTheme("system")} />
                    System
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="theme" checked={theme === "light"} onChange={() => setTheme("light")} />
                    Light
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="theme" checked={theme === "dark"} onChange={() => setTheme("dark")} />
                    Dark
                  </label>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-2">About</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Munchmap uses AI + real data to surface small spots you’ll love.</p>
              </section>
            </div>

            <div className="mt-6">
              <button onClick={() => setShowSettings(false)} className="w-full rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-black py-2 dark:hover:bg-neutral-200 transition">
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
