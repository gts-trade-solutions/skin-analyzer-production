import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail, isMailerConfigured } from "@/lib/mailer";
import { throttle } from "@/lib/http";
import { generateOtp, hashOtp, otpIdentifier, OTP_TTL_MS } from "@/lib/otp";

export const runtime = "nodejs";

// Resend a one-time email-verification code (used by the /verify screen).
export async function POST(req: Request) {
  const limited = throttle(req, "otp", 5, 10 * 60 * 1000);
  if (limited) return limited;

  const { email: raw } = (await req.json().catch(() => ({}))) as {
    email?: string;
  };
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const code = generateOtp();
  const identifier = otpIdentifier(email);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashOtp(email, code),
      expires: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  if (isMailerConfigured()) {
    try {
      await sendOtpEmail(email, code);
    } catch (e) {
      console.error("[otp] email failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "email_failed" }, { status: 502 });
    }
  } else {
    // Dev fallback: log the code so sign-in works without SES.
    console.log(`[otp] code for ${email}: ${code}`);
  }

  return NextResponse.json({ ok: true });
}
