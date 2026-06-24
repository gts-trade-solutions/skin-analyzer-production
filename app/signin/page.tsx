"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Map an Auth.js `?error=` code (OAuth failures redirect here) to a message.
function mapOAuthError(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "verify":
      return "That verification link is invalid or expired.";
    case "OAuthAccountNotLinked":
      return "That email is already registered with a different sign-in method.";
    case "AccessDenied":
      return "Access was denied. Please try again.";
    case "Configuration":
      return "Sign-in is temporarily unavailable. Please try again later.";
    default:
      return "Couldn't sign in. Please try again.";
  }
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const verified = params.get("verified") === "1";
  const reset = params.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    mapOAuthError(params.get("error")),
  );
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResent(false);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Wrong email or password — or your email isn't verified yet.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  async function resend() {
    if (!email) {
      setError("Enter your email above first, then tap Resend.");
      return;
    }
    setError(null);
    await fetch("/api/auth/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setResent(true);
  }

  return (
    <main className="reveal flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="text-muted-foreground text-sm">Sign in to continue.</p>
      </div>

      {verified && (
        <p className="text-center text-sm font-medium text-emerald-600">
          Email verified — sign in below.
        </p>
      )}
      {reset && (
        <p className="text-center text-sm font-medium text-emerald-600">
          Password updated — sign in with your new password.
        </p>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => signIn("google", { callbackUrl: from })}
      >
        Continue with Google
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="bg-border h-px flex-1" />
        or
        <div className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {resent && (
          <p className="text-sm text-emerald-600">
            If your account needs it, a verification email is on its way.
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-xs">
        Didn&apos;t get the verification email?{" "}
        <button onClick={resend} className="text-foreground underline">
          Resend
        </button>
      </p>

      <p className="text-muted-foreground text-center text-sm">
        No account?{" "}
        <Link href="/signup" className="text-foreground underline">
          Create one
        </Link>
      </p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
