// Face++ (Megvii) client for face/skin analysis.
//
// Auth is a simple api_key + api_secret pair (form fields). Flow:
//   1. Detect  POST {base}/facepp/v3/detect — confirm a single, in-focus face
//              (return_attributes=blur,facequality). Reject no-face / low-quality
//              BEFORE the paid analysis call → cleaner, more reliable output.
//   2. Skin    POST {base}/facepp/v1/skinanalyze — the skin concerns.
//
// Skin Analyze returns presence flags per concern: { value:"0"|"1", confidence }.
// We surface the present ones (value==="1"); confidence drives the intensity
// band. (Note: basic Skin Analyze gives detection confidence, not a clinical
// severity — Skin Analyze Advanced/Pro would add true severity.)

import type { AnalysisKind, AnalysisResult, Issue } from "@/lib/analysis";

const DETECT_PATH = "/facepp/v3/detect";
const SKIN_PATH = "/facepp/v1/skinanalyze";

// Face++ Skin Analyze presence attributes -> our issue keys.
const PRESENCE_ATTRS: Record<string, string> = {
  acne: "acne",
  blackhead: "blackhead",
  mole: "mole",
  skin_spot: "skin_spot",
  dark_circle: "dark_circle",
  eye_pouch: "eye_pouch",
  forehead_wrinkle: "forehead_wrinkle",
  crows_feet: "crows_feet",
  glabella_wrinkle: "glabella_wrinkle",
  nasolabial_fold: "nasolabial_fold",
  eye_finelines: "eye_finelines",
  pores_forehead: "pores_forehead",
  pores_left_cheek: "pores_left_cheek",
  pores_right_cheek: "pores_right_cheek",
  pores_jaw: "pores_jaw",
};

const SKIN_TYPE_LABELS = ["oily", "dry", "normal", "combination"];

export function isFaceppConfigured(): boolean {
  return Boolean(
    process.env.FACEPP_API_KEY &&
      process.env.FACEPP_API_SECRET &&
      process.env.FACEPP_API_BASE,
  );
}

function apiBase(): string {
  return process.env.FACEPP_API_BASE!.replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function authForm(jpeg: Buffer): FormData {
  const form = new FormData();
  form.append("api_key", process.env.FACEPP_API_KEY!);
  form.append("api_secret", process.env.FACEPP_API_SECRET!);
  form.append("image_base64", jpeg.toString("base64"));
  return form;
}

// Map common Face++ HTTP errors to our error codes.
async function faceppError(res: Response, scope: string): Promise<never> {
  const body = await res.text().catch(() => "");
  if (/CONCURRENCY_LIMIT_EXCEEDED/i.test(body)) throw new Error("provider_busy");
  if (/AUTHENTICATION|AUTHORIZATION|API_KEY/i.test(body))
    throw new Error("provider_auth");
  if (/INVALID_IMAGE|IMAGE_ERROR|IMAGE_FILE/i.test(body))
    throw new Error("invalid_image");
  throw new Error(`facepp_${scope}_${res.status}: ${body.slice(0, 200)}`);
}

export type FaceDetection = {
  faceCount: number;
  lowQuality: boolean;
  faceQuality: number | null;
};

/** Detect a face and check basic quality. Returns face count + quality. */
export async function detectFace(jpeg: Buffer): Promise<FaceDetection> {
  const form = authForm(jpeg);
  form.append("return_attributes", "blur,facequality");
  const res = await fetch(`${apiBase()}${DETECT_PATH}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await faceppError(res, "detect");

  const json: unknown = await res.json();
  const faces =
    isRecord(json) && Array.isArray(json.faces) ? json.faces : [];
  if (faces.length === 0)
    return { faceCount: 0, lowQuality: false, faceQuality: null };

  const attrs = isRecord(faces[0]) ? faces[0].attributes : undefined;
  const fq =
    isRecord(attrs) && isRecord(attrs.facequality) ? attrs.facequality : null;
  const blurness =
    isRecord(attrs) && isRecord(attrs.blur) && isRecord(attrs.blur.blurness)
      ? attrs.blur.blurness
      : null;

  // Face++ provides per-metric thresholds; use them directly.
  const poorQuality =
    fq != null &&
    typeof fq.value === "number" &&
    typeof fq.threshold === "number" &&
    fq.value < fq.threshold;
  const tooBlurry =
    blurness != null &&
    typeof blurness.value === "number" &&
    typeof blurness.threshold === "number" &&
    blurness.value > blurness.threshold;

  return {
    faceCount: faces.length,
    lowQuality: poorQuality || tooBlurry,
    faceQuality: fq != null && typeof fq.value === "number" ? fq.value : null,
  };
}

async function analyzeSkin(
  jpeg: Buffer,
): Promise<{ raw: unknown; requestId: string | null }> {
  const res = await fetch(`${apiBase()}${SKIN_PATH}`, {
    method: "POST",
    body: authForm(jpeg),
  });
  if (!res.ok) await faceppError(res, "skin");
  const raw: unknown = await res.json();
  const requestId =
    isRecord(raw) && typeof raw.request_id === "string" ? raw.request_id : null;
  return { raw, requestId };
}

/** Map a raw Face++ Skin Analyze response into our normalized issues. */
export function parseSkin(raw: unknown): Issue[] {
  if (!isRecord(raw) || !isRecord(raw.result)) return [];
  const result = raw.result;
  const issues: Issue[] = [];

  for (const [key, label] of Object.entries(PRESENCE_ATTRS)) {
    const node = result[key];
    if (!isRecord(node)) continue;
    // Face++ returns value as a number (1/0); accept string too, defensively.
    const detected = node.value === 1 || node.value === "1";
    let score: number | null =
      typeof node.confidence === "number" ? node.confidence : null;
    // Normalize if confidence is on a 0–100 scale (Face++ uses 0–1).
    if (score != null && score > 1) score = score / 100;
    issues.push({ issueType: label, detected, score, confidence: score });
  }

  const st = result.skin_type;
  if (isRecord(st) && typeof st.skin_type === "number") {
    issues.push({
      issueType: "skin_type",
      score: null,
      confidence: null,
      details: { type: SKIN_TYPE_LABELS[st.skin_type] ?? String(st.skin_type) },
    });
  }

  return issues;
}

export async function analyzeWithFacepp(
  kind: AnalysisKind,
  jpeg: Buffer,
): Promise<AnalysisResult> {
  if (kind !== "face") throw new Error("facepp_face_only");

  // 1. Detect first — fail fast on no-face / low-quality for better results.
  const detection = await detectFace(jpeg);
  if (detection.faceCount === 0) throw new Error("no_subject");
  if (detection.lowQuality) throw new Error("low_quality");

  // 2. Skin Analyze.
  const { raw, requestId } = await analyzeSkin(jpeg);
  return { requestId, raw, issues: parseSkin(raw) };
}
