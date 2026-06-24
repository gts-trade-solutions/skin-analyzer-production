import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * A user is admin iff their email is in ADMIN_EMAIL (or ADMIN_EMAILS) — a
 * comma/space/semicolon-separated list, so you can have several admins.
 * Edge-safe (no DB).
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const admins = `${process.env.ADMIN_EMAIL ?? ""} ${process.env.ADMIN_EMAILS ?? ""}`
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// Edge-safe config (no Prisma/bcrypt) — shared with middleware. The Node-only
// adapter + Credentials provider are added in lib/auth.ts.
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/signin" },
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = isAdminEmail(token.email) ? "admin" : "user";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
