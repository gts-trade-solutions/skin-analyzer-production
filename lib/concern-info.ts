// Friendly display names + plain-language descriptions for skin concerns, and a
// score → rating helper. Keeps the results screen understandable to non-experts.

export const CONCERN_INFO: Record<
  string,
  { name: string; description: string }
> = {
  acne: { name: "Acne", description: "Breakouts and blemishes" },
  wrinkles: { name: "Wrinkles", description: "Fine lines and creases" },
  pores: { name: "Pores", description: "Visible or enlarged pores" },
  texture: { name: "Texture", description: "Smoothness and evenness" },
  redness: { name: "Redness", description: "Irritation or flushing" },
  oiliness: { name: "Oiliness", description: "Excess shine and oil" },
  moisture: { name: "Hydration", description: "Skin moisture level" },
  radiance: { name: "Radiance", description: "Glow and brightness" },
  firmness: { name: "Firmness", description: "Elasticity and bounce" },
  dark_circle: { name: "Dark circles", description: "Shadows under the eyes" },
  eye_bag: { name: "Eye bags", description: "Under-eye puffiness" },
  tear_trough: {
    name: "Under-eye hollows",
    description: "Hollowing under the eyes",
  },
  droopy_upper_eyelid: {
    name: "Upper eyelid",
    description: "Upper eyelid firmness",
  },
  droopy_lower_eyelid: {
    name: "Lower eyelid",
    description: "Lower eyelid firmness",
  },
  age_spot: { name: "Age spots", description: "Sun spots and pigmentation" },
};

export function concernName(key: string): string {
  return (
    CONCERN_INFO[key]?.name ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function concernDescription(key: string): string | null {
  return CONCERN_INFO[key]?.description ?? null;
}

export type Rating = { label: string; textClass: string; barClass: string };

/** Map a 0–1 health score (higher = better) to a rating + colors. */
export function scoreRating(score: number): Rating {
  if (score >= 0.75)
    return { label: "Good", textClass: "text-emerald-600", barClass: "bg-emerald-500" };
  if (score >= 0.5)
    return { label: "Fair", textClass: "text-amber-600", barClass: "bg-amber-500" };
  return { label: "Needs care", textClass: "text-red-600", barClass: "bg-red-500" };
}
