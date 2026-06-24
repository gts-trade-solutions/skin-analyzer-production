"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import {
  ResultsView,
  ResultsSkeleton,
  type ResultIssue,
} from "@/components/results-view";
import { FaceCamera } from "@/components/face-camera";

const KIND_CONFIG = {
  face: {
    title: "Analyze Face",
    guide: "Take a clear, front-facing selfie in good light.",
    facing: "user" as const,
    subject: "face",
    tips: [
      "Neutral expression — eyes open, mouth closed",
      "Remove glasses and brush hair back to show your forehead",
      "Remove makeup for the most accurate result",
      "Bright, even light — no harsh shadows, glare, or overexposure",
    ],
  },
  hair: {
    title: "Analyze Hair",
    guide: "Take a close-up of your scalp and hairline in good light.",
    facing: "environment" as const,
    subject: "hair and scalp",
    tips: [
      "Use bright, even light on the area",
      "Hold the camera steady and close",
      "Keep the scalp / hairline in sharp focus",
    ],
  },
};

type Kind = keyof typeof KIND_CONFIG;
type CaptureSource = "camera" | "file";

type AnalyzeResponse = {
  analysisId: string;
  kind: Kind;
  issues: ResultIssue[];
};

// idle → camera → checking (auto face-score) → ready (ok) → loading → done
// A failed camera capture auto-loops back to camera up to MAX_AUTO_RETAKES.
type Status =
  | "idle"
  | "camera"
  | "checking"
  | "ready"
  | "loading"
  | "done"
  | "error";

const MAX_AUTO_RETAKES = 3;
const MIN_QUALITY = 90;

function messageForError(status: number, code: string, subject: string): string {
  switch (code) {
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "no_subject":
      return `We couldn't read your ${subject}. Get closer, use good light, and try again.`;
    case "low_quality":
      return "The photo quality is too low. Use a clear, well-lit, front-facing photo and try again.";
    case "provider_busy":
      return "The analyzer is busy right now. Please try again in a moment.";
    case "invalid_image":
      return "That image couldn't be read. Try another photo.";
    case "too_large":
      return "That photo is too large (max 5 MB).";
    case "unsupported_type":
      return "Unsupported format. Use a JPG, PNG, or WebP photo.";
    case "provider_credits":
      return "Analysis credits exhausted. Top up your provider account to continue.";
    case "quota_exceeded":
      return "You've used your analysis. Request more from the admin on the home screen.";
    case "not_configured":
      return "Analysis isn't connected yet. Add your provider API keys to enable it.";
    default:
      return status === 0
        ? "Network error. Check your connection and try again."
        : "Something went wrong. Please try again.";
  }
}

function detectMessage(reason: string, subject: string): string {
  switch (reason) {
    case "no_face":
      return `No ${subject} detected. Center your face in good light.`;
    case "low_quality":
      return "Photo quality is too low (blurry or dim).";
    case "invalid_image":
      return "That image couldn't be read.";
    case "network":
      return "Couldn't reach the checker. Check your connection.";
    default:
      return "Couldn't verify a face.";
  }
}

export default function AnalyzePage() {
  const params = useParams<{ kind: string }>();
  const kind: Kind = params.kind === "hair" ? "hair" : "face";
  const config = KIND_CONFIG[kind];

  const fileRef = useRef<HTMLInputElement>(null);
  const attemptsRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [issues, setIssues] = useState<ResultIssue[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Face-detection gate.
  const [detect, setDetect] = useState<"idle" | "checking" | "ok" | "fail">(
    "idle",
  );
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [quality, setQuality] = useState<number | null>(null);

  function acceptPhoto(f: File, source: CaptureSource) {
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setStatus("checking");
    void runDetect(f, source);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptPhoto(f, "file");
    // Allow re-picking the same file later.
    if (fileRef.current) fileRef.current.value = "";
  }

  function retake() {
    attemptsRef.current = 0;
    setDetect("idle");
    setDetectMsg(null);
    setQuality(null);
    setStatus("camera");
  }

  function reset() {
    attemptsRef.current = 0;
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIssues([]);
    setErrorMsg(null);
    setDetect("idle");
    setDetectMsg(null);
    setQuality(null);
    setStatus("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  // Auto-run the face-score check on the captured/chosen photo. A camera
  // capture that scores under 90 re-opens the camera automatically.
  async function runDetect(f: File, source: CaptureSource) {
    setDetect("checking");
    setDetectMsg(null);
    setQuality(null);

    let ok = false;
    let q: number | null = null;
    let reason = "";
    try {
      const body = new FormData();
      body.append("image", f);
      body.append("kind", kind);
      const res = await fetch("/api/detect", { method: "POST", body });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        reason?: string;
        quality?: number;
      };
      ok = !!data.ok;
      q = typeof data.quality === "number" ? data.quality : null;
      reason = data.reason ?? "";
    } catch {
      reason = "network";
    }

    if (ok) {
      setDetect("ok");
      setQuality(q);
      attemptsRef.current = 0;
      setStatus("ready");
      return;
    }

    const why =
      reason === "low_quality"
        ? q != null
          ? `face quality ${Math.round(q)}/100 (needs ${MIN_QUALITY}+)`
          : `face quality too low (needs ${MIN_QUALITY}+)`
        : detectMessage(reason, config.subject).replace(/\.$/, "").toLowerCase();

    setQuality(q);
    setDetect("fail");

    // Auto-retake only for live camera captures, capped to avoid a loop.
    if (source === "camera" && attemptsRef.current < MAX_AUTO_RETAKES) {
      attemptsRef.current += 1;
      setDetectMsg(`Capture failed — ${why}. Retaking…`);
      window.setTimeout(() => setStatus("camera"), 1700);
    } else {
      setDetectMsg(
        `Capture failed — ${why}. ` +
          (source === "camera"
            ? "Retake facing the camera in bright, even light."
            : "Choose a clearer, well-lit photo."),
      );
      setStatus("ready");
    }
  }

  async function analyze() {
    if (!file) return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("kind", kind);
      const res = await fetch("/api/analyze", { method: "POST", body });
      if (!res.ok) {
        let code = "";
        try {
          code = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          // non-JSON error body
        }
        setErrorMsg(messageForError(res.status, code, config.subject));
        setStatus("error");
        return;
      }
      const data = (await res.json()) as AnalyzeResponse;
      setIssues(data.issues ?? []);
      setStatus("done");
    } catch {
      setErrorMsg(messageForError(0, "", config.subject));
      setStatus("error");
    }
  }

  // Hair analysis isn't ready yet — show a "coming soon" screen.
  if (kind === "hair") {
    return (
      <main className="flex min-h-dvh flex-col gap-6 p-6">
        <AppHeader title="Analyze Hair" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="bg-gold/15 text-gold rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
            Coming soon
          </span>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Hair analysis is on the way
          </h2>
          <p className="text-muted-foreground max-w-xs text-sm">
            We&apos;re putting the finishing touches on the hair analyzer. In the
            meantime, try the face analyzer.
          </p>
          <Button render={<Link href="/analyze/face" />} size="lg" className="mt-2">
            Analyze Face
          </Button>
          <Link href="/" className="text-muted-foreground text-sm underline">
            Back home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 p-6">
      <AppHeader title={config.title} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />

      {status === "done" ? (
        <>
          <ResultsView issues={issues} fallbackImage={previewUrl} />
          <Button variant="outline" className="w-full" onClick={reset}>
            Start over
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            For cosmetic guidance only. Not a medical diagnosis.
          </p>
        </>
      ) : status === "camera" ? (
        <FaceCamera
          facing={config.facing}
          autoCapture={kind === "face"}
          tips={config.tips}
          onCapture={(f) => acceptPhoto(f, "camera")}
          onCancel={() => setStatus("idle")}
        />
      ) : (
        <>
          {/* Same 3:4 portrait frame as the camera, so the capture isn't recropped. */}
          <div className="bg-muted relative mx-auto flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`${config.subject} preview`}
                className="h-full w-full object-cover"
              />
            ) : (
              <p className="text-muted-foreground px-6 text-center text-sm">
                {config.guide}
              </p>
            )}

            {status === "checking" && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 px-6 text-center text-white">
                {detect === "fail" ? (
                  <p className="text-sm font-medium">⚠ {detectMsg}</p>
                ) : (
                  <p className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Checking your photo…
                  </p>
                )}
              </div>
            )}
          </div>

          {status === "idle" && (
            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={() => setStatus("camera")}>
                Use camera
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                Choose photo
              </Button>
            </div>
          )}

          {status === "ready" && (
            <div className="space-y-3">
              {detect === "ok" ? (
                <p className="text-sm font-medium text-emerald-600">
                  ✓ Face detected
                  {quality != null ? ` · quality ${Math.round(quality)}/100` : ""}
                </p>
              ) : (
                <p className="text-destructive text-sm">{detectMsg}</p>
              )}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={retake}>
                  Retake
                </Button>
                <Button
                  className="flex-1"
                  onClick={analyze}
                  disabled={detect !== "ok"}
                >
                  Analyze
                </Button>
              </div>
              {detect !== "ok" && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-muted-foreground mx-auto block text-xs underline"
                >
                  Choose a photo instead
                </button>
              )}
            </div>
          )}

          {status === "loading" && (
            <div className="space-y-4">
              <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                <span className="border-foreground/25 border-t-foreground inline-block h-4 w-4 animate-spin rounded-full border-2" />
                Analyzing your {config.subject}…
              </p>
              <ResultsSkeleton />
            </div>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <p className="text-destructive text-sm">{errorMsg}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStatus(file ? "ready" : "idle")}
              >
                Try again
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
