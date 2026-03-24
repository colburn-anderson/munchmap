# app/main.py
from pathlib import Path
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging
from fastapi import Request

# 1) Load env from .../api/.env   (main.py is in api/app/, so parents[1] == api/)
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="Munchmap API", version="0.1.0")

# 2) CORS for local dev (Next.js or Vite)
origins = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print("REQ", request.url)
    resp = await call_next(request)
    print("RESP", resp.status_code)
    return resp

# 3) warn (don’t fail) on missing key at startup.
if not os.getenv("OPENAI_API_KEY"):
    logging.getLogger("uvicorn.error").warning(
        "OPENAI_API_KEY not set — AI routes will 500 until configured."
    )


# 5) Simple health check
@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# ---- import routers AFTER app is defined ----
# (These files should define FastAPI APIRouter instances named `router`)
from .routes_search import router as search_router
from .routes_ai import router as ai_router

# routes_reviews is optional; import if present
try:
    from .routes_reviews import router as reviews_router  # optional
except Exception:
    reviews_router = None

# Attach routers (they already use /api/... paths internally)
app.include_router(search_router)
app.include_router(ai_router)
if reviews_router:
    app.include_router(reviews_router)
