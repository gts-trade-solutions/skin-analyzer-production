import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Public base URL for building links + OAuth callbacks. */
export function appUrl(req: Request): string {
  return (
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin
  );
}

/** Best-effort client IP (Nginx forwards the real IP in x-forwarded-for). */
export function clientIp(req: Request | undefined): string {
  return (
    (req?.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local"
  );
}

/**
 * Fixed-window per-IP throttle for a route. Returns a 429 response when the
 * caller is over budget, or null to continue.
 */
export function throttle(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const rl = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs, Date.now());
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  return null;
}
