# ~/Desktop/munchmap/api/app/utils_google.py
from typing import Optional, Dict, Any, List, Tuple
import requests, math

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

def geocode_location(location_text: str, api_key: str) -> Optional[Tuple[float, float]]:
    r = requests.get(GEOCODE_URL, params={"address": location_text, "key": api_key}, timeout=20)
    j = r.json()
    if j.get("status") != "OK" or not j.get("results"):
        return None
    loc = j["results"][0]["geometry"]["location"]
    return (loc["lat"], loc["lng"])

def places_text_search(
    query: str,
    lat: float, lng: float, radius_m: int,
    open_now: bool,
    price_min: int, price_max: int,
    api_key: str
) -> Dict[str, Any]:
    params = {
        "query": query,
        "location": f"{lat},{lng}",
        "radius": str(radius_m),
        "key": api_key,
    }
    if open_now:
        params["opennow"] = "true"
    # minprice/maxprice are supported by Text Search (0..4)
    params["minprice"] = str(price_min)
    params["maxprice"] = str(price_max)

    r = requests.get(TEXTSEARCH_URL, params=params, timeout=20)
    data = r.json()
    # optionally page through next_page_token if needed (skipped for MVP)
    return data

def place_details_opening_hours(place_ids: List[str], api_key: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for pid in place_ids:
        r = requests.get(DETAILS_URL, params={
            "place_id": pid,
            "fields": "opening_hours",
            "key": api_key
        }, timeout=20)
        j = r.json()
        if j.get("status") == "OK":
            out[pid] = j.get("result", {}).get("opening_hours", {})
    return out

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlmb/2)**2
    return 2*R*math.asin(math.sqrt(a))
