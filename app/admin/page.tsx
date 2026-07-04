"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  verified: boolean;
  mobile: string | null;
  consentAt: string | null;
  allowance: number;
  used: number;
  hairAllowance: number;
  hairUsed: number;
  requested: string | null;
  createdAt: string;
  analyses: number;
};

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleString() : "—";
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/users");
    if (r.ok) setUsers((await r.json()).users ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function grant(id: string, amount: number, kind: "face" | "hair") {
    setBusy(id);
    await fetch("/api/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, amount, kind }),
    }).catch(() => {});
    await load();
    setBusy(null);
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6">
      <AppHeader title="Admin" />
      <p className="text-muted-foreground text-sm">
        Accounts &amp; analysis allowances. Requests are flagged at the top.
      </p>

      {users === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm">No accounts yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {users.map((u) => {
            const open = openId === u.id;
            return (
              <li
                key={u.id}
                className={`card-premium p-3 ${u.requested ? "ring-gold/50 ring-2" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {u.email}
                      </span>
                      {u.role === "admin" && (
                        <span className="bg-gold/15 text-gold rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Face {u.used}/{u.allowance} · Hair {u.hairUsed}/
                      {u.hairAllowance}
                      {!u.verified && " · unverified"}
                      {u.requested && (
                        <span className="text-gold"> · requested more</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 text-right">
                    {(["face", "hair"] as const).map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-9 text-[11px] font-medium capitalize">
                          {k}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === u.id}
                          onClick={() => grant(u.id, 1, k)}
                        >
                          +1
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === u.id}
                          onClick={() => grant(u.id, 5, k)}
                        >
                          +5
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setOpenId(open ? null : u.id)}
                  className="text-muted-foreground hover:text-foreground mt-2 text-xs underline-offset-4 hover:underline"
                >
                  {open ? "Hide details" : "View details"}
                </button>

                {open && (
                  <div className="reveal mt-2 border-t pt-2 text-xs">
                    <Detail label="Name" value={u.name ?? "—"} />
                    <Detail
                      label="Mobile"
                      value={u.mobile ?? "Not provided"}
                    />
                    <Detail label="Role" value={u.role} />
                    <Detail
                      label="Email verified"
                      value={u.verified ? "Yes" : "No"}
                    />
                    <Detail label="Consent given" value={fmtDate(u.consentAt)} />
                    <Detail label="Analyses" value={u.analyses} />
                    <Detail
                      label="Face allowance"
                      value={`${u.used} / ${u.allowance}`}
                    />
                    <Detail
                      label="Hair allowance"
                      value={`${u.hairUsed} / ${u.hairAllowance}`}
                    />
                    <Detail
                      label="Requested more"
                      value={fmtDate(u.requested)}
                    />
                    <Detail label="Joined" value={fmtDate(u.createdAt)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
