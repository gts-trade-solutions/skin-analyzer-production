"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  concernName,
  concernDescription,
  scoreRating,
} from "@/lib/concern-info";

const NON_CONCERN = ["overall", "skin_age", "skin_type", "resize_image"];

type ListItem = {
  id: string;
  kind: string;
  createdAt: string;
  overall: number | null;
};
type Issue = {
  issueType: string;
  score: number | null;
  image?: string | null;
  details?: { type?: string };
};
type Detail = { id: string; kind: string; createdAt: string; issues: Issue[] };

function fmtDate(s: string): string {
  return new Date(s).toLocaleString();
}

function find(d: Detail, type: string): Issue | undefined {
  return d.issues.find((i) => i.issueType === type);
}

function scoreCell(score: number | null) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`font-semibold ${scoreRating(score).textClass}`}>
      {Math.round(score * 100)}
    </span>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground">—</span>;
  const v = Math.round(delta * 100);
  if (v === 0) return <span className="text-muted-foreground">0</span>;
  const up = v > 0; // higher score = better skin
  return (
    <span className={up ? "text-emerald-600" : "text-red-600"}>
      {up ? `▲ +${v}` : `▼ ${v}`}
    </span>
  );
}

function Selector({
  label,
  value,
  onChange,
  items,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: ListItem[];
  exclude: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
      >
        <option value="">Select an analysis…</option>
        {items
          .filter((i) => i.id !== exclude)
          .map((i) => (
            <option key={i.id} value={i.id}>
              {fmtDate(i.createdAt)} · {i.kind}
              {i.overall != null ? ` · ${Math.round(i.overall * 100)}/100` : ""}
            </option>
          ))}
      </select>
    </label>
  );
}

// A = sky/blue, B = amber/orange — a colour-blind-safe pair.
const SIDE = {
  A: { ring: "ring-sky-400", badge: "bg-sky-500", text: "text-sky-600" },
  B: { ring: "ring-amber-400", badge: "bg-amber-500", text: "text-amber-600" },
} as const;

function Comparison({ a, b }: { a: Detail; b: Detail }) {
  const aBase = find(a, "resize_image")?.image ?? null;
  const bBase = find(b, "resize_image")?.image ?? null;
  const aOverall = find(a, "overall")?.score ?? null;
  const bOverall = find(b, "overall")?.score ?? null;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const keys = Array.from(
    new Set(
      [...a.issues, ...b.issues]
        .filter((i) => !NON_CONCERN.includes(i.issueType))
        .map((i) => i.issueType),
    ),
  );
  const rows = keys
    .map((key) => {
      const as = find(a, key)?.score ?? null;
      const bs = find(b, key)?.score ?? null;
      const delta = as != null && bs != null ? bs - as : null;
      const hasImage = !!(find(a, key)?.image || find(b, key)?.image);
      return { key, as, bs, delta, hasImage };
    })
    .sort((x, y) => Math.abs(y.delta ?? 0) - Math.abs(x.delta ?? 0)); // biggest change first

  // Tapping a concern overlays its mask on both photos (like the results page).
  const anyImages = rows.some((r) => r.hasImage);
  const label = selectedKey ? concernName(selectedKey) : "Analyzed photo";
  const aShown = selectedKey ? (find(a, selectedKey)?.image ?? aBase) : aBase;
  const bShown = selectedKey ? (find(b, selectedKey)?.image ?? bBase) : bBase;
  const sides = [
    { tag: "A" as const, img: aShown, overall: aOverall, d: a },
    { tag: "B" as const, img: bShown, overall: bOverall, d: b },
  ];

  return (
    <div className="space-y-6">
      {/* Sticky photos + overall — stay visible while scrolling the table. */}
      <div className="bg-background/85 sticky top-2 z-10 -mx-2 grid grid-cols-2 gap-4 rounded-2xl px-2 py-3 backdrop-blur">
        {sides.map(({ tag, img, overall, d }) => {
          const s = SIDE[tag];
          return (
            <div key={tag} className="space-y-2">
              <div
                className={`bg-muted relative mx-auto flex aspect-[3/4] w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-2xl shadow-[0_10px_28px_-14px_oklch(0.4_0.02_60/0.28)] ring-2 ${s.ring}`}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={`${tag} — ${label}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">No image</span>
                )}
                <span
                  className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white shadow ${s.badge}`}
                >
                  {tag}
                </span>
                {img && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 pt-5 pb-1.5 text-center text-[11px] font-medium text-white">
                    {label}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums">
                  {overall != null ? Math.round(overall * 100) : "—"}
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    /100
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {fmtDate(d.createdAt)} · {d.kind}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {anyImages && (
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          Tap a concern to overlay it on both photos
          {selectedKey ? " · tap it again to clear" : ""}.
        </p>
      )}

      {/* Per-concern table */}
      <div className="card-premium reveal overflow-x-auto p-4">
        <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 font-medium">Concern</th>
            <th className="py-2 text-right font-medium">
              <span className={SIDE.A.text}>A</span>
            </th>
            <th className="py-2 text-right font-medium">
              <span className={SIDE.B.text}>B</span>
            </th>
            <th className="py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = selectedKey === r.key;
            return (
              <tr
                key={r.key}
                onClick={() =>
                  r.hasImage && setSelectedKey(selected ? null : r.key)
                }
                className={`border-b align-top transition-colors ${
                  r.hasImage ? "cursor-pointer hover:bg-accent/40" : ""
                } ${selected ? "bg-accent/60" : ""}`}
              >
                <td className="py-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    {concernName(r.key)}
                    {r.hasImage && (
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-3.5 w-3.5 ${selected ? "text-gold" : "text-muted-foreground/55"}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 21" />
                      </svg>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {concernDescription(r.key)}
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {scoreCell(r.as)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {scoreCell(r.bs)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  <DeltaCell delta={r.delta} />
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Higher score = healthier. ▲ green = improvement from A to B.
      </p>
    </div>
  );
}

export default function ComparePage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [a, setA] = useState<Detail | null>(null);
  const [b, setB] = useState<Detail | null>(null);

  useEffect(() => {
    fetch("/api/analyses")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!aId) return setA(null);
    fetch(`/api/analyses/${aId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setA)
      .catch(() => setA(null));
  }, [aId]);

  useEffect(() => {
    if (!bId) return setB(null);
    fetch(`/api/analyses/${bId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setB)
      .catch(() => setB(null));
  }, [bId]);

  // Full-bleed: break out of the app's mobile max-width for a wide desktop view.
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader title="Compare analyses" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Selector
            label="Analysis A (earlier)"
            value={aId}
            onChange={setAId}
            items={items}
            exclude={bId}
          />
          <Selector
            label="Analysis B (later)"
            value={bId}
            onChange={setBId}
            items={items}
            exclude={aId}
          />
        </div>

        {a && b ? (
          <Comparison a={a} b={b} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {items.length < 2
              ? "You need at least two past analyses to compare."
              : "Pick two analyses above to compare them side by side."}
          </p>
        )}
      </div>
    </div>
  );
}
