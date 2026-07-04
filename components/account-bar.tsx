"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

type Me = {
  email: string;
  isAdmin: boolean;
  remaining: number | null; // face
  hairRemaining: number | null;
  requested: boolean;
};

export function AccountBar() {
  const [me, setMe] = useState<Me | null>(null);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setMe(d);
          setRequested(d.requested);
        }
      })
      .catch(() => {});
  }, []);

  if (!me) return null;

  async function requestMore() {
    setRequested(true);
    await fetch("/api/request-access", { method: "POST" }).catch(() => {});
  }

  // Prompt to request more once either allowance is exhausted.
  const anyExhausted =
    !me.isAdmin && (me.remaining === 0 || me.hairRemaining === 0);

  return (
    <div className="card-premium reveal flex items-center justify-between gap-3 p-3 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{me.email}</div>
        <div className="text-muted-foreground text-xs">
          {me.isAdmin
            ? "Administrator"
            : `${me.remaining} face · ${me.hairRemaining} hair left`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs">
        {me.isAdmin && (
          <Link href="/admin" className="text-foreground underline">
            Admin
          </Link>
        )}
        {anyExhausted &&
          (requested ? (
            <span className="text-muted-foreground">Requested</span>
          ) : (
            <button onClick={requestMore} className="text-gold underline">
              Request more
            </button>
          ))}
        <button
          onClick={() => signOut({ callbackUrl: "/signin" })}
          className="text-muted-foreground underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
