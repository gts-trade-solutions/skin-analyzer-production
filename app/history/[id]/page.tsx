"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  ResultsView,
  ResultsSkeleton,
  type ResultIssue,
} from "@/components/results-view";
import { HairDensityResult } from "@/components/hair-density-result";

type Detail = {
  id: string;
  kind: string;
  createdAt: string;
  issues: ResultIssue[];
};

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [params.id]);

  return (
    <main className="flex min-h-dvh flex-col gap-6 p-6">
      <AppHeader
        title={data ? `${data.kind} analysis` : "Analysis"}
        right={
          <Link
            href="/history"
            className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Back
          </Link>
        }
      />

      {error && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load this analysis.
        </p>
      )}
      {!data && !error && <ResultsSkeleton />}
      {data && (
        <>
          <p className="text-muted-foreground text-xs">
            {new Date(data.createdAt).toLocaleString()}
          </p>
          {data.kind === "hair" ? (
            <HairDensityResult
              issues={data.issues}
              fallbackImage={
                data.issues.find((i) => i.issueType === "hair_density")?.image ??
                null
              }
            />
          ) : (
            <ResultsView issues={data.issues} />
          )}
        </>
      )}
    </main>
  );
}
