import { NextResponse } from "next/server";
import { processImage } from "@/lib/images";
import { detectFace, isFaceppConfigured } from "@/lib/facepp";
import { isAnalysisKind } from "@/lib/analysis";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Lightweight face check used before the (paid) analyze call, so the UI can
// show "face detected" and block analysis on a faceless / low-quality shot.
export async function POST(req: Request) {
  const form = await req.formData();
  const kindRaw = String(form.get("kind") ?? "face");
  const kind = isAnalysisKind(kindRaw) ? kindRaw : "face";

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ ok: false, reason: "no_image" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(image.type)) {
    return NextResponse.json({ ok: false, reason: "unsupported_type" }, { status: 415 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, reason: "too_large" }, { status: 413 });
  }

  // Face detection uses Face++ (free), independent of the analysis provider.
  // Skip for hair or when Face++ isn't configured.
  if (kind !== "face" || !isFaceppConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let processed;
  try {
    processed = await processImage(Buffer.from(await image.arrayBuffer()));
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_image" }, { status: 422 });
  }

  // Require a high Face++ face-quality score before allowing analysis.
  const MIN_FACE_QUALITY = 90;
  try {
    const d = await detectFace(processed.buffer);
    if (d.faceCount === 0) {
      return NextResponse.json({ ok: false, reason: "no_face" });
    }
    if (d.faceQuality == null || d.faceQuality < MIN_FACE_QUALITY) {
      return NextResponse.json({
        ok: false,
        reason: "low_quality",
        quality: d.faceQuality,
      });
    }
    return NextResponse.json({ ok: true, faces: d.faceCount, quality: d.faceQuality });
  } catch (err) {
    console.error("[detect] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, reason: "detect_failed" }, { status: 502 });
  }
}
