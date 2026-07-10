import { NextRequest, NextResponse } from "next/server";
import {
  verifyHandoffToken,
  integrationEnabled,
  MADENKOREA_URL,
} from "@/lib/mk/crypto";
import {
  createMkSession,
  MK_SESSION_COOKIE,
  MK_SESSION_TTL_SEC,
} from "@/lib/mk/session";
import { useJtiOnce } from "@/lib/mk/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Integration entry point (additive — the standalone app is untouched).
 *
 * MadeNKorea redirects the user here with a signed handoff token. We verify it,
 * mint a scoped `mk_session` cookie, and forward to the capture flow. A direct
 * visitor to the analyzer never hits this route.
 */
export async function GET(req: NextRequest) {
  if (!integrationEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 404 });
  }

  const bounce = (reason: string) => {
    const base = MADENKOREA_URL || "";
    return NextResponse.redirect(
      base ? `${base}/skin-analyzer?error=${reason}` : new URL("/", req.url),
    );
  };

  const token = req.nextUrl.searchParams.get("t");
  if (!token) return bounce("missing_token");

  const claims = verifyHandoffToken(token);
  if (!claims) return bounce("invalid_token");

  // Single-use: reject a replayed token (defense-in-depth; MadeNKorea's grant
  // consumption is the authoritative guard).
  if (!useJtiOnce(claims.jti)) return bounce("token_used");

  const cookieValue = createMkSession({
    mkUserId: claims.sub,
    grantId: claims.grant_id,
    email: claims.email,
    name: claims.name,
    kind: claims.kind,
    jti: claims.jti,
  });

  const res = NextResponse.redirect(new URL("/mk/analyze", req.url));
  res.cookies.set(MK_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/", // read by both /mk/* and /api/mk/*
    maxAge: MK_SESSION_TTL_SEC,
  });
  return res;
}
