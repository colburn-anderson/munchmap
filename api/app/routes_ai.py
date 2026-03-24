# ~/Desktop/munchmap/api/app/routes_ai.py
from typing import Optional, Dict, Any
from fastapi import APIRouter, Query
from .ai_models import interpret_query_to_filters
from .search_core import run_places_search
from .semantic_ranker import rerank_semantic

router = APIRouter(prefix="/api/ai", tags=["ai"])

@router.get("/search")
def ai_search(
    q: str = Query(..., description="Free-text dining query"),
    lat: Optional[float] = None,
    lng: Optional[float] = None
) -> Dict[str, Any]:
    filters = interpret_query_to_filters(q, lat, lng)
    candidates = run_places_search(filters)
    ranked = rerank_semantic(q, candidates)
    return {"query": q, "filters": filters, "results": ranked[:40]}
