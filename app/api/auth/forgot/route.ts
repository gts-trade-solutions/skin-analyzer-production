import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, isMailerConfigured } from "@/lib/mailer";
import { appUrl, throttle } from "@/lib/http";

export const runtime = "nodejs";

// Request a password-reset link. Always returns ok so we never reveal whether
// an email is registered.
export async function POST(req: Request) {
  const limited = throttle(req, "forgot", 5, 10 * 60 * 1000);
  if (limited) return limited;

  const { email: raw } = (await req.json().catch(() => ({}))) as {
    email?: string;
  };
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Only credentials accounts (with a password) can reset; Google-only skip.
    if (user?.passwordHash) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: `reset:${email}` },
      });
      const token =
        randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      await prisma.verificationToken.create({
        data: {
          identifier: `reset:${email}`,
          token,
          expires: new Date(Date.now() + 1000 * 60 * 60),
        },
      });
      const link = `${appUrl(req)}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      if (isMailerConfigured()) {
        try {
          await sendPasswordResetEmail(email, link);
        } catch (e) {
          console.error(
            "[forgot] email failed:",
            e instanceof Error ? e.message : e,
          );
        }
      } else {
        console.log("[forgot] reset link:", link);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
