"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <main className="reveal flex min-h-dvh flex-col justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Check your inbox
        </h1>
        <p className="text-muted-foreground text-sm">
          If an account exists for{" "}
          <b className="text-foreground">{email}</b>, we&apos;ve sent a password
          reset link. It expires in an hour.
        </p>
        <Button
          variant="outline"
          render={<Link href="/signin" />}
          className="w-full"
        >
          Back to sign in
        </Button>
      </main>
    );
  }

  return (
    <main className="reveal flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Forgot password
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send a reset link.
        </p>
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/signin" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
