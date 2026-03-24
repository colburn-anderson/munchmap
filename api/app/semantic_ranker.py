# ~/Desktop/munchmap/api/app/semantic_ranker.py
import os, math
from typing import List, Dict, Any
from openai import OpenAI

_client: OpenAI | None = None
def get_client() -> OpenAI:
    global _client
    if _client is None:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("Missing OPENAI_API_KEY")
        _client = OpenAI(api_key=key)
    return _client

def _embed(texts: List[str]) -> List[List[float]]:
    client = get_client()
    out = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in out.data]

def _cos(a: List[float], b: List[float]) -> float:
    dot = sum(x*y for x,y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a)) or 1.0
    nb = math.sqrt(sum(y*y for y in b)) or 1.0
    return dot/(na*nb)

def rerank_semantic(query: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not candidates:
        return []
    profiles = []
    for c in candidates:
        parts = [c.get("name","")]
        if c.get("cuisines"): parts.append(", ".join(c["cuisines"]))
        if c.get("address"): parts.append(c["address"])
        profiles.append(" • ".join([p for p in parts if p]))
    qv = _embed([query])[0]
    cvs = _embed(profiles)
    ranked = []
    for c, v in zip(candidates, cvs):
        sim = _cos(qv, v)
        indie_boost = 0.1 if not c.get("brand_key") else 0.0
        open_boost = 0.1 if c.get("open_now") else 0.0
        score = 0.7*sim + 0.15*indie_boost + 0.15*open_boost
        cc = dict(c); cc["score"] = float(score)
        ranked.append(cc)
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked
