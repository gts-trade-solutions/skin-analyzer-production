import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, isMailerConfigured } from "@/lib/mailer";
import { appUrl, throttle } from "@/lib/http";

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
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  } else {
    await prisma.user.create({ data: { email, passwordHash, name } });
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
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
      console.error("[signup] email failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "email_failed" }, { status: 502 });
    }
  } else {
    // Dev fallback: log the link so verification still works without SES.
    console.log("[signup] verification link:", link);
  }

  return NextResponse.json({ ok: true });
}
