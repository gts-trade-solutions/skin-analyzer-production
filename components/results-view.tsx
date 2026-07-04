"use client";

import { useEffect, useState } from "react";
import {
  concernName,
  concernDescription,
  scoreRating,
  type Rating,
} from "@/lib/concern-info";
import { MobileGate } from "@/components/mobile-gate";

export type ResultIssue = {
  issueType: string;
  score: number | null;
  confidence?: number | null;
  image?: string | null;
  details?: { type?: string };
};

const NON_CONCERN_TYPES = ["overall", "skin_age", "skin_type", "resize_image"];

/** Animate a number from 0 up to `target` (easeOutCubic). */
function useCountUp(target: number | null, duration = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target == null) {
      setVal(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/**
 * A 0–100 score track with the three guidance bands (Needs care / Fair / Good)
 * and a marker at the user's score, so the number reads against its reference
 * range. Bands break at 50 and 75 (matching scoreRating).
 */
function ScoreScale({
  score01,
  rating,
  animate,
  delayMs = 0,
}: {
  score01: number;
  rating: Rating;
  animate: boolean;
  delayMs?: number;
}) {
  const pct = Math.round(score01 * 100);
  return (
    <div>
      <div className="relative h-2 w-full overflow-hidden rounded-full">
        {/* Guidance bands (subtle) */}
        <div className="absolute inset-0 flex">
          <div className="h-full w-1/2 bg-red-500/15" />
          <div className="h-full w-1/4 bg-amber-500/20" />
          <div className="h-full w-1/4 bg-emerald-500/20" />
        </div>
        {/* Band dividers at 50 and 75 */}
        <div className="bg-background/70 absolute inset-y-0 left-1/2 w-px" />
        <div className="bg-background/70 absolute inset-y-0 left-3/4 w-px" />
        {/* Score marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
          style={{ left: animate ? `${pct}%` : "0%", transitionDelay: `${delayMs}ms` }}
        >
          <div
            className={`-ml-[3px] h-3 w-1.5 rounded-full ring-2 ring-white ${rating.barClass} shadow-sm`}
          />
        </div>
      </div>
      {/* Threshold scale, aligned to the band breaks */}
      <div className="text-muted-foreground relative mt-1 h-3.5 text-[11px] font-medium tabular-nums">
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/2 -translate-x-1/2">50</span>
        <span className="absolute left-3/4 -translate-x-1/2">75</span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

/**
 * Renders an analysis result: a pinned image viewer (tap a concern to highlight
 * it), a summary card, and the per-concern breakdown. Shared by the live
 * analyze screen and the history detail screen.
 */
export function ResultsView({
  issues,
  fallbackImage = null,
  heading = "Skin breakdown",
}: {
  issues: ResultIssue[];
  fallbackImage?: string | null;
  heading?: string;
}) {
  const baseImage =
    issues.find((i) => i.issueType === "resize_image")?.image ?? fallbackImage;
  const [selectedImage, setSelectedImage] = useState<string | null>(baseImage);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(
    baseImage ? "Analyzed photo" : null,
  );
  const [selectedIsConcern, setSelectedIsConcern] = useState(false);

  // Animate the score bars from 0 to their value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Scroll progress (0→1 over the first ~220px): hides the cue and grows the
  // pinned image from a narrow 3:4 to full width (it zooms in as it widens).
  const [scrolled, setScrolled] = useState(false);
  const [zoom, setZoom] = useState(0);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setScrolled(y > 16);
      setZoom(Math.min(1, y / 220));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const overall = issues.find((i) => i.issueType === "overall");
  const skinAge = issues.find((i) => i.issueType === "skin_age");
  const skinType = issues.find((i) => i.issueType === "skin_type");
  const concerns = issues
    .filter((i) => !NON_CONCERN_TYPES.includes(i.issueType))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)); // worst first
  const hasImages = concerns.some((i) => i.image);
  const overallPct =
    overall?.score != null ? Math.round(overall.score * 100) : null;
  const animatedOverall = useCountUp(overallPct);

  return (
    <div className="flex flex-col gap-4">
      {selectedImage && (
        <div
          style={{
            // Grow from a 33vh-wide 3:4 frame to full column width. aspect-[3/4]
            // keeps the height proportional, so the ratio holds as it zooms.
            width: `calc(33vh + (100% - 33vh) * ${zoom})`,
          }}
          className="reveal-fade bg-muted sticky top-2 z-10 flex aspect-[3/4] max-w-full shrink-0 self-center items-center justify-center overflow-hidden rounded-2xl shadow-[0_12px_34px_-14px_oklch(0.4_0.02_60/0.3)] ring-1 ring-black/5 will-change-[width]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedImage}
            alt={selectedLabel ?? "result"}
            className="h-full w-full object-cover"
          />
          {selectedLabel && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-7 pb-2 text-center text-white">
              <div className="text-xs font-medium">{selectedLabel}</div>
              {selectedIsConcern && (
                <div className="text-[10px] text-white/75">
                  Highlighted areas show where this was detected
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedImage && concerns.length > 0 && (
        <div
          className={`text-muted-foreground pointer-events-none -mt-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity duration-300 ${
            scrolled ? "opacity-0" : "opacity-100"
          }`}
        >
          <span>Scroll for the full breakdown</span>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 animate-bounce"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}

      {(overall || skinAge || skinType) && (
        <div className="card-premium reveal p-5">
          <div className="flex items-end justify-center gap-1">
            <span className="text-5xl font-bold tracking-tight tabular-nums">
              {overallPct != null ? animatedOverall : "—"}
            </span>
            <span className="text-muted-foreground mb-1.5 text-sm">/100</span>
          </div>
          {overall?.score != null && (
            <p
              className={`text-center text-sm font-medium ${scoreRating(overall.score).textClass}`}
            >
              {scoreRating(overall.score).label} overall
            </p>
          )}
          {overall?.score != null && (
            <div className="mx-auto mt-3 max-w-[15rem]">
              <ScoreScale
                score01={overall.score}
                rating={scoreRating(overall.score)}
                animate={mounted}
              />
            </div>
          )}
          <div className="text-muted-foreground mt-4 flex items-stretch justify-center gap-0 text-center text-xs">
            <div className="flex-1">
              <div className="text-foreground text-base font-semibold tabular-nums">
                {skinAge?.details?.type ?? "—"}
              </div>
              <div>Skin age</div>
            </div>
            <div className="bg-border w-px" />
            <div className="flex-1">
              <div className="text-foreground text-base font-semibold capitalize">
                {skinType?.details?.type ?? "—"}
              </div>
              <div>Skin type</div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <span className="text-muted-foreground text-xs">
            Higher = healthier
          </span>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500/70" />
            0–50 Needs care
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500/80" />
            50–75 Fair
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
            75–100 Good
          </span>
        </div>
        {hasImages && (
          <p className="text-muted-foreground text-xs">
            Tap a concern to highlight it on the photo above.
          </p>
        )}
        {concerns.length === 0 ? (
          <p className="text-muted-foreground text-sm">No results returned.</p>
        ) : (
          <ul className="space-y-2.5">
            {concerns.map((issue, i) => {
              const name = concernName(issue.issueType);
              const description = concernDescription(issue.issueType);
              const score01 = issue.score ?? 0;
              const pct = Math.round(score01 * 100);
              const rating = scoreRating(score01);
              const selected = selectedLabel === name;
              return (
                <li key={issue.issueType}>
                  <button
                    type="button"
                    disabled={!issue.image}
                    style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}
                    onClick={() => {
                      if (issue.image) {
                        setSelectedImage(issue.image);
                        setSelectedLabel(name);
                        setSelectedIsConcern(true);
                      }
                    }}
                    className={`reveal bg-card w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      issue.image
                        ? "hover:border-gold/40 hover:bg-accent/40"
                        : "cursor-default"
                    } ${selected ? "border-gold/50 bg-accent/50 ring-gold/30 ring-1" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{name}</span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${rating.textClass}`}
                      >
                        {issue.score != null ? pct : "—"}
                        <span className="ml-1 text-xs font-normal">
                          {rating.label}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2">
                      <ScoreScale
                        score01={score01}
                        rating={rating}
                        animate={mounted}
                        delayMs={Math.min(i * 45, 400)}
                      />
                    </div>
                    {description && (
                      <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">
                        {description}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MobileGate />
    </div>
  );
}

/** Shimmer placeholder shown while an analysis is running. */
export function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="card-premium space-y-3 p-5">
        <div className="skeleton mx-auto h-11 w-28 rounded-lg" />
        <div className="skeleton mx-auto h-4 w-32 rounded-md" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-card space-y-2 rounded-xl border px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-24 rounded-md" />
              <div className="skeleton h-4 w-12 rounded-md" />
            </div>
            <div className="skeleton h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
