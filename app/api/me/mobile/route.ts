import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Save the user's mobile number + record consent (captured on first results view).
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { mobile?: string };
  const mobile = String(body.mobile ?? "").trim();
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: "invalid_mobile" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { mobile, consentAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
