# ~/Desktop/munchmap/api/app/search_core.py
from typing import Dict, Any, List, Optional
from .utils_google import geocode_location, places_text_search, place_details_opening_hours, haversine_km
import os, re
from collections import Counter
from datetime import datetime

def _norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"['’]", "", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

CHAIN_BLACKLIST = {
    "mcdonalds", "starbucks", "taco bell", "wendys", "burger king", "subway",
    "dominos", "little caesars", "kfc", "chipotle", "panera", "dunkin",
    "tim hortons", "pf changs", "p.f. chang's", "p f changs", "panda express",
    "olive garden", "applebee's", "chilies", "chili's", "five guys", "popeyes",
    "red lobster", "red robin", "raising cane's", "shake shack", "wingstop",
}

def run_places_search(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not key:
        raise RuntimeError("Missing GOOGLE_MAPS_API_KEY")

    # Resolve center
    lat = filters.get("lat")
    lng = filters.get("lng")
    if lat is None or lng is None:
        loc_text = filters.get("location_text") or "Detroit, MI"
        gloc = geocode_location(loc_text, key)
        if gloc:
            lat, lng = gloc
        else:
            lat, lng = 42.3314, -83.0458

    radius_km = float(filters.get("radius_km") or 5)
    radius_m = int(radius_km * 1000)

    # Build query
    q_parts = ["restaurants"]
    if filters.get("cuisines"): q_parts.append(" ".join(filters["cuisines"]))
    if filters.get("diets"): q_parts.append(" ".join(filters["diets"]))
    query = " ".join(q_parts)

    data = places_text_search(
        query=query,
        lat=lat, lng=lng, radius_m=radius_m,
        open_now=bool(filters.get("open_now", False)),
        price_min=int(filters.get("price_min", 0)),
        price_max=int(filters.get("price_max", 4)),
        api_key=key
    )
    results = []
    ids = []
    for p in data.get("results", []):
        pid = p.get("place_id")
        addr = p.get("formatted_address") or p.get("vicinity") or ""
        rating = p.get("rating")
        urt = p.get("user_ratings_total", 0)
        price = p.get("price_level")
        open_now = p.get("opening_hours", {}).get("open_now")
        dist_km = haversine_km(lat, lng, p["geometry"]["location"]["lat"], p["geometry"]["location"]["lng"])

        # quick cuisine list from types
        types = p.get("types", [])
        cuisines = []
        for t in types:
            t2 = t.replace("_", " ").title()
            if t not in ("restaurant", "food", "point of interest", "establishment") and t2 not in cuisines:
                cuisines.append(t2)

        results.append({
            "place_id": pid,
            "name": p.get("name", ""),
            "address": addr,
            "rating": rating,
            "user_ratings_total": urt,
            "price_level": price,
            "open_now": open_now,
            "cuisines": cuisines[:6],
            "distance_km": dist_km,
        })
        ids.append(pid)

    # open_after
    if filters.get("open_after"):
        hh, mm = map(int, str(filters["open_after"]).split(":"))
        target = hh * 60 + mm
        today_idx = (datetime.utcnow().weekday() + 1) % 7
        hours_map = place_details_opening_hours(ids[:20], key)
        kept = []
        for r in results:
            oh = hours_map.get(r["place_id"])
            if not oh:
                kept.append(r); continue  # no data; keep
            oh_obj = oh.get("current_opening_hours") or oh.get("regular_opening_hours") or {}
            ok = True
            if "periods" in oh_obj:
                ok = False
                for per in oh_obj["periods"]:
                    o = per.get("open", {}); c = per.get("close", {})
                    if o.get("day") == today_idx and c.get("day") == today_idx:
                        try:
                            om = int(o.get("time", "0000")[:2])*60 + int(o.get("time", "0000")[2:])
                            cm = int(c.get("time", "0000")[:2])*60 + int(c.get("time", "0000")[2:])
                            if om <= target <= cm:
                                ok = True; break
                        except Exception:
                            pass
            if ok:
                kept.append(r)
        results = kept

    # chains
    counts = Counter(_norm(r["name"]) for r in results if r.get("name"))
    hide_chains = bool(filters.get("hide_chains", False))
    hide_large = bool(filters.get("hide_large_chains", True))
    max_loc = int(filters.get("max_locations", 5))

    final = []
    for r in results:
        brand = _norm(r["name"])
        r["brand_key"] = brand
        if hide_chains and counts[brand] >= 2:
            continue
        if hide_large and (counts[brand] > max_loc or brand in CHAIN_BLACKLIST):
            continue
        final.append(r)

    return final
