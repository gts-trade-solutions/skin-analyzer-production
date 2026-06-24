// Vendor-agnostic analysis layer. The app has two modes — face and hair — that
// share one pipeline (capture -> process -> analyze -> issues). A provider
// (Perfect Corp) plugs in behind analyze(); a mock keeps the flow testable.

import {
  isPerfectCorpConfigured,
  analyzeWithPerfectCorp,
} from "@/lib/perfectcorp";

export type AnalysisKind = "face" | "hair";

export const ANALYSIS_KINDS: AnalysisKind[] = ["face", "hair"];

export function isAnalysisKind(v: unknown): v is AnalysisKind {
  return v === "face" || v === "hair";
}

export type Issue = {
  issueType: string;
  detected?: boolean; // present in the result (undefined for categorical items)
  score: number | null; // 0..1 health score (higher = better)
  confidence: number | null;
  image?: string | null; // overlay image URL for display (presigned)
  details?: { type?: string; imageKey?: string }; // categorical + stored S3 key
};

export type AnalysisResult = {
  requestId: string | null;
  raw: unknown;
  issues: Issue[];
};

/** Thrown when the photo has no usable subject (no face / no hair-scalp). */
export class NoSubjectError extends Error {
  constructor(public kind: AnalysisKind) {
    super("no_subject");
    this.name = "NoSubjectError";
  }
}

// Concern catalogs surfaced per mode. Provider responses map onto these keys.
// Aligned with the Perfect Corp skin-analysis output keys (see lib/perfectcorp).
export const FACE_CONCERNS = [
  "acne",
  "wrinkles",
  "pores",
  "texture",
  "redness",
  "oiliness",
  "moisture",
  "radiance",
  "firmness",
  "dark_circle",
  "eye_bag",
  "tear_trough",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "age_spot",
] as const;

// Appearance-based only (phone photo). Dandruff / oily-scalp / redness are NOT
// included — those need a trichoscope device, not a phone (see plan).
export const HAIR_CONCERNS = [
  "hair_density",
  "hairline",
  "thinning",
  "greying",
  "frizz",
  "dryness",
  "split_ends",
] as const;

export function concernsFor(kind: AnalysisKind): readonly string[] {
  return kind === "face" ? FACE_CONCERNS : HAIR_CONCERNS;
}

// The single categorical item per mode (a label, not a severity).
const CATEGORICAL: Record<AnalysisKind, { issueType: string; value: string }> = {
  face: { issueType: "skin_type", value: "combination" },
  hair: { issueType: "hair_type", value: "wavy" },
};

/** Deterministic demo issues for a kind (used when ANALYZER_MOCK=true). */
export function mockIssues(kind: AnalysisKind): Issue[] {
  // Perfect Corp standard: each concern carries a 0–1 health score (higher =
  // better). Spread deterministically across a realistic 0.40–0.99 range.
  const issues: Issue[] = concernsFor(kind).map((issueType, i) => ({
    issueType,
    score: (((i * 37) % 60) + 40) / 100,
    confidence: null,
  }));
  if (kind === "face") {
    issues.push({ issueType: "overall", score: 0.74, confidence: null });
    issues.push({
      issueType: "skin_age",
      score: null,
      confidence: null,
      details: { type: "32" },
    });
  }
  const cat = CATEGORICAL[kind];
  issues.push({
    issueType: cat.issueType,
    score: null,
    confidence: null,
    details: { type: cat.value },
  });
  return issues;
}

/**
 * True when a real provider handles this mode. Perfect Corp handles skin (face).
 * Hair isn't wired, so it falls back to mock.
 */
export function isProviderConfigured(kind: AnalysisKind): boolean {
  if (kind !== "face") return false;
  return isPerfectCorpConfigured();
}

/** Run a real analysis for the given mode against the processed image bytes. */
export async function analyze(
  kind: AnalysisKind,
  jpeg: Buffer,
): Promise<AnalysisResult> {
  return analyzeWithPerfectCorp(kind, jpeg);
}
