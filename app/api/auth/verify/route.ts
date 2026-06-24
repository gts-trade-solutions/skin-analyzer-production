import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function appUrl(req: Request): string {
  return (
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const base = appUrl(req);

  const vt = token
    ? await prisma.verificationToken.findUnique({ where: { token } })
    : null;

  if (!vt || vt.identifier !== email || vt.expires < new Date()) {
    if (vt) await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(`${base}/signin?error=verify`);
  }

  await prisma.user.update({
    where: { email },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});

  return NextResponse.redirect(`${base}/signin?verified=1`);
}
