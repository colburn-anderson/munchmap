"use client";
import { useState } from "react";

export type Unit = "mi" | "km";

export type Place = {
  place_id: string;
  name: string;
  address?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  open_now?: boolean;
  cuisines?: string[];
  distance_km?: number;
  brand_key?: string;
};

const KM_TO_MI = 0.621371;
const fmtDistance = (km?: number, unit: Unit = "mi") => {
  if (km === undefined || km >= 1e8) return "";
  const v = unit === "mi" ? km * KM_TO_MI : km;
  return `${v.toFixed(1)} ${unit}`;
};

export default function RestaurantCard({ place, unit }: { place: Place; unit: Unit }) {
  const [loading, setLoading] = useState(false);
  const [blurb, setBlurb] = useState<string | null>(null);
  const [blurbErr, setBlurbErr] = useState<string | null>(null);

  const loadBlurb = async () => {
    if (loading || blurb) return;
    setLoading(true);
    setBlurbErr(null);
    try {
      const res = await fetch(`/api/review/${place.place_id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBlurb(data?.blurb ?? null);
    } catch (e: any) {
      setBlurbErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur p-4 hover:border-white/20 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{place.name}</h3>
          <p className="text-sm text-neutral-400">{place.address}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-amber-400 font-medium">
            {place.rating ? place.rating.toFixed(1) : "—"} <span className="text-xs text-neutral-400">({place.user_ratings_total ?? 0})</span>
          </div>
          {typeof place.price_level === "number" && (
            <div className="text-xs text-neutral-400 mt-0.5">{"$".repeat(place.price_level || 0) || "—"}</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {place.open_now !== undefined && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${place.open_now ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
            {place.open_now ? "Open now" : "Closed"}
          </span>
        )}
        {place.cuisines?.slice(0, 3).map((c) => (
          <span key={c} className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs text-neutral-300">
            {c}
          </span>
        ))}
        {place.distance_km !== undefined && (
          <span className="ml-auto text-xs text-neutral-400">~{fmtDistance(place.distance_km, unit)} away</span>
        )}
      </div>

      {/* Blurb */}
      <div className="mt-3">
        {!blurb && !blurbErr ? (
          <button
            onClick={loadBlurb}
            className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-4"
          >
            Show vibe
          </button>
        ) : blurbErr ? (
          <div className="text-xs text-rose-400">{blurbErr}</div>
        ) : blurb ? (
          <p className="italic text-sm text-neutral-300">“{blurb}”</p>
        ) : (
          <p className="text-xs text-neutral-500">No review snippet yet.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <a
          className="inline-flex items-center justify-center rounded-lg bg-white text-black text-sm px-3 py-1.5 hover:bg-neutral-200 transition"
          href={`https://www.google.com/maps/search/?api=1&query_place_id=${place.place_id}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maps
        </a>
        <a
          className="inline-flex items-center justify-center rounded-lg border border-white/15 text-sm px-3 py-1.5 hover:bg-white/5 transition"
          href={`https://www.google.com/maps/place/?q=place_id:${place.place_id}`}
          target="_blank"
          rel="noreferrer"
        >
          Details
        </a>
      </div>

      {/* subtle gradient accent */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-400/0 via-emerald-400/30 to-emerald-400/0 opacity-0 group-hover:opacity-100 transition" />
    </li>
  );
}
