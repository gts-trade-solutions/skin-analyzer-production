import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";
import { hashOtp, otpIdentifier } from "@/lib/otp";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // 30-day rolling session so a logged-in user isn't asked to sign in again.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [
    ...authConfig.providers,
    // Email sign-in: a first-time verification code (otp) OR a password.
    Credentials({
      credentials: { email: {}, password: {}, otp: {} },
      authorize: async (creds, request) => {
        const rl = rateLimit(
          `login:${clientIp(request as Request | undefined)}`,
          15,
          10 * 60 * 1000,
          Date.now(),
        );
        if (!rl.ok) return null;

        const email = String(creds?.email ?? "")
          .trim()
          .toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        const otp = String(creds?.otp ?? "").trim();

        // ── First-time verification code: verify the email, then sign in.
        // Single use, and only valid while the account is still unverified.
        if (otp) {
          if (!/^\d{6}$/.test(otp)) return null;
          const identifier = otpIdentifier(email);
          const row = await prisma.verificationToken.findFirst({
            where: { identifier },
          });
          if (!row || row.expires < new Date() || row.token !== hashOtp(email, otp))
            return null;
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user || user.emailVerified) return null; // first-time only
          await prisma.verificationToken.deleteMany({ where: { identifier } });
          const verified = await prisma.user.update({
            where: { email },
            data: { emailVerified: new Date() },
          });
          return {
            id: verified.id,
            email: verified.email,
            name: verified.name ?? undefined,
          };
        }

        // ── Regular password sign-in.
        const password = String(creds?.password ?? "");
        if (!password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (!user.emailVerified) throw new Error("EmailNotVerified");
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
});
