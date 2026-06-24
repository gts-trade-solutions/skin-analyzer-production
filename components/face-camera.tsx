"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getFaceDetector,
  evaluateFace,
  computeCrop,
} from "@/lib/face-detector";

const COUNTDOWN_MS = 2100; // total "hold still" time -> a 3·2·1 countdown
const COUNTDOWN_STEP = 700; // ms per countdown number
const DETECT_INTERVAL_MS = 80; // ~12 fps detection

export function FaceCamera({
  facing,
  autoCapture,
  tips,
  onCapture,
  onCancel,
}: {
  facing: "user" | "environment";
  autoCapture: boolean;
  tips: string[];
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const goodSinceRef = useRef<number | null>(null);
  const centersRef = useRef<{ x: number; y: number }[]>([]);
  const capturedRef = useRef(false);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState("Starting camera…");
  const [ok, setOk] = useState(false);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function capture() {
    if (capturedRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    capturedRef.current = true;
    // Capture the centered portrait crop that the user sees framed.
    const crop = computeCrop(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w);
    canvas.height = Math.round(crop.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      capturedRef.current = false;
      return;
    }
    ctx.drawImage(
      video,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          capturedRef.current = false;
          return;
        }
        stop();
        onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  // Average luma (0–255) of the face crop, for a live brightness check.
  function sampleBrightness(
    video: HTMLVideoElement,
    crop: { x: number; y: number; w: number; h: number },
  ): number | null {
    let c = sampleRef.current;
    if (!c) {
      c = document.createElement("canvas");
      c.width = 32;
      c.height = 42;
      sampleRef.current = c;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return sum / (data.length / 4);
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let detector: Awaited<ReturnType<typeof getFaceDetector>> | null = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      } catch {
        if (!cancelled)
          setError(
            "Couldn't access the camera. Allow camera access, or choose a photo instead.",
          );
        return;
      }

      if (autoCapture) {
        try {
          detector = await getFaceDetector();
        } catch {
          detector = null; // detection unavailable → manual capture still works
        }
      }
      if (cancelled) return;
      setReady(true);
      setGuidance(
        autoCapture && detector
          ? "Looking for your face…"
          : "Tap capture when ready",
      );

      if (!autoCapture || !detector) return;

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const video = videoRef.current;
        if (!video || !video.videoWidth || !detector || capturedRef.current)
          return;
        const now = performance.now();
        if (now - lastDetectRef.current < DETECT_INTERVAL_MS) return;
        lastDetectRef.current = now;

        const W = video.videoWidth;
        const H = video.videoHeight;
        const crop = computeCrop(W, H);
        const res = detector.detectForVideo(video, now);
        const detections = res.detections ?? [];
        const brightness = sampleBrightness(video, crop);
        const q = evaluateFace(detections, crop, W, H, brightness);
        setScore(q.score);

        // Require the face to also be steady (not moving) before capturing.
        let stable = true;
        const bb = detections[0]?.boundingBox;
        if (q.ok && bb) {
          const c = { x: bb.originX + bb.width / 2, y: bb.originY + bb.height / 2 };
          const arr = centersRef.current;
          arr.push(c);
          if (arr.length > 6) arr.shift();
          const maxDev = Math.max(
            ...arr.map((p) => Math.hypot(p.x - c.x, p.y - c.y)),
          );
          stable = maxDev < crop.w * 0.03;
        } else {
          centersRef.current = [];
        }

        if (q.ok && stable) {
          if (goodSinceRef.current == null) goodSinceRef.current = now;
          const elapsed = now - goodSinceRef.current;
          setOk(true);
          setProgress(Math.min(1, elapsed / COUNTDOWN_MS));
          setCountdown(
            Math.max(
              1,
              Math.min(3, Math.ceil((COUNTDOWN_MS - elapsed) / COUNTDOWN_STEP)),
            ),
          );
          setGuidance("Hold still…");
          if (elapsed >= COUNTDOWN_MS) capture();
        } else {
          goodSinceRef.current = null;
          setOk(false);
          setProgress(0);
          setCountdown(null);
          setGuidance(q.ok ? "Hold still…" : q.message);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, autoCapture]);

  return (
    <div className="space-y-3">
      <div className="bg-muted relative mx-auto flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl">
        {error ? (
          <p className="text-muted-foreground px-6 text-center text-sm">
            {error}
          </p>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={
                facing === "user" ? { transform: "scaleX(-1)" } : undefined
              }
            />
            {facing === "user" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`h-[74%] w-[72%] rounded-[50%] border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] transition-colors ${
                    ok ? "border-emerald-400" : "border-white/70"
                  }`}
                />
              </div>
            )}
            {countdown != null && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative grid h-28 w-28 place-items-center">
                  <svg
                    className="absolute inset-0 h-full w-full -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="5"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#e6b450"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 45}
                      strokeDashoffset={(1 - progress) * 2 * Math.PI * 45}
                      style={{ transition: "stroke-dashoffset 120ms linear" }}
                    />
                  </svg>
                  <span className="text-6xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    {countdown}
                  </span>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="rounded-full bg-black/55 px-3 py-1 text-xs text-white">
                {guidance}
              </span>
            </div>
            {autoCapture && (
              <div className="pointer-events-none absolute right-2 top-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${
                    score >= 90
                      ? "bg-emerald-600/85"
                      : score >= 70
                        ? "bg-amber-600/85"
                        : "bg-red-600/85"
                  }`}
                >
                  Quality {score}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {!error && tips.length > 0 && (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            stop();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={capture}
          disabled={!ready || !!error}
        >
          Capture
        </Button>
      </div>
    </div>
  );
}
