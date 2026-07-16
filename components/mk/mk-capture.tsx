"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { FaceCamera } from "@/components/face-camera";
import { CameraKit } from "@/components/camera-kit";
import { Button } from "@/components/ui/button";

// Same feature flag the standalone /analyze page uses. When on, capture + photo
// quality are handled by the Perfect Corp Camera Kit SDK (guided capture, its
// own validation) — so we skip the older MediaPipe /api/detect gate entirely.
const USE_CAMERA_KIT = process.env.NEXT_PUBLIC_USE_CAMERA_KIT === "true";

const TIPS = [
  "Neutral expression — eyes open, mouth closed",
  "Remove glasses and brush hair back to show your forehead",
  "Remove makeup for the most accurate result",
  "Bright, even light — no harsh shadows, glare, or overexposure",
];

const MAX_AUTO_RETAKES = 2;

type Phase = "intro" | "camera" | "checking" | "analyzing" | "error";

/** Heuristic: is this a phone/tablet (touch-first) rather than a desktop? */
function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  try {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const smallish = window.matchMedia("(max-width: 1024px)").matches;
    return coarse && smallish && navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

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

/**
 * MadeNKorea integration capture (skin).
 *
 * - Desktop → no capture. Shows a QR to continue on the phone (via /mk/go),
 *   because a phone selfie is far better for skin analysis.
 * - Mobile → Camera Kit SDK when NEXT_PUBLIC_USE_CAMERA_KIT is on (guided
 *   capture + built-in quality check), otherwise the MediaPipe FaceCamera +
 *   /api/detect fallback.
 *
 * On success it submits to /api/mk/analyze, which posts the result back to
 * MadeNKorea and returns the results URL to redirect to.
 */
export function MkCapture({
  name,
  continueUrl,
}: {
  name: string | null;
  continueUrl: string | null;
}) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState<string | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  // On desktop, render the "continue on your phone" QR.
  useEffect(() => {
    if (isMobile === false && continueUrl) {
      QRCode.toDataURL(continueUrl, { width: 240, margin: 1 })
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [isMobile, continueUrl]);

  // Submit a captured image to the integration analyze endpoint.
  async function submit(file: File, cameraKit: boolean) {
    setPhase("analyzing");
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("camera_kit", cameraKit ? "true" : "false");
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

  // Camera Kit already validated the shot → go straight to analysis.
  function onKitCapture(file: File) {
    void submit(file, true);
  }

  // FaceCamera fallback → run the /api/detect quality gate first.
  async function onFaceCapture(file: File) {
    setPhase("checking");
    setMessage(null);
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
    void submit(file, false);
  }

  // ── Desktop: QR handoff to phone (no capture) ────────────────────────
  if (isMobile === false) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Continue on your phone</h1>
        <p className="text-sm text-muted-foreground">
          A skin analysis needs a clear phone selfie. Scan this code with your
          phone camera to continue — you&apos;ll pick up right where you left
          off.
        </p>
        {qr ? (
          <img
            src={qr}
            alt="Scan to continue on your phone"
            className="mx-auto rounded-lg border bg-white p-2"
            width={240}
            height={240}
          />
        ) : (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            {continueUrl
              ? "Preparing your code…"
              : "Open this page on your phone to continue."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The code expires in a few minutes for your security.
        </p>
      </div>
    );
  }

  if (isMobile === null) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  // ── Mobile: capture ──────────────────────────────────────────────────
  if (phase === "camera") {
    return (
      <div className="w-full max-w-md">
        {message ? (
          <p className="mb-3 rounded-md bg-amber-50 p-3 text-center text-sm text-amber-800">
            {message}
          </p>
        ) : null}
        {USE_CAMERA_KIT ? (
          <CameraKit
            mode="skincare"
            onCapture={onKitCapture}
            onCancel={() => setPhase("intro")}
          />
        ) : (
          <FaceCamera
            facing="user"
            autoCapture
            tips={TIPS}
            onCapture={onFaceCapture}
            onCancel={() => setPhase("intro")}
          />
        )}
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

  // intro + error
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
