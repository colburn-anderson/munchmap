# Munchmap — AI-Assisted Local Dining Finder

Search real restaurants by vibe, diet, price and hours — and skip the chains.

## Highlights
- **Real data** from Google Places API (New): ratings, price, open-now, distance, review "vibe" snippets.
- **Filter chips:** Open now, No chains, Late night (open at 22:00 venue-local), Vegan, Budget, Fancy.
- **Location:** type a city/ZIP or use your device location with an adjustable radius (mi/km).
- **Chain suppression:** known-chain list + duplicate-brand detection to surface local independents.
- **Optional AI query interpretation** (OpenAI): "cheap late-night vegan tacos in Midtown" → structured filters, with automatic fallback to the chips if AI is unconfigured, slow, or fails.
- **Safe by design:** API keys are only read in server route handlers and never reach the browser.
- Dark (default), light and system themes.

## Tech
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · deployed on Vercel.

| Route | Purpose |
| --- | --- |
| `GET /api/search` | Places text search + filters (`src/app/api/search/route.ts`) |
| `GET /api/review/[placeId]` | One-sentence editorial/review blurb for "Show vibe" |
| `GET /api/health` | Reports whether keys are configured (booleans only) |

## Environment variables
| Name | Required | Notes |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | yes | Google Cloud key with **Places API (New)** enabled |
| `OPENAI_API_KEY` | no | Enables AI query interpretation |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |

## Deploy on Vercel
1. Import the repo in Vercel (framework preset: Next.js — no other settings needed).
2. Project → Settings → Environment Variables: add the keys above for Production and Preview.
3. Redeploy, then visit `/api/health` — `google_key` should be `true`.

## Local dev
```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev
```
