# ~/Desktop/munchmap/api/app/ai_models.py
import json, os
from typing import Dict, Any, Optional
from openai import OpenAI

_client: Optional[OpenAI] = None
def get_client() -> OpenAI:
    global _client
    if _client is None:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("Missing OPENAI_API_KEY")
        _client = OpenAI(api_key=key)
    return _client

APPLY_FILTERS_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_filters",
        "description": "Map a free-text dining query to structured filters.",
        "parameters": {
            "type": "object",
            "properties": {
                "location_text": {"type": "string"},
                "lat": {"type": "number"}, "lng": {"type": "number"},
                "radius_km": {"type": "number", "minimum": 0.5, "maximum": 80},
                "open_now": {"type": "boolean"},
                "open_after": {"type": "string", "pattern": "^[0-2]\\d:[0-5]\\d$"},
                "price_min": {"type": "integer", "minimum": 0, "maximum": 4},
                "price_max": {"type": "integer", "minimum": 0, "maximum": 4},
                "cuisines": {"type": "array", "items": {"type": "string"}},
                "diets": {"type": "array", "items": {"type": "string"}},
                "hide_chains": {"type": "boolean"},
                "hide_large_chains": {"type": "boolean"},
                "max_locations": {"type": "integer", "minimum": 1, "maximum": 100}
            },
            "required": []
        }
    }
}

SYSTEM_PROMPT = """You convert natural-language food queries into structured filters for Munchmap.
- If user hints 'no chains' / 'local' set hide_large_chains=true and max_locations=5.
- 'open late' → open_after=22:00 if no time given.
- Price words: cheap=$ (0-1), moderate=$$ (2), expensive=$$$ (3), very expensive=$$$$ (4).
- Diets: Vegan, Vegetarian, Gluten-free, Halal, Kosher, Keto/Low-carb, Organic, Dairy-free, High-protein, Paleo.
- If user says 'near me' and coords exist, prefer radius_km 5–10; else provide location_text.
Return ONLY a tool call to apply_filters. Use reasonable defaults if vague.
"""

def interpret_query_to_filters(query: str, lat: Optional[float], lng: Optional[float]) -> Dict[str, Any]:
    client = get_client()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query}
    ]
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=[APPLY_FILTERS_TOOL],
        tool_choice="auto",
        temperature=0.2,
    )
    choice = resp.choices[0]
    calls = getattr(choice.message, "tool_calls", None)
    if not calls:
        return {"price_min": 0, "price_max": 4}

    try:
        data = json.loads(calls[0].function.arguments)
    except Exception:
        data = {}

    if lat is not None and lng is not None:
        data.setdefault("lat", lat); data.setdefault("lng", lng)
    data.setdefault("hide_large_chains", True)
    data.setdefault("max_locations", 5)
    return data
