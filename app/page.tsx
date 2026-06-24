import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AccountBar } from "@/components/account-bar";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-6 p-6">
      <AccountBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        {/* Emblem */}
        <div
          className="float-soft relative grid h-20 w-20 place-items-center rounded-full ring-1 ring-white/50"
          style={{
            background:
              "radial-gradient(circle at 30% 28%, oklch(0.88 0.08 84), oklch(0.62 0.11 70))",
            boxShadow: "0 14px 34px -10px oklch(0.66 0.1 76 / 0.55)",
          }}
        >
          <div className="h-7 w-7 rounded-full bg-white/35 backdrop-blur-sm" />
        </div>

        <div className="reveal space-y-3">
          <p className="text-gold text-[0.7rem] font-medium tracking-[0.3em] uppercase">
            AI-guided analysis
          </p>
          <h1 className="font-heading text-[2rem] leading-tight font-semibold tracking-tight">
            Skin &amp; Hair Analyzer
          </h1>
          <p className="text-muted-foreground mx-auto max-w-xs text-sm leading-relaxed">
            A clear, in-the-moment read on your skin or hair — and where to focus
            next.
          </p>
        </div>

        <div
          className="reveal flex w-full flex-col gap-3"
          style={{ animationDelay: "90ms" }}
        >
          <Button
            render={<Link href="/analyze/face" />}
            size="lg"
            className="lift w-full"
          >
            Analyze Face
          </Button>
          <div className="relative w-full">
            <Button
              size="lg"
              variant="outline"
              className="w-full opacity-60"
              disabled
            >
              Analyze Hair
            </Button>
            <span className="bg-gold/15 text-gold pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Coming soon
            </span>
          </div>
        </div>

        <div
          className="reveal text-muted-foreground flex gap-6 text-sm"
          style={{ animationDelay: "170ms" }}
        >
          <Link
            href="/history"
            className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Past analyses
          </Link>
          <Link
            href="/compare"
            className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Compare
          </Link>
        </div>
      </div>

      <p className="text-muted-foreground/80 text-center text-xs">
        For cosmetic guidance only. Not a medical diagnosis.
      </p>
    </main>
  );
}
