import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/http";
import { hashOtp, otpIdentifier } from "@/lib/otp";

export const runtime = "nodejs";

// Verify the first-time email code, then mark the account verified.
export async function POST(req: Request) {
  const limited = throttle(req, "verify-otp", 10, 10 * 60 * 1000);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
  };
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const code = String(body.code ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const identifier = otpIdentifier(email);
  const row = await prisma.verificationToken.findFirst({ where: { identifier } });
  if (!row || row.expires < new Date() || row.token !== hashOtp(email, code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
