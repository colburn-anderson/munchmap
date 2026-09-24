"use client";
import RestaurantCard from "./RestaurantCard";
import type { Place, Unit } from "@/lib/types";

export default function ResultsList({ results, unit }: { results: Place[]; unit: Unit }) {
  if (!results?.length) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No results yet — try a search.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((r) => (
        <RestaurantCard key={r.place_id} place={r} unit={unit} />
      ))}
    </ul>
  );
}
