"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get("email") ?? "").trim().toLowerCase();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  if (!email) {
    return (
      <main className="reveal flex min-h-dvh flex-col justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Verify your email
        </h1>
        <p className="text-muted-foreground text-sm">
          Start from the sign-up screen so we can send your code.
        </p>
        <Button variant="outline" render={<Link href="/signup" />} className="w-full">
          Go to sign up
        </Button>
      </main>
    );
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Verifying the code also signs the user in (one-time), so no re-login.
    const res = await signIn("credentials", {
      email,
      otp: code,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("That code is invalid or has expired. Request a new one.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function resend() {
    setResent(true);
    setError(null);
    setCode("");
    await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  return (
    <main className="reveal flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Verify your email
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter the 6-digit code we sent to{" "}
          <b className="text-foreground">{email}</b>.
        </p>
      </div>

      <form onSubmit={verify} className="space-y-3">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center text-lg tracking-[0.5em]"
          required
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        {resent && (
          <p className="text-sm text-emerald-600">A new code is on its way.</p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={loading || code.length < 6}
        >
          {loading ? "Verifying…" : "Verify email"}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Didn&apos;t get it?{" "}
        <button onClick={resend} className="text-foreground underline">
          Resend code
        </button>
      </p>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/signin" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
