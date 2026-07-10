/**
 * Single-use guard for handoff-token `jti` values (defense-in-depth).
 *
 * In-memory + process-scoped: the analyzer runs as one PM2 instance, so this is
 * sufficient. It is NOT the authoritative single-use guarantee — that is
 * MadeNKorea consuming the grant exactly once on the callback. This just
 * rejects an obviously replayed token quickly, before a second session is
 * minted.
 */
const seen = new Map<string, number>(); // jti -> expiry (epoch ms)

/**
 * Record a jti as used. Returns true if this is the first use, false if it was
 * already used within its TTL. TTL should cover the handoff token's lifetime.
 */
export function claimJtiOnce(jti: string, ttlSec = 600): boolean {
  const now = Date.now();

  // Opportunistic prune so the map can't grow unbounded.
  if (seen.size > 5000) {
    for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
  }

  const exp = seen.get(jti);
  if (exp && exp > now) return false; // still-valid prior use → replay
  seen.set(jti, now + ttlSec * 1000);
  return true;
}
