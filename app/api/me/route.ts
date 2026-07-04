import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      mobile: true,
      analysisAllowance: true,
      analysisUsed: true,
      hairAllowance: true,
      hairUsed: true,
      analysisRequested: true,
    },
  });
  if (!u) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "admin";
  const faceRemaining = Math.max(0, u.analysisAllowance - u.analysisUsed);
  const hairRemaining = Math.max(0, u.hairAllowance - u.hairUsed);
  return NextResponse.json({
    email: u.email,
    name: u.name,
    role: session.user.role,
    isAdmin,
    hasMobile: !!u.mobile,
    allowance: u.analysisAllowance,
    used: u.analysisUsed,
    // Face remaining kept as `remaining` for backward compatibility.
    remaining: isAdmin ? null : faceRemaining,
    hairRemaining: isAdmin ? null : hairRemaining,
    requested: u.analysisRequested != null,
  });
}
