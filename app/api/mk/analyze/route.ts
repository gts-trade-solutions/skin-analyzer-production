import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { processImage } from "@/lib/images";
import {
  analyze,
  mockIssues,
  isProviderConfigured,
  NoSubjectError,
  type Issue,
} from "@/lib/analysis";
import { prisma, isDbConfigured } from "@/lib/prisma";
import { throttle } from "@/lib/http";
import {
  isS3Configured,
  uploadFromUrl,
  presignGetUrl,
} from "@/lib/s3";
import { integrationEnabled, MADENKOREA_URL, signCallback } from "@/lib/mk/crypto";
import { buildImageProxyUrl } from "@/lib/mk/imageProxy";
import { MK_SESSION_COOKIE, readMkSession } from "@/lib/mk/session";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Integration analyze endpoint (skin only). Mirrors /api/analyze's pipeline but:
 *   - identity/authorization comes from the scoped mk_session (NOT NextAuth),
 *   - there is NO analyzer-side quota (MadeNKorea owns entitlement: one analysis
 *     per handoff),
 *   - on success it posts the result back to MadeNKorea (signed) and returns a
 *     redirect URL to the MadeNKorea results page.
 *
 * The standalone /api/analyze route is untouched.
 */
export async function POST(req: Request) {
  if (!integrationEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 404 });
  }

  const limited = throttle(req, "mk_analyze", 10, 10 * 60 * 1000);
  if (limited) return limited;

  const jar = await cookies();
  const session = readMkSession(jar.get(MK_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const kind = "face" as const; // skin only for now

  const useProvider = isProviderConfigured(kind);
  const mockEnabled = process.env.ANALYZER_MOCK === "true";
  if (!useProvider && !mockEnabled) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const form = await req.formData();
  const cameraKit = String(form.get("camera_kit") ?? "") === "true";
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

  let processed;
  try {
    processed = await processImage(Buffer.from(await image.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "invalid_image" }, { status: 422 });
  }

  const sessionId = randomUUID();
  let analysisId: string | null = null;
  if (isDbConfigured()) {
    const created = await prisma.analysis.create({
      // userId stays null — the MadeNKorea user is not an analyzer account.
      data: { kind, sessionId, status: "pending", callbackStatus: "pending" },
    });
    analysisId = created.id;
  }

  // Run the provider (or mock). On failure we DO NOT tell MadeNKorea — its
  // reservation stays and auto-releases, so the free scan isn't burned.
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
      await new Promise((r) => setTimeout(r, 1500));
      issues = mockIssues(kind);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "analysis_failed";
    if (analysisId) {
      await prisma.analysis
        .update({ where: { id: analysisId }, data: { status: "failed", error: message } })
        .catch(() => {});
    }
    const { code, status } = mapAnalysisError(err, message);
    return NextResponse.json({ error: code }, { status });
  }

  // Mirror provider overlay images into our private S3 (URLs expire ~2h).
  if (isS3Configured()) {
    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const folder = `mk/analyses/${kind}/${datePath}/${analysisId ?? sessionId}`;
    await Promise.all(
      issues.map(async (issue) => {
        if (!issue.image) return;
        const key = `${folder}/${issue.issueType}.jpg`;
        try {
          await uploadFromUrl(key, issue.image);
          issue.details = { ...(issue.details ?? {}), imageKey: key };
          issue.image = await presignGetUrl(key, 3600);
        } catch {
          /* non-fatal: overlay image just won't be durable */
        }
      }),
    );
  }

  // Persist the analyzer's own copy.
  if (analysisId) {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "done",
        providerRequestId: requestId,
        rawResult: raw == null ? undefined : (raw as Prisma.InputJsonValue),
        issues: {
          create: issues
            .filter((i) => i.detected !== false)
            .map((i) => ({
              issueType: i.issueType,
              score: i.score ?? undefined,
              confidence: i.confidence ?? undefined,
              details: i.details == null ? undefined : (i.details as Prisma.InputJsonValue),
            })),
        },
      },
    });
  }

  // Post the result back to MadeNKorea (authoritative store + consume).
  const callbackId = analysisId ?? sessionId;
  const payload = buildCallbackPayload(callbackId, session, kind, issues);
  const rawBody = JSON.stringify(payload);

  let mkAnalysisId: string | null = null;
  try {
    mkAnalysisId = await postbackWithRetry(rawBody);
  } catch {
    if (analysisId) {
      await prisma.analysis
        .update({ where: { id: analysisId }, data: { callbackStatus: "failed" } })
        .catch(() => {});
    }
    // The analysis succeeded but we couldn't save it to MadeNKorea. Don't burn
    // the reservation; let the user retry. (M5 adds a background retry queue.)
    return NextResponse.json({ error: "postback_failed" }, { status: 502 });
  }

  if (analysisId) {
    await prisma.analysis
      .update({ where: { id: analysisId }, data: { callbackStatus: "sent" } })
      .catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    redirectUrl: `${MADENKOREA_URL}/account/skin-analysis/${mkAnalysisId}`,
  });
}

// ── helpers ───────────────────────────────────────────────────────────

function mapAnalysisError(
  err: unknown,
  message: string,
): { code: string; status: number } {
  if (err instanceof NoSubjectError || message === "no_subject")
    return { code: "no_subject", status: 422 };
  if (message === "low_quality") return { code: "low_quality", status: 422 };
  if (message === "invalid_image") return { code: "invalid_image", status: 422 };
  if (message === "provider_busy") return { code: "provider_busy", status: 503 };
  if (message === "provider_credits")
    return { code: "provider_credits", status: 402 };
  return { code: "analysis_failed", status: 502 };
}

/** 0..1 health score (higher = better) → severity band. */
function bandFromScore(score: number | null | undefined): string | null {
  if (typeof score !== "number") return null;
  if (score >= 0.8) return "clear";
  if (score >= 0.6) return "mild";
  if (score >= 0.4) return "moderate";
  return "severe";
}

function buildCallbackPayload(
  analyzerAnalysisId: string,
  session: { grantId: string; mkUserId: string },
  kind: "face",
  issues: Issue[],
) {
  const real = issues.filter((i) => i.detected !== false);
  const overall = real.find((i) => i.issueType === "overall")?.score ?? null;
  const skinType = real.find((i) => i.issueType === "skin_type")?.details?.type ?? null;
  const skinAge = real.find((i) => i.issueType === "skin_age")?.details?.type ?? null;

  // Durable proxy URLs for the analyzed photo + concern overlays, pointing at
  // this analyzer's /mk/image (re-presigns on each load). Uses the analyzer's
  // own public base URL.
  const proxyBase = (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/+$/, "");
  const proxy = (key?: string): string | null =>
    key && proxyBase ? buildImageProxyUrl(proxyBase, key) : null;

  // `resize_image` is the analyzed base photo, not a concern.
  const META = ["overall", "skin_type", "skin_age", "resize_image"];
  const baseImage = proxy(
    real.find((i) => i.issueType === "resize_image")?.details?.imageKey,
  );
  const concerns = real.filter((i) => !META.includes(i.issueType));

  // Worst (lowest health score) scored concerns become the headline.
  const topConcerns = concerns
    .filter((i) => typeof i.score === "number")
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 3)
    .map((i) => i.issueType);

  return {
    analyzer_analysis_id: analyzerAnalysisId,
    grant_id: session.grantId,
    mk_user_id: session.mkUserId,
    kind,
    summary: {
      overall,
      skin_type: skinType,
      skin_age: skinAge,
      top_concerns: topConcerns,
      base_image: baseImage,
    },
    issues: concerns.map((i) => ({
      issue_type: i.issueType,
      score: i.score ?? null,
      confidence: i.confidence ?? null,
      severity_band: bandFromScore(i.score),
      details: { ...(i.details ?? {}), imageUrl: proxy(i.details?.imageKey) },
    })),
  };
}

/** POST the signed payload to MadeNKorea, retrying transient failures. */
async function postbackWithRetry(rawBody: string): Promise<string> {
  if (!MADENKOREA_URL) throw new Error("MADENKOREA_URL not set");
  const url = `${MADENKOREA_URL}/api/skin/callback`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mk-signature": signCallback(rawBody),
        },
        body: rawBody,
      });
      if (res.ok) {
        const data = (await res.json()) as { analysisId?: string };
        if (data.analysisId) return data.analysisId;
        throw new Error("no analysisId in callback response");
      }
      // 4xx (bad grant / bad signature) won't get better on retry — stop.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`callback rejected: ${res.status}`);
      }
      lastErr = new Error(`callback ${res.status}`);
    } catch (e) {
      lastErr = e;
      // A 4xx already threw above; only 5xx/network reach another attempt.
      if (e instanceof Error && e.message.startsWith("callback rejected")) throw e;
    }
  }
  throw lastErr ?? new Error("postback failed");
}
