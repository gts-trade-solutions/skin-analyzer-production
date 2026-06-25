import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Edge-safe instance (no Prisma/bcrypt) just for reading the session.
const { auth } = NextAuth(authConfig);

const PUBLIC = [
  "/signin",
  "/signup",
  "/verify",
  "/forgot-password",
  "/reset-password",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Auth.js endpoints + our signup/verify routes are public.
  if (pathname.startsWith("/api/auth")) return;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;

  const session = req.auth;
  if (!session) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search =
      pathname && pathname !== "/"
        ? `?from=${encodeURIComponent(pathname)}`
        : "";
    return NextResponse.redirect(url);
  }

  // Admin-only areas.
  const adminArea =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin");
  if (adminArea && session.user?.role !== "admin") {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};
