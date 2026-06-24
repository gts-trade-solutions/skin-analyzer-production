import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Admin: add to a user's analysis allowance (and clear their request).
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    amount?: number;
  };
  const userId = String(body.userId ?? "");
  const amount = Math.floor(Number(body.amount));
  if (!userId || !Number.isFinite(amount) || amount <= 0 || amount > 100) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const u = await prisma.user.update({
    where: { id: userId },
    data: {
      analysisAllowance: { increment: amount },
      analysisRequested: null,
    },
    select: { analysisAllowance: true, analysisUsed: true },
  });
  return NextResponse.json({ ok: true, allowance: u.analysisAllowance });
}
