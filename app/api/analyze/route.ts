import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { processImage } from "@/lib/images";
import {
  analyze,
  mockIssues,
  isProviderConfigured,
  isAnalysisKind,
  NoSubjectError,
  type AnalysisKind,
  type Issue,
} from "@/lib/analysis";
import { prisma, isDbConfigured } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  isS3Configured,
  uploadImage,
  uploadFromUrl,
  presignGetUrl,
} from "@/lib/s3";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Rate limit: an unlocked client can analyze at most 10 photos per 10 minutes.
const RL_LIMIT = 10;
const RL_WINDOW_MS = 10 * 60 * 1000;

async function markFailed(id: string, message: string): Promise<void> {
  await prisma.analysis
    .update({ where: { id }, data: { status: "failed", error: message } })
    .catch(() => {});
}

// Pipeline (face or hair):
//   validate -> sharp (orient, downscale to 1024, strip EXIF)
//   -> provider (image bytes uploaded directly)
//   -> mirror result overlay images into our private S3 (durable storage)
//   -> persist (Prisma).
export async function POST(req: Request) {
  // Per-client rate limit (Nginx forwards the real IP in x-forwarded-for).
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const rl = rateLimit(`analyze:${ip}`, RL_LIMIT, RL_WINDOW_MS, Date.now());
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const form = await req.formData();
  const kindRaw = String(form.get("kind") ?? "face");
  const kind: AnalysisKind = isAnalysisKind(kindRaw) ? kindRaw : "face";
  // Image came from Perfect Corp's Camera Kit (→ pf_camera_kit on the task).
  const cameraKit = String(form.get("camera_kit") ?? "") === "true";

  // Authenticated user + per-account quota. Face and hair have separate
  // allowances (1 each by default); admin is exempt.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const account = await prisma.user.findUnique({ where: { id: userId } });
  if (!account) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const used = kind === "hair" ? account.hairUsed : account.analysisUsed;
  const allowance =
    kind === "hair" ? account.hairAllowance : account.analysisAllowance;
  if (!isAdmin && used >= allowance) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 403 });
  }

  // A provider must handle this mode, or explicit mock mode. We don't fabricate.
  const useProvider = isProviderConfigured(kind);
  const mockEnabled = process.env.ANALYZER_MOCK === "true";
  if (!useProvider && !mockEnabled) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "no_image" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(image.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // Decode + auto-orient + downscale + strip metadata. Throws on a non-image.
  let processed;
  try {
    processed = await processImage(Buffer.from(await image.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "invalid_image" }, { status: 422 });
  }

  const sessionId = randomUUID();

  // Open a pending row up front (when a real DB is configured).
  let analysisId: string | null = null;
  if (isDbConfigured()) {
    const created = await prisma.analysis.create({
      data: { kind, userId, sessionId, status: "pending" },
    });
    analysisId = created.id;
  }

  // Analyze with the provider, or mock when ANALYZER_MOCK=true.
  let issues: Issue[];
  let requestId: string | null = null;
  let raw: unknown = null;
  try {
    if (useProvider) {
      const result = await analyze(kind, processed.buffer, cameraKit);
      issues = result.issues;
      requestId = result.requestId;
      raw = result.raw;
    } else {
      // Simulate analysis time so the scanning animation is visible in mock mode.
      await new Promise((r) => setTimeout(r, 3000));
      issues = mockIssues(kind);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "analysis_failed";
    console.error(`[analyze] ${kind} failed:`, message);
    if (analysisId) await markFailed(analysisId, message);

    let code = "analysis_failed";
    let status = 502;
    if (err instanceof NoSubjectError || message === "no_subject") {
      code = "no_subject";
      status = 422;
    } else if (message === "low_quality") {
      code = "low_quality";
      status = 422;
    } else if (message === "invalid_image") {
      code = "invalid_image";
      status = 422;
    } else if (message === "provider_busy") {
      code = "provider_busy";
      status = 503;
    } else if (message === "provider_credits") {
      code = "provider_credits";
      status = 402;
    } else if (message === "hair_angle") {
      code = "hair_angle";
      status = 422;
    }
    return NextResponse.json({ error: code }, { status });
  }

  // Mirror provider overlay images into our private S3 bucket for durable
  // storage (the provider's URLs expire in ~2h), and serve from there.
  if (isS3Configured()) {
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const folder = `analyses/${kind}/${datePath}/${analysisId ?? sessionId}`;
    await Promise.all(
      issues.map(async (issue) => {
        if (!issue.image) return;
        const key = `${folder}/${issue.issueType}.jpg`;
        try {
          await uploadFromUrl(key, issue.image);
          issue.details = { ...(issue.details ?? {}), imageKey: key };
          issue.image = await presignGetUrl(key, 3600);
        } catch (e) {
          console.error(
            `[analyze] image mirror failed for ${issue.issueType}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }),
    );

    // Hair has no overlay images — store the captured photo itself so History
    // and Compare can show it. Attach the key to the hair_density issue.
    if (kind === "hair") {
      const density = issues.find((i) => i.issueType === "hair_density");
      if (density) {
        const key = `${folder}/photo.jpg`;
        try {
          await uploadImage(key, processed.buffer, "image/jpeg");
          density.details = { ...(density.details ?? {}), imageKey: key };
        } catch (e) {
          console.error(
            "[analyze] hair photo store failed:",
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  // Persist the result.
  if (analysisId) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "done",
        providerRequestId: requestId,
        rawResult: raw == null ? undefined : (raw as Prisma.InputJsonValue),
        issues: {
          // Persist detected concerns (+ categorical items); skip not-detected.
          create: issues
            .filter((i) => i.detected !== false)
            .map((i) => ({
              issueType: i.issueType,
              score: i.score ?? undefined,
              confidence: i.confidence ?? undefined,
              details:
                i.details == null
                  ? undefined
                  : (i.details as Prisma.InputJsonValue),
            })),
        },
      },
    });
  }

  // Count a successful analysis against the user's per-kind quota.
  if (!isAdmin) {
    await prisma.user
      .update({
        where: { id: userId },
        data:
          kind === "hair"
            ? { hairUsed: { increment: 1 } }
            : { analysisUsed: { increment: 1 } },
      })
      .catch(() => {});
  }

  return NextResponse.json({ analysisId: analysisId ?? "stub", kind, issues });
}

