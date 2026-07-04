"use client";

import type { ResultIssue } from "@/components/results-view";
import { MobileGate } from "@/components/mobile-gate";

const LEVELS = ["Extremely Low", "Low", "Medium", "High"];
const GUIDANCE = [
  "Noticeably sparse with visible scalp. A dermatologist or trichologist can advise on options.",
  "Some thinning with visible scalp. Volumizing care and a scalp-health routine can help.",
  "Moderate density with good coverage — gentle care keeps it healthy.",
  "Full, healthy density. Keep up your routine.",
];

// Map the Perfect Corp term ("Medium Density", "Extremely Low Density"…) to a
// 0–3 band. Order matters: check "extremely" before "low".
function bandFromTerm(term: string | null): number | null {
  if (!term) return null;
  const t = term.toLowerCase();
  if (t.includes("extremely")) return 0;
  if (t.includes("high")) return 3;
  if (t.includes("medium")) return 2;
  if (t.includes("low")) return 1;
  return null;
}

export function HairDensityResult({
  issues,
  fallbackImage = null,
}: {
  issues: ResultIssue[];
  fallbackImage?: string | null;
}) {
  const density = issues.find((i) => i.issueType === "hair_density");
  const term = density?.details?.type ?? null;
  const band = bandFromTerm(term);
  // score = mapping / 4 (0–1). Recover the 1–4 value + the marker position.
  const score = density?.score ?? null;
  const mapping = score != null ? score * 4 : null;
  const markerPct = score != null ? Math.min(97, Math.max(3, score * 100)) : null;

  return (
    <div className="flex flex-col gap-4">
      {fallbackImage && (
        <div className="bg-muted mx-auto aspect-[3/4] w-full max-w-[15rem] overflow-hidden rounded-2xl shadow-[0_12px_34px_-14px_oklch(0.4_0.02_60/0.3)] ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fallbackImage}
            alt="Your photo"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="card-premium reveal p-6 text-center">
        <p className="text-gold text-[0.7rem] font-medium tracking-[0.28em] uppercase">
          Hair density
        </p>
        <p className="font-heading mt-1.5 text-3xl font-semibold tracking-tight">
          {term ?? "—"}
        </p>
        {mapping != null && (
          <p className="text-muted-foreground mt-1 text-sm font-medium tabular-nums">
            Density score {mapping.toFixed(1)}
            <span className="text-muted-foreground/60"> / 4</span>
          </p>
        )}

        {/* Four ordered bands + a marker at the exact score. */}
        <div className="relative mt-6">
          {markerPct != null && (
            <div
              className="pointer-events-none absolute -top-2.5 z-10 -translate-x-1/2 transition-[left] duration-700 ease-out"
              style={{ left: `${markerPct}%` }}
            >
              <div className="border-t-foreground h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent" />
            </div>
          )}
          <div className="flex gap-1.5">
            {LEVELS.map((label, i) => (
              <div
                key={label}
                className={`flex-1 rounded-lg py-2 text-center text-[11px] font-semibold transition-colors ${
                  i === band
                    ? "bg-gold text-white shadow-sm"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {band != null && (
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {GUIDANCE[band]}
          </p>
        )}
      </div>

      <p className="text-muted-foreground/80 text-center text-xs">
        Higher density = fuller hair, less visible scalp.
      </p>

      <MobileGate />
    </div>
  );
}
