"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Lead capture: the first time a user scrolls their results, ask for a mobile
 * number (with a data-storage consent notice) to continue viewing. Once saved,
 * it never shows again. Admins are exempt.
 */
export function MobileGate() {
  const [need, setNeed] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const armed = useRef(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && !d.isAdmin && !d.hasMobile) setNeed(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Trigger on the first meaningful scroll.
  useEffect(() => {
    if (!need) return;
    const onScroll = () => {
      if (window.scrollY > 120 && !armed.current) {
        armed.current = true;
        setOpen(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [need]);

  // Lock background scrolling while the gate is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!need || !open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      setError("Please enter a valid mobile number.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/me/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Couldn't save that. Please try again.");
      return;
    }
    setNeed(false);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="card-premium reveal w-full max-w-sm space-y-4 p-6">
        <div className="space-y-1.5 text-center">
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            One quick step
          </h2>
          <p className="text-muted-foreground text-sm">
            Enter your mobile number to continue viewing your results.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoFocus
            required
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </form>
        <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
          We store your analysis results and mobile number to provide and improve
          this service. By continuing to use the app, you consent to this.
        </p>
      </div>
    </div>
  );
}
