/**
 * Tiny in-memory TTL cache. On Vercel each warm function instance keeps its
 * own copy, which is enough to absorb repeat searches and repeat "Show vibe"
 * clicks without paying Google twice.
 */
export class TTLCache<V> {
  private store = new Map<string, { exp: number; value: V }>();

  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.exp) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V) {
    if (this.store.size >= this.maxEntries) {
      // Map preserves insertion order, so the first key is the oldest.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { exp: Date.now() + this.ttlMs, value });
  }
}
