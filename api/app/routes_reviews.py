# ~/Desktop/munchmap/api/app/routes_reviews.py
import os, time, re, requests
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["reviews"])

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY")
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# simple in-memory cache (OK for dev)
_REV_CACHE: Dict[str, Dict[str, Any]] = {}
_TTL = 60 * 60 * 24  # 24h

def _first_sentence(s: str, max_len: int = 180) -> str:
    s = (s or "").strip()
    if not s:
        return s
    # take first sentence-ish
    m = re.split(r"(?<=[.!?])\s+", s)
    out = m[0] if m else s
    if len(out) > max_len:
        out = out[: max_len - 1].rstrip() + "…"
    return out

def _extract_blurb(result: Dict[str, Any]) -> Dict[str, Any]:
    # Prefer editorial summary (if Google provides it)
    ed = (result.get("editorial_summary") or {}).get("overview")
    if ed:
        return {"blurb": _first_sentence(ed), "source": "google_editorial"}

    revs = result.get("reviews") or []
    if revs:
        r0 = revs[0]
        text = r0.get("text") or r0.get("original_text", {}).get("text") or ""
        return {
            "blurb": _first_sentence(text),
            "source": "google_review",
            "author": r0.get("author_name"),
            "rating": r0.get("rating"),
            "relative_time": r0.get("relative_time_description"),
        }
    return {"blurb": None, "source": "none"}

@router.get("/review/{place_id}")
def get_review_blurb(place_id: str) -> Dict[str, Any]:
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_API_KEY")

    now = time.time()
    cached = _REV_CACHE.get(place_id)
    if cached and now - cached["ts"] < _TTL:
        return cached["data"]

    params = {
        "place_id": place_id,
        "key": GOOGLE_API_KEY,
        "fields": "editorial_summary,reviews,rating,user_ratings_total",
    }
    d = requests.get(DETAILS_URL, params=params, timeout=12).json()
    if d.get("status") not in (None, "OK"):
        # cache empty-ish to avoid hammering failures
        data = {"place_id": place_id, "blurb": None, "source": "error", "status": d.get("status")}
        _REV_CACHE[place_id] = {"ts": now, "data": data}
        return data

    res = d.get("result") or {}
    payload = {"place_id": place_id, **_extract_blurb(res)}
    _REV_CACHE[place_id] = {"ts": now, "data": payload}
    return payload
