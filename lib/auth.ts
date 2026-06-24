import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        // Throttle credential attempts per IP to blunt brute force.
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
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
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
