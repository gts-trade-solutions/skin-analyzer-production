import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/http";

export const runtime = "nodejs";

// Complete a password reset with the emailed token.
export async function POST(req: Request) {
  const limited = throttle(req, "reset", 10, 10 * 60 * 1000);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    email?: string;
    password?: string;
  };
  const token = String(body.token ?? "");
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");

  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const vt = token
    ? await prisma.verificationToken.findUnique({ where: { token } })
    : null;
  if (!vt || vt.identifier !== `reset:${email}` || vt.expires < new Date()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email },
    // Resetting via the emailed link also proves ownership → verify if needed.
    data: {
      passwordHash,
      ...(user.emailVerified ? {} : { emailVerified: new Date() }),
    },
  });
  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

  return NextResponse.json({ ok: true });
}
