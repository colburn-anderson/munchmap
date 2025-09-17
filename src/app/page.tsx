"use client";

import { useEffect, useMemo, useState } from "react";
import ResultsList from "./components/ResultsList";
import type { Place, Unit } from "./components/RestaurantCard";

/* ---------- helpers ---------- */
const KM_TO_MI = 0.621371;
const unitLabel = (u: Unit) => (u === "mi" ? "mi" : "km");
const toMeters = (value: number, unit: Unit) =>
  Math.round(value * (unit === "mi" ? 1609.34 : 1000));

function applyTheme(theme: "system" | "light" | "dark") {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", !!isDark);
  localStorage.setItem("mm_theme", theme);
}

/** Fetch JSON with a hard timeout so UI never hangs */
async function fetchJSONWithTimeout<T = any>(
  url: string,
  timeoutMs = 8000,
  init?: RequestInit
): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
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
      className={
        "rounded-full px-3 py-1.5 text-sm transition " +
        (active
          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
          : "bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/10")
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
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
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
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const radiusMeters = useMemo(() => toMeters(radiusValue, unit), [radiusValue, unit]);

  /* persist unit/theme */
  useEffect(() => {
    try {
      const savedUnit = (localStorage.getItem("mm_unit") as Unit) || "mi";
      const savedTheme = (localStorage.getItem("mm_theme") as "system" | "light" | "dark") || "system";
      setUnit(savedUnit);
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mm_unit", unit); } catch {}
  }, [unit]);
  useEffect(() => { applyTheme(theme); }, [theme]);

  /* geolocation */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported by this browser.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      (err) => setError(err.message || "Failed to get location"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* main search: call ONLY /api/search (remove /api/ai/search dependency) */
  const runSearch = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const q = query.trim();

      // Build classic params from current UI controls
      const params = new URLSearchParams({
        hide_chains: String(tNoChains),
        open_now: String(tOpenNow),
      });

      if (tLateNight) params.set("open_after", "22:00");
      if (tVegan) params.set("diets", "Vegan");

      // price: budget (<=2) or fancy (>=3). If both selected, keep defaults (0..4)
      if (tBudget && !tFancy) { params.set("price_max", "2"); params.set("price_min", "0"); }
      if (tFancy && !tBudget) { params.set("price_min", "3"); params.set("price_max", "4"); }

      if (q) params.set("query", q);

      if (lat !== null && lng !== null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        params.set("radius_m", String(radiusMeters));
      } else {
        params.set("location", locationText);
      }

      const classic = await fetchJSONWithTimeout<{ results?: Place[] }>(
        `/api/search?` + params.toString(),
        8000
      );

      setResults((classic.results || []) as Place[]);
    } catch (e: any) {
      setError(e?.message || "Failed to search");
    } finally {
      setLoading(false);
    }
  };

  /* slider bounds by unit */
  const rangeMin = unit === "mi" ? 1 : 2;
  const rangeMax = unit === "mi" ? 25 : 40;

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-950 to-neutral-900 text-white">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-16">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-emerald-400">Munch</span>map
          </h1>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full px-3 py-1.5 border border-white/15 hover:bg-white/5 transition"
            aria-label="Open settings"
          >
            ⚙️ Settings
          </button>
        </header>

        {/* Hero Search */}
        <section className="rounded-3xl border border-white/10 bg-neutral-900/60 backdrop-blur p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-medium text-neutral-200 mb-4">
            Find a spot you’ll actually love.
          </h2>

          {/* Big search input */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g., late-night vegan tacos, cozy Korean BBQ, cheap Ethiopian"
                className="w-full rounded-xl bg-neutral-950 border border-white/10 px-4 py-3 pr-12 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600">⌘K</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={useMyLocation}
                className="rounded-xl border border-white/10 px-3 py-3 bg-white/5 hover:bg-white/10 text-sm"
              >
                Use my location
              </button>
              <button
                onClick={runSearch}
                className="rounded-xl px-4 py-3 bg-white text-black text-sm font-medium hover:bg-neutral-200 transition disabled:opacity-50"
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
            <Chip active={tBudget} onClick={() => setTBudget(v => !v)}>Budget</Chip>
            <Chip active={tFancy} onClick={() => setTFancy(v => !v)}>Fancy</Chip>
          </div>

          {/* Location / Radius – compact row */}
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr,auto] md:items-center">
            {!lat && !lng ? (
              <div className="flex items-center gap-2">
                <span className="w-24 text-sm text-neutral-300">Location</span>
                <input
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="Detroit, MI or 48226"
                  className="flex-1 rounded-lg bg-neutral-950 border border-white/10 px-3 py-2 placeholder:text-neutral-600"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-24 text-sm text-neutral-300">Radius</span>
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  step={1}
                  value={radiusValue}
                  onChange={(e) => setRadiusValue(Number(e.target.value))}
                />
                <span className="text-sm text-neutral-300">
                  {radiusValue} {unitLabel(unit)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-300">Units</span>
                <div className="inline-flex rounded-full bg-white/5 p-0.5">
                  <button
                    onClick={() => setUnit("mi")}
                    className={`px-2 py-1 rounded-full ${unit === "mi" ? "bg-emerald-500/20 text-emerald-200" : "text-neutral-300"}`}
                  >
                    mi
                  </button>
                  <button
                    onClick={() => setUnit("km")}
                    className={`px-2 py-1 rounded-full ${unit === "km" ? "bg-emerald-500/20 text-emerald-200" : "text-neutral-300"}`}
                  >
                    km
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="mt-8">
          {error && <div className="mb-3 text-rose-400 text-sm">Error: {error}</div>}
          <ResultsList results={results} unit={unit} />
        </section>
      </div>

      {/* Settings slide-over (kept minimal) */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} aria-hidden />
          <div className="fixed right-0 top-0 h-full w-80 max-w-[90%] bg-neutral-950 z-50 shadow-2xl border-l border-white/10 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="px-2 py-1 rounded hover:bg-white/5"
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
                <p className="text-sm text-neutral-400">Munchmap uses AI + real data to surface small spots you’ll love.</p>
              </section>
            </div>

            <div className="mt-6">
              <button onClick={() => setShowSettings(false)} className="w-full rounded-lg bg-white text-black py-2 hover:bg-neutral-200 transition">
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
