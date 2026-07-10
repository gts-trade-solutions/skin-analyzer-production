"use client";

import { useRef, useState } from "react";
import { FaceCamera } from "@/components/face-camera";
import { Button } from "@/components/ui/button";

const TIPS = [
  "Neutral expression — eyes open, mouth closed",
  "Remove glasses and brush hair back to show your forehead",
  "Remove makeup for the most accurate result",
  "Bright, even light — no harsh shadows, glare, or overexposure",
];

/** Friendly message for an /api/mk/analyze failure. */
function errorMessage(status: number, code?: string): string {
  switch (code) {
    case "no_subject":
      return "We couldn't find a face in that photo. Retake facing the camera.";
    case "low_quality":
      return "The photo was too low quality. Retake in bright, even light.";
    case "invalid_image":
      return "That image couldn't be read. Please try another photo.";
    case "provider_busy":
      return "The analyzer is busy right now. Please try again in a moment.";
    case "provider_credits":
      return "The analysis service is temporarily unavailable. Please try later.";
    case "session_expired":
      return "Your session expired. Please restart from MadeNKorea.";
    case "postback_failed":
      return "We analyzed your skin but couldn't save the result. Please try again.";
    case "not_configured":
      return "The analyzer isn't fully set up yet. Please try again later.";
    default:
      return status === 429
        ? "Too many attempts. Please wait a moment and try again."
        : "Something went wrong while analyzing. Please try again.";
  }
}

const MAX_AUTO_RETAKES = 2;

type Phase = "intro" | "camera" | "checking" | "analyzing" | "error";

/**
 * MadeNKorea integration capture (skin). Reuses the analyzer's FaceCamera +
 * /api/detect quality gate, then submits to /api/mk/analyze, which posts the
 * result back to MadeNKorea and returns the results URL to redirect to.
 *
 * Unlike the standalone /analyze page, there is no in-app results screen —
 * the canonical result lives on MadeNKorea (Q2 default).
 */
export function MkCapture({ name }: { name: string | null }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState<string | null>(null);
  const attemptsRef = useRef(0);

  async function onCapture(file: File) {
    setPhase("checking");
    setMessage(null);

    // Quality gate (reuses the standalone detect route).
    let ok = false;
    let reason = "";
    let quality: number | null = null;
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("kind", "face");
      const res = await fetch("/api/detect", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        quality?: number;
      };
      ok = !!data.ok;
      reason = data.reason ?? "";
      quality = typeof data.quality === "number" ? data.quality : null;
    } catch {
      reason = "network";
    }

    if (!ok) {
      const why =
        reason === "low_quality"
          ? quality != null
            ? `face quality is too low (${Math.round(quality)}/100)`
            : "face quality is too low"
          : reason === "no_subject"
            ? "no face detected"
            : "we couldn't check the photo";
      if (attemptsRef.current < MAX_AUTO_RETAKES) {
        attemptsRef.current += 1;
        setMessage(`Capture failed — ${why}. Let's retake.`);
        setPhase("camera");
      } else {
        setMessage(
          `Capture failed — ${why}. Retake facing the camera in bright, even light.`,
        );
        setPhase("error");
      }
      return;
    }

    // Analyze + post back.
    setPhase("analyzing");
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("camera_kit", "false");
      const res = await fetch("/api/mk/analyze", { method: "POST", body });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string })
          .error;
        setMessage(errorMessage(res.status, code));
        setPhase("error");
        return;
      }
      const data = (await res.json()) as { redirectUrl?: string };
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl; // → MadeNKorea results
        return;
      }
      setMessage("We couldn't open your results. Please try again.");
      setPhase("error");
    } catch {
      setMessage("Network problem while analyzing. Please try again.");
      setPhase("error");
    }
  }

  if (phase === "camera") {
    return (
      <div className="w-full max-w-md">
        {message ? (
          <p className="mb-3 rounded-md bg-amber-50 p-3 text-center text-sm text-amber-800">
            {message}
          </p>
        ) : null}
        <FaceCamera
          facing="user"
          autoCapture
          tips={TIPS}
          onCapture={onCapture}
          onCancel={() => setPhase("intro")}
        />
      </div>
    );
  }

  if (phase === "checking" || phase === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        <p className="text-sm text-muted-foreground">
          {phase === "checking" ? "Checking your photo…" : "Analyzing your skin…"}
        </p>
      </div>
    );
  }

  // intro + error share the CTA card
  return (
    <div className="w-full max-w-md space-y-4 text-center">
      {phase === "error" && message ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">
            Ready to analyze{name ? `, ${name}` : ""}
          </h1>
          <ul className="mx-auto max-w-xs space-y-1 text-left text-sm text-muted-foreground">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          setMessage(null);
          setPhase("camera");
        }}
      >
        {phase === "error" ? "Try again" : "Open camera"}
      </Button>
    </div>
  );
}
