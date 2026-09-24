"use client";
import { useState } from "react";
import type { Place, ReviewResponse, Unit } from "@/lib/types";

export type { Place, Unit };

const KM_TO_MI = 0.621371;
const fmtDistance = (km?: number, unit: Unit = "mi") => {
  if (km === undefined || km >= 1e8) return "";
  const v = unit === "mi" ? km * KM_TO_MI : km;
  return `${v.toFixed(1)} ${unit}`;
};

type Blurb = Extract<ReviewResponse, { ok: true }>;

export default function RestaurantCard({ place, unit }: { place: Place; unit: Unit }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<Blurb | null>(null);
  const [blurbErr, setBlurbErr] = useState<string | null>(null);

  const loadBlurb = async () => {
    if (loading || review) return;
    setLoading(true);
    setBlurbErr(null);
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(place.place_id)}`);
      const data = (await res.json().catch(() => null)) as ReviewResponse | null;
      if (!data) throw new Error(`HTTP ${res.status}`);
      if (!data.ok) throw new Error(data.error);
      setReview(data);
    } catch (e) {
      setBlurbErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const mapsSearchUrl =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [place.name, place.address].filter(Boolean).join(" ")
    )}&query_place_id=${encodeURIComponent(place.place_id)}`;
  const detailsUrl = place.maps_url ?? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`;

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-black/10 bg-white/80 backdrop-blur p-4 hover:border-black/20 shadow-lg dark:border-white/10 dark:bg-neutral-900/60 dark:hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{place.name}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{place.address}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-amber-500 dark:text-amber-400 font-medium">
            {place.rating ? place.rating.toFixed(1) : "—"} <span className="text-xs text-neutral-500 dark:text-neutral-400">({place.user_ratings_total ?? 0})</span>
          </div>
          {typeof place.price_level === "number" && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{"$".repeat(place.price_level || 0) || "—"}</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {place.open_now !== undefined && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${place.open_now ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300"}`}>
            {place.open_now ? "Open now" : "Closed"}
          </span>
        )}
        {place.cuisines?.slice(0, 3).map((c) => (
          <span key={c} className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-xs text-neutral-600 dark:bg-white/5 dark:text-neutral-300">
            {c}
          </span>
        ))}
        {place.distance_km !== undefined && (
          <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">~{fmtDistance(place.distance_km, unit)} away</span>
        )}
      </div>

      {/* Blurb */}
      <div className="mt-3">
        {blurbErr ? (
          <div className="text-xs text-rose-600 dark:text-rose-400">{blurbErr}</div>
        ) : review?.blurb ? (
          <p className="italic text-sm text-neutral-600 dark:text-neutral-300">
            “{review.blurb}”
            {review.author && (
              <span className="not-italic text-xs text-neutral-500"> — {review.author}{review.relative_time ? `, ${review.relative_time}` : ""}</span>
            )}
          </p>
        ) : review ? (
          <p className="text-xs text-neutral-500">No review snippet yet.</p>
        ) : (
          <button
            onClick={loadBlurb}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-4 disabled:opacity-60"
          >
            {loading ? "Loading vibe…" : "Show vibe"}
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <a
          className="inline-flex items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-black text-sm px-3 py-1.5 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition"
          href={mapsSearchUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maps
        </a>
        <a
          className="inline-flex items-center justify-center rounded-lg border border-black/15 dark:border-white/15 text-sm px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition"
          href={detailsUrl}
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
