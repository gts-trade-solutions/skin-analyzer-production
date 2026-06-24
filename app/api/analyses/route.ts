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

// List completed analyses (most recent first). Users see only their own;
// admin sees everyone's (with the owner's email).
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rows = await prisma.analysis.findMany({
      where: { status: "done", ...(isAdmin ? {} : { userId }) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        createdAt: true,
        user: { select: { email: true } },
        issues: {
          where: { issueType: { in: ["overall", "resize_image"] } },
          select: { issueType: true, score: true, details: true },
        },
      },
    });

    const s3 = isS3Configured();
    const items = await Promise.all(
      rows.map(async (r) => {
        const overall =
          r.issues.find((i) => i.issueType === "overall")?.score ?? null;
        const thumbKey = detailsOf(
          r.issues.find((i) => i.issueType === "resize_image")?.details,
        ).imageKey;
        const thumbnailUrl =
          s3 && thumbKey ? await presignGetUrl(thumbKey, 3600) : null;
        return {
          id: r.id,
          kind: r.kind,
          createdAt: r.createdAt.toISOString(),
          overall,
          thumbnailUrl,
          ownerEmail: isAdmin ? (r.user?.email ?? null) : null,
        };
      }),
    );

    return NextResponse.json({ items, isAdmin });
  } catch (err) {
    console.error("[analyses] list failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
}
