import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Admin: add to a user's face or hair allowance (and clear their request).
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    amount?: number;
    kind?: string;
  };
  const userId = String(body.userId ?? "");
  const amount = Math.floor(Number(body.amount));
  const kind = body.kind === "hair" ? "hair" : "face";
  if (!userId || !Number.isFinite(amount) || amount <= 0 || amount > 100) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const u = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(kind === "hair"
        ? { hairAllowance: { increment: amount } }
        : { analysisAllowance: { increment: amount } }),
      analysisRequested: null,
    },
    select: { analysisAllowance: true, hairAllowance: true },
  });
  return NextResponse.json({
    ok: true,
    allowance: kind === "hair" ? u.hairAllowance : u.analysisAllowance,
  });
}
