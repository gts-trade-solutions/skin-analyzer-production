"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Perfect Corp YouCam "JS Camera Kit". Loads the hosted SDK once, opens the
// guided skin-analysis camera into #YMK-module (permissions + lighting/pose/
// distance validation + auto-capture), then shows a short review window with a
// Retake option before analysis. The SDK container stays mounted across the
// whole session so retake reopens in place (no teardown/rebuild). Analysis
// stays on our server (/api/analyze).
//
// Captured payload (imageFormat "base64"):
//   { mode, images: [ { phase, image: "data:image/jpeg;base64,…", width, height } ] }
const SDK_SRC = "https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js";
const CLOSE_EVENTS = ["closed", "close", "cancel", "cancelled"];
const REVIEW_SECONDS = 5;

interface Ymk {
  init?: (cfg: Record<string, unknown>) => void;
  openCameraKit?: () => void;
  close?: () => void;
  addEventListener?: (event: string, cb: (result: unknown) => void) => void;
  removeEventListener?: (event: string, cb: (result: unknown) => void) => void;
}

declare global {
  interface Window {
    YMK?: Ymk;
    YMKAsyncInit?: () => void;
    ymkAsyncInit?: () => void;
  }
}

let scriptPromise: Promise<Ymk> | null = null;
function loadSdk(): Promise<Ymk> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YMK) return Promise.resolve(window.YMK);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<Ymk>((resolve, reject) => {
    const done = () => (window.YMK ? resolve(window.YMK) : reject(new Error("YMK missing")));
    window.YMKAsyncInit = done;
    window.ymkAsyncInit = done;
    if (document.querySelector(`script[src="${SDK_SRC}"]`)) {
      let n = 0;
      const t = setInterval(() => {
        if (window.YMK) {
          clearInterval(t);
          resolve(window.YMK);
        } else if (++n > 120) {
          clearInterval(t);
          reject(new Error("YMK load timeout"));
        }
      }, 100);
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => window.YMK && resolve(window.YMK);
    s.onerror = () => reject(new Error("sdk.js failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function toFile(item: unknown): Promise<File | null> {
  if (item instanceof Blob) {
    return new File([item], "capture.jpg", { type: item.type || "image/jpeg" });
  }
  if (typeof item === "string" && item.length > 0) {
    const dataUrl = item.startsWith("data:")
      ? item
      : `data:image/jpeg;base64,${item}`;
    const blob = await fetch(dataUrl).then((r) => r.blob());
    return new File([blob], "capture.jpg", { type: blob.type || "image/jpeg" });
  }
  return null;
}

async function capturedToFile(result: unknown): Promise<File | null> {
  const r = result as { images?: Array<{ image?: unknown }> } | null;
  const first = r?.images?.[0]?.image;
  if (first !== undefined) return toFile(first);
  if (Array.isArray(result)) return toFile(result[0]);
  return toFile(result);
}

export function CameraKit({
  onCapture,
  onCancel,
  mode = "skincare",
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
  mode?: string; // YMK faceDetectionMode: "skincare" | hair density mode | …
}) {
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [phase, setPhase] = useState<"loading" | "camera" | "review">("loading");
  const [preview, setPreview] = useState<string | null>(null);
  const [count, setCount] = useState(REVIEW_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const proceedingRef = useRef(false); // capture/close in progress → ignore stray close

  const proceed = () => {
    const f = fileRef.current;
    if (f) onCaptureRef.current(f);
  };
  const proceedRef = useRef(proceed);
  proceedRef.current = proceed;

  const retake = () => {
    proceedingRef.current = false;
    fileRef.current = null;
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setPhase("camera");
    // Reopen after the container is visible again (next frame).
    requestAnimationFrame(() => {
      try {
        window.YMK?.openCameraKit?.();
      } catch (e) {
        console.error("[camera-kit] reopen threw:", e);
      }
    });
  };

  // Review countdown → auto-proceed to analysis.
  useEffect(() => {
    if (phase !== "review") return;
    let remaining = REVIEW_SECONDS;
    setCount(remaining);
    const id = setInterval(() => {
      remaining -= 1;
      setCount(remaining > 0 ? remaining : 0);
      if (remaining <= 0) {
        clearInterval(id);
        proceedRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // SDK lifecycle (once).
  useEffect(() => {
    let cancelled = false;

    const onCaptured = (result: unknown) => {
      if (proceedingRef.current || cancelled) return;
      void capturedToFile(result).then((file) => {
        if (cancelled || proceedingRef.current) return;
        if (file) {
          proceedingRef.current = true;
          fileRef.current = file;
          setPreview((p) => {
            if (p) URL.revokeObjectURL(p);
            return URL.createObjectURL(file);
          });
          try {
            window.YMK?.close?.();
          } catch {
            // ignore
          }
          setPhase("review");
        } else {
          console.warn("[camera-kit] captured payload had no image:", result);
        }
      });
    };

    const onClosed = () => {
      if (proceedingRef.current || cancelled) return; // our own close, not a user cancel
      cancelled = true;
      onCancelRef.current();
    };

    loadSdk()
      .then((YMK) => {
        if (cancelled) return;
        YMK.addEventListener?.("faceDetectionCaptured", onCaptured);
        CLOSE_EVENTS.forEach((ev) => YMK.addEventListener?.(ev, onClosed));
        try {
          YMK.init?.({
            faceDetectionMode: modeRef.current,
            imageFormat: "base64",
            language: "enu",
          });
        } catch (e) {
          console.error("[camera-kit] init threw:", e);
        }
        try {
          YMK.openCameraKit?.();
          setPhase("camera");
        } catch (e) {
          console.error("[camera-kit] openCameraKit threw:", e);
          setError("Camera kit failed to open — see console.");
        }
      })
      .catch((e) => {
        console.error("[camera-kit] load failed:", e);
        if (!cancelled) setError("Couldn't load the camera kit.");
      });

    return () => {
      cancelled = true;
      const YMK = window.YMK;
      try {
        YMK?.removeEventListener?.("faceDetectionCaptured", onCaptured);
        CLOSE_EVENTS.forEach((ev) => YMK?.removeEventListener?.(ev, onClosed));
        YMK?.close?.();
      } catch {
        // ignore teardown errors
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Persistent SDK container — kept in the DOM so retake reopens in place. */}
      <div
        id="YMK-module"
        className={phase === "review" ? "hidden" : "w-full overflow-hidden rounded-xl"}
      />

      {phase === "review" && preview ? (
        <>
          <div className="relative overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Captured" className="w-full" />
            {/* Depleting timer bar across the top. */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-black/25">
              <div
                className="bg-gold h-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${(count / REVIEW_SECONDS) * 100}%` }}
              />
            </div>
            {/* Prominent countdown badge + caption. */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-12 pb-3 text-white">
              <span className="bg-gold grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-bold tabular-nums shadow-md">
                {count}
              </span>
              <span className="text-sm font-semibold">
                Analyzing in {count}s — tap Retake to redo
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={retake}>
              Retake
            </Button>
            <Button className="flex-1" onClick={() => proceed()}>
              Analyze now
            </Button>
          </div>
        </>
      ) : (
        <>
          {error ? (
            <p className="text-destructive text-center text-sm">{error}</p>
          ) : phase === "loading" ? (
            <p className="text-muted-foreground text-center text-sm">
              Loading camera…
            </p>
          ) : null}
          <Button variant="outline" className="w-full" onClick={() => onCancel()}>
            {error ? "Back" : "Cancel"}
          </Button>
        </>
      )}
    </div>
  );
}
