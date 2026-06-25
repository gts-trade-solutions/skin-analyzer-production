import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail, isMailerConfigured } from "@/lib/mailer";
import { throttle } from "@/lib/http";
import { generateOtp, hashOtp, otpIdentifier, OTP_TTL_MS } from "@/lib/otp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = throttle(req, "signup", 5, 10 * 60 * 1000);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    name?: string;
  };
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const name = body.name?.trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "weak_password" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerified)
    return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  // New user, or re-issue for an unverified one.
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, name: name ?? existing.name },
    });
  } else {
    await prisma.user.create({ data: { email, passwordHash, name } });
  }

  // Issue a one-time verification code (replaces the verification link).
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
      console.error("[signup] email failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "email_failed" }, { status: 502 });
    }
  } else {
    // Dev fallback: log the code so verification works without SES.
    console.log(`[signup] verification code for ${email}: ${code}`);
  }

  return NextResponse.json({ ok: true });
}
