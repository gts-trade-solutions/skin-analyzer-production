import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isS3Configured, presignGetUrl } from "@/lib/s3";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

function detailsOf(v: Prisma.JsonValue | null | undefined): {
  type?: string;
  imageKey?: string;
} {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return {
      type: typeof o.type === "string" ? o.type : undefined,
      imageKey: typeof o.imageKey === "string" ? o.imageKey : undefined,
    };
  }
  return {};
}

// One past analysis, with fresh presigned URLs for its stored images.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const a = await prisma.analysis.findFirst({
      where: { id, ...(isAdmin ? {} : { userId }) },
      select: {
        id: true,
        kind: true,
        createdAt: true,
        issues: {
          select: {
            issueType: true,
            score: true,
            confidence: true,
            details: true,
          },
        },
      },
    });
    if (!a) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const s3 = isS3Configured();
    const issues = await Promise.all(
      a.issues.map(async (i) => {
        const d = detailsOf(i.details);
        const image =
          s3 && d.imageKey ? await presignGetUrl(d.imageKey, 3600) : null;
        return {
          issueType: i.issueType,
          score: i.score,
          confidence: i.confidence,
          image,
          details: d.type ? { type: d.type } : undefined,
        };
      }),
    );

    return NextResponse.json({
      id: a.id,
      kind: a.kind,
      createdAt: a.createdAt.toISOString(),
      issues,
    });
  } catch (err) {
    console.error("[analyses] detail failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "detail_failed" }, { status: 500 });
  }
}
