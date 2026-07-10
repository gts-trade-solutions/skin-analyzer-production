import crypto from "node:crypto";

/**
 * MadeNKorea integration — cryptographic contract (analyzer side).
 *
 * MIRROR of madenkorea's lib/integrations/skinAnalyzer.ts. Keep byte-compatible:
 * same signing inputs, same header format, same claims. Only the env var name
 * differs (here: MADENKOREA_SHARED_SECRET — must equal MadeNKorea's
 * SKIN_ANALYZER_SHARED_SECRET).
 *
 *   1. Handoff token  — HS256 JWT. MadeNKorea signs; WE verify (in /mk/enter).
 *   2. Callback signature — HMAC-SHA256 over `${t}.${rawBody}` in the
 *      `X-MK-Signature` header. WE sign; MadeNKorea verifies.
 *
 * This surface is only active when INTEGRATION_ENABLED=true. It is entirely
 * additive: the standalone app never imports it.
 */

const SECRET = process.env.MADENKOREA_SHARED_SECRET || "";

/** Base URL of the MadeNKorea site, for post-back + the return redirect. */
export const MADENKOREA_URL = (process.env.MADENKOREA_URL || "").replace(
  /\/+$/,
  "",
);

export const CALLBACK_TOLERANCE_SEC = 300;

export function integrationEnabled(): boolean {
  return process.env.INTEGRATION_ENABLED === "true" && !!SECRET;
}

function assertSecret(): void {
  if (!SECRET) {
    throw new Error(
      "MADENKOREA_SHARED_SECRET is not set — refusing to sign/verify.",
    );
  }
}

function decodeSegment<T>(seg: string): T {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as T;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Handoff token (MadeNKorea → analyzer) ─────────────────────────────

export type HandoffClaims = {
  iss: "madenkorea";
  aud: "skin-analyzer";
  sub: string; // MadeNKorea user id
  email: string | null;
  name: string | null;
  grant_id: string; // reserved entitlement id — echo back on callback
  kind: "face";
  jti: string; // single-use nonce
  iat: number;
  exp: number;
};

/**
 * Verify a handoff token minted by MadeNKorea. Returns claims or null on any
 * failure (bad sig / malformed / expired / wrong iss-aud). Never throws on
 * untrusted input. Replay (single-use jti) is enforced by the caller.
 */
export function verifyHandoffToken(token: string): HandoffClaims | null {
  assertSecret();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${h}.${p}`)
    .digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  let claims: HandoffClaims;
  try {
    claims = decodeSegment<HandoffClaims>(p);
  } catch {
    return null;
  }
  if (claims.iss !== "madenkorea" || claims.aud !== "skin-analyzer") return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  return claims;
}

// ── Callback signature (analyzer → MadeNKorea) ────────────────────────

/** Produce the `X-MK-Signature` header value for a raw JSON body. */
export function signCallback(
  rawBody: string,
  tSec: number = Math.floor(Date.now() / 1000),
): string {
  assertSecret();
  const mac = crypto
    .createHmac("sha256", SECRET)
    .update(`${tSec}.${rawBody}`)
    .digest("hex");
  return `t=${tSec},v1=${mac}`;
}

/** Verify a callback signature (used in tests / defense-in-depth). */
export function verifyCallback(
  rawBody: string,
  header: string | null,
  toleranceSec: number = CALLBACK_TOLERANCE_SEC,
): boolean {
  assertSecret();
  if (!header) return false;
  let t = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const [k, val] = part.split("=");
    if (k?.trim() === "t") t = val?.trim() ?? "";
    if (k?.trim() === "v1") v1 = val?.trim() ?? "";
  }
  if (!t || !v1) return false;
  const tNum = Number(t);
  if (!Number.isFinite(tNum)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tNum) > toleranceSec) return false;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return safeEqual(v1, expected);
}
