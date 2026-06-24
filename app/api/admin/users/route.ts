import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth.config";

export const runtime = "nodejs";

// Admin: list accounts (requested-first), with usage.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: [{ analysisRequested: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      mobile: true,
      consentAt: true,
      role: true,
      analysisAllowance: true,
      analysisUsed: true,
      analysisRequested: true,
      createdAt: true,
      _count: { select: { analyses: true } },
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      // Effective role: env admin list wins over the (unused) DB column.
      role: isAdminEmail(u.email) || u.role === "admin" ? "admin" : "user",
      verified: !!u.emailVerified,
      mobile: u.mobile,
      consentAt: u.consentAt?.toISOString() ?? null,
      allowance: u.analysisAllowance,
      used: u.analysisUsed,
      requested: u.analysisRequested?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      analyses: u._count.analyses,
    })),
  });
}
