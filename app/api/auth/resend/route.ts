import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, isMailerConfigured } from "@/lib/mailer";
import { appUrl, throttle } from "@/lib/http";

export const runtime = "nodejs";

// Resend the verification email. Always returns ok (no account enumeration).
export async function POST(req: Request) {
  const limited = throttle(req, "resend", 5, 10 * 60 * 1000);
  if (limited) return limited;

  const { email: raw } = (await req.json().catch(() => ({}))) as {
    email?: string;
  };
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified && user.passwordHash) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });
      const token =
        randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });
      const link = `${appUrl(req)}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;
      if (isMailerConfigured()) {
        try {
          await sendVerificationEmail(email, link);
        } catch (e) {
          console.error(
            "[resend] email failed:",
            e instanceof Error ? e.message : e,
          );
        }
      } else {
        console.log("[resend] verification link:", link);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
