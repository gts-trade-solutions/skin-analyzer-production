import Link from "next/link";

/** Shared screen header with the gold emblem wordmark (links home). */
export function AppHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between">
      <Link href="/" className="group flex items-center gap-2.5">
        <span
          className="h-5 w-5 rounded-full ring-1 ring-white/50 transition-transform group-hover:scale-110"
          style={{
            background:
              "radial-gradient(circle at 30% 28%, oklch(0.88 0.08 84), oklch(0.62 0.11 70))",
            boxShadow: "0 4px 10px -3px oklch(0.66 0.1 76 / 0.5)",
          }}
        />
        <h1 className="font-heading text-lg font-semibold tracking-tight capitalize">
          {title}
        </h1>
      </Link>
      {right && (
        <div className="text-muted-foreground flex items-center gap-5 text-sm">
          {right}
        </div>
      )}
    </header>
  );
}
