"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";

type Item = {
  id: string;
  kind: string;
  createdAt: string;
  overall: number | null;
  thumbnailUrl: string | null;
  ownerEmail?: string | null;
};

export default function HistoryPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/analyses")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch(() => setError(true));
  }, []);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6">
      <AppHeader
        title="History"
        right={
          <Link
            href="/compare"
            className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Compare
          </Link>
        }
      />

      {error && (
        <p className="text-destructive text-sm">Couldn&apos;t load history.</p>
      )}
      {items === null && !error && (
        <ul className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="card-premium flex items-center gap-3 p-3">
              <div className="skeleton h-16 w-16 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-20 rounded-md" />
                <div className="skeleton h-3 w-32 rounded-md" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {items?.length === 0 && (
        <p className="text-muted-foreground text-sm">No past analyses yet.</p>
      )}

      <ul className="space-y-2.5">
        {items?.map((it, i) => (
          <li key={it.id}>
            <Link
              href={`/history/${it.id}`}
              style={{ animationDelay: `${Math.min(i * 55, 400)}ms` }}
              className="card-premium lift reveal flex items-center gap-3 p-3"
            >
              <div className="bg-muted h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">
                {it.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium capitalize">{it.kind}</div>
                {it.ownerEmail && (
                  <div className="text-muted-foreground truncate text-xs">
                    {it.ownerEmail}
                  </div>
                )}
                <div className="text-muted-foreground text-xs">
                  {new Date(it.createdAt).toLocaleString()}
                </div>
              </div>
              {it.overall != null && (
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {Math.round(it.overall * 100)}
                  </div>
                  <div className="text-muted-foreground text-xs">/100</div>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
