# Munchmap — AI-Assisted Local Dining Finder (Frontend)


##  Highlights
- **AI query interpretation** (OpenAI via backend): free-text like _“late-night vegan tacos near Midtown”_ → structured filters 
- **Dual search modes:**  
  - **Classic filters** (open now/after, price band, cuisines, diets, chain suppression, radius).  
  - **Semantic search** (LLM) with **automatic fallback** to classic filters if the AI times out or is rate-limited.
- **Chain suppression heuristics:** canonical brand detection + known chain list to surface local independents.
- **“Open after HH:MM” logic**: respects venue local time (computed server-side) and midnight roll-overs.
- **Distance-aware ranking** (when lat/lng is provided), with stable sort by rating and review volume.
- **Fast UX under unreliable networks:** client fetch timeouts, a **12s API proxy timeout**, and graceful error UI (never spins forever).
- **Clean, responsive UI** (Tailwind): card grid, dark mode, settings slide-over (units/theme), and mobile-first layout.
- **Safe public frontend:** no API keys in the repo; server keys live in a **private** API service.

---

##  Technologies
- **Framework:** Next.js 15 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS
- **Runtime:** Node.js (Edge-safe, but API proxy runs as Node runtime)
- **API Proxy:** `src/app/api/[...path]/route.ts` forwards `/api/*` to the private FastAPI backend with a hard timeout
- **Components:** `RestaurantCard.tsx`, `ResultsList.tsx`, `page.tsx` (filters + search bar)

