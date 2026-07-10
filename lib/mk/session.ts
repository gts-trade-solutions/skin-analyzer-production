import crypto from "node:crypto";

/**
 * Scoped session for MadeNKorea-originated visitors (integration mode only).
 *
 * This is deliberately SEPARATE from the analyzer's own NextAuth session — a
 * MadeNKorea user is never "logged in" to the standalone app. The cookie is a
 * short-lived signed blob (HS256 over the shared secret) carrying just enough
 * to run one analysis and post it back.
 *
 * TTL matches the MadeNKorea reservation window (30 min) so the whole capture →
 * analyze → post-back flow has time to complete.
 */

const SECRET = process.env.MADENKOREA_SHARED_SECRET || "";

export const MK_SESSION_COOKIE = "mk_session";
export const MK_SESSION_TTL_SEC = 30 * 60;

export type MkSession = {
  aud: "mk-session";
  mkUserId: string;
  grantId: string;
  email: string | null;
  name: string | null;
  kind: "face";
  jti: string; // carried from the handoff token (for tracing / replay work)
  iat: number;
  exp: number;
};

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function decode<T>(seg: string): T {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as T;
}
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function createMkSession(
  input: Pick<MkSession, "mkUserId" | "grantId" | "email" | "name" | "kind" | "jti">,
): string {
  if (!SECRET) throw new Error("MADENKOREA_SHARED_SECRET is not set.");
  const now = Math.floor(Date.now() / 1000);
  const payload: MkSession = {
    aud: "mk-session",
    ...input,
    iat: now,
    exp: now + MK_SESSION_TTL_SEC,
  };
  const body = b64urlJson(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readMkSession(cookieValue: string | undefined): MkSession | null {
  if (!cookieValue || !SECRET) return null;
  const [body, sig] = cookieValue.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  let s: MkSession;
  try {
    s = decode<MkSession>(body);
  } catch {
    return null;
  }
  if (s.aud !== "mk-session") return null;
  if (typeof s.exp !== "number" || s.exp < Math.floor(Date.now() / 1000)) return null;
  return s;
}
