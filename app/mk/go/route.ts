import { NextRequest, NextResponse } from "next/server";
import { integrationEnabled, MADENKOREA_URL } from "@/lib/mk/crypto";
import {
  MK_SESSION_COOKIE,
  MK_SESSION_TTL_SEC,
  readMkSession,
} from "@/lib/mk/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phone continuation. On desktop, /mk/analyze shows a QR encoding this URL with
 * the signed mk_session value. Scanning it on the phone re-establishes the same
 * session here, so the capture happens on the better (phone) camera. The grant
 * is still consumed only once (on the callback), so whichever device finishes
 * wins.
 */
export async function GET(req: NextRequest) {
  if (!integrationEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 404 });
  }

  const bounce = (reason: string) =>
    NextResponse.redirect(
      MADENKOREA_URL
        ? `${MADENKOREA_URL}/skin-analyzer?error=${reason}`
        : new URL("/", req.url),
    );

  const s = req.nextUrl.searchParams.get("s");
  const session = readMkSession(s || undefined);
  if (!s || !session) return bounce("continue_expired");

  // Relative Location so it resolves against the public host in the browser.
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: "/mk/analyze" },
  });
  res.cookies.set(MK_SESSION_COOKIE, s, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MK_SESSION_TTL_SEC,
  });
  return res;
}
