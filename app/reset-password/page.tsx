"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token || !email) {
    return (
      <main className="reveal flex min-h-dvh flex-col justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Invalid link
        </h1>
        <p className="text-muted-foreground text-sm">
          This reset link is incomplete or has expired.
        </p>
        <Button
          variant="outline"
          render={<Link href="/forgot-password" />}
          className="w-full"
        >
          Request a new link
        </Button>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        d.error === "invalid_token"
          ? "This reset link is invalid or has expired."
          : d.error === "weak_password"
            ? "Password must be at least 8 characters."
            : "Couldn't reset your password.",
      );
      return;
    }
    router.push("/signin?reset=1");
  }

  return (
    <main className="reveal flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-muted-foreground text-sm">
          For <b className="text-foreground">{email}</b>
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Input
          type="password"
          placeholder="New password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
