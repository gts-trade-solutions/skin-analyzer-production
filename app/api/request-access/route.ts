import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// User asks the admin for more analyses.
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { analysisRequested: new Date() },
  });
  return NextResponse.json({ ok: true });
}
