# ~/Desktop/munchmap/api/app/routes_search.py
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Query, HTTPException
from .utils_google import (
    geocode_location,
    places_text_search,
    place_details_opening_hours,
    haversine_km,
)
import os
import re
from collections import Counter

router = APIRouter(prefix="/api", tags=["search"])

from time import time
from typing import Any, Tuple

_CACHE: dict[Tuple[Any, ...], tuple[float, dict]] = {}
TTL_SEC = 120

def cache_get(key: Tuple[Any, ...]):
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, data = hit
    if time() - ts > TTL_SEC:
        _CACHE.pop(key, None)
        return None
    return data

def cache_set(key: Tuple[Any, ...], data: dict):
    _CACHE[key] = (time(), data)


# A tiny blacklist to catch known large chains (extend as needed)
CHAIN_BLACKLIST = {
    "mcdonalds", "starbucks", "taco bell", "wendys", "burger king", "subway",
    "dominos", "little caesars", "kfc", "chipotle", "panera", "dunkin",
    "tim hortons", "pf changs", "p.f. chang's", "p f changs", "panda express",
    "olive garden", "applebee's", "chilies", "chili's", "five guys", "popeyes",
    "red lobster", "red robin", "raising cane's", "shake shack", "wingstop",
}

def norm_brand(name: str) -> str:
    s = re.sub(r"['']", "", name.lower())
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

@router.get("/search")
def search(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_m: int = Query(5000, ge=100, le=50000),
    open_now: bool = False,
    open_after: Optional[str] = None,  # "HH:MM" 24h (best-effort)
    price_min: int = Query(0, ge=0, le=4),
    price_max: int = Query(4, ge=0, le=4),
    cuisines: Optional[str] = None,    # comma-separated
    diets: Optional[str] = None,       # comma-separated
    hide_chains: bool = False,
    hide_large_chains: bool = False,
    max_locations: int = 5,
    query: Optional[str] = None,       # free-text query from UI
) -> Dict[str, Any]:
    """
    Google Places Text Search wrapper. Returns normalized results.
    """

    gkey = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not gkey:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_MAPS_API_KEY")

    radius_m_for_key = int(radius_m)

    # BUG FIX 1: build the text query BEFORE using it in the cache key
    q_parts: List[str] = ["restaurants"]
    if query:
        q_parts.append(query)
    if cuisines:
        q_parts.append(cuisines.replace(",", " "))
    if diets:
        q_parts.append(diets.replace(",", " "))
    text_query = " ".join(q_parts)

    ckey = ("search", text_query.strip(), (location or "").strip(), bool(open_now), radius_m_for_key)
    _cached = cache_get(ckey)
    if _cached:
        print("cache_hit search", ckey)
        return _cached

    # 1) Resolve coordinates
    if lat is None or lng is None:
        if not location:
            location = "Detroit, MI"
        _geo_key = ("geocode", (location or "").strip())
        _geo_cached = cache_get(_geo_key)
        if _geo_cached:
            lat, lng = _geo_cached["lat"], _geo_cached["lng"]
        else:
            lat, lng = geocode_location(location, gkey) or (42.3314, -83.0458)
            cache_set(_geo_key, {"lat": lat, "lng": lng})

    # 2) Call Text Search
    raw = places_text_search(
        query=text_query,
        lat=lat, lng=lng, radius_m=radius_m,
        open_now=open_now,
        price_min=price_min, price_max=price_max,
        api_key=gkey
    )

    status = raw.get("status")
    if status and status not in ("OK", "ZERO_RESULTS"):
        msg = f"Google Text Search error: {status} {raw.get('error_message', '')}".strip()
        print("GOOGLE_ERROR:", msg)
        raise HTTPException(status_code=502, detail=msg)

    places = raw.get("results", [])

    # 3) Normalize + optional details fetch for open_after
    results: List[Dict[str, Any]] = []
    ids_for_hours: List[str] = []

    for p in places:
        place_id = p.get("place_id")
        name = p.get("name", "")
        addr = p.get("formatted_address") or p.get("vicinity") or ""
        price = p.get("price_level")
        rating = p.get("rating")
        user_ratings_total = p.get("user_ratings_total", 0)
        open_now_flag = p.get("opening_hours", {}).get("open_now")

        dist_km = haversine_km(lat, lng, p["geometry"]["location"]["lat"], p["geometry"]["location"]["lng"])

        types = p.get("types", [])
        cuisines_list = []
        for t in types:
            t2 = t.replace("_", " ").title()
            if t2 not in cuisines_list and t not in ("restaurant", "food", "point of interest", "establishment"):
                cuisines_list.append(t2)

        item = {
            "place_id": place_id,
            "name": name,
            "address": addr,
            "rating": rating,
            "user_ratings_total": user_ratings_total,
            "price_level": price,
            "open_now": open_now_flag,
            "cuisines": cuisines_list[:6],
            "distance_km": dist_km,
        }
        results.append(item)
        if open_after:
            ids_for_hours.append(place_id)

    # 4) Best-effort "open_after" filtering
    if open_after:
        ids_for_hours = ids_for_hours[:20]
        hours_map = place_details_opening_hours(ids_for_hours, gkey)
        filtered = []
        hh, mm = map(int, open_after.split(":"))
        minutes_target = hh * 60 + mm

        from datetime import datetime
        today_idx = (datetime.utcnow().weekday() + 1) % 7

        for r in results:
            oh = hours_map.get(r["place_id"])
            ok = True
            # BUG FIX 2: parentheses around the first condition to avoid NoneType.get() crash
            if oh and ("periods" in oh.get("current_opening_hours", oh) or "periods" in oh.get("regular_opening_hours", oh)):
                oh_obj = oh.get("current_opening_hours") or oh.get("regular_opening_hours") or {}
                periods = oh_obj.get("periods", [])
                ok = False
                for per in periods:
                    o = per.get("open", {}); c = per.get("close", {})
                    if o.get("day") == today_idx and c.get("day") == today_idx:
                        try:
                            om = int(o.get("time", "0000")[:2]) * 60 + int(o.get("time", "0000")[2:])
                            cm = int(c.get("time", "0000")[:2]) * 60 + int(c.get("time", "0000")[2:])
                            if om <= minutes_target <= cm:
                                ok = True; break
                        except Exception:
                            pass
            if ok:
                filtered.append(r)
        results = filtered

    # 5) Hide chains
    counts = Counter(norm_brand(r["name"]) for r in results if r.get("name"))
    final: List[Dict[str, Any]] = []
    for r in results:
        brand = norm_brand(r["name"])
        r["brand_key"] = brand
        if hide_chains and counts[brand] >= 2:
            continue
        if hide_large_chains:
            if counts[brand] > max_locations:
                continue
            if brand in CHAIN_BLACKLIST:
                continue
        final.append(r)

    print("results_count:", len(final))

    center = {"lat": lat, "lng": lng}
    # BUG FIX 3: return `final` (chain-filtered) not raw `results`
    resp = {"center": center, "results": final}
    cache_set(ckey, resp)
    return resp
