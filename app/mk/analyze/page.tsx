import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { integrationEnabled, MADENKOREA_URL } from "@/lib/mk/crypto";
import { MK_SESSION_COOKIE, readMkSession } from "@/lib/mk/session";
import { MkCapture } from "@/components/mk/mk-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Integration capture page. Reads the scoped mk_session (set by /mk/enter); if
 * it's missing/expired, bounces back to MadeNKorea to restart the handoff.
 *
 * M2: identity landing (confirms the handoff works).
 * M3: this renders the real capture → analyze flow (reuses the analyzer's
 *     existing camera + Face++ pipeline via /api/mk/analyze), then redirects
 *     back to MadeNKorea with the result reference.
 */
export default async function MkAnalyzePage() {
  if (!integrationEnabled()) redirect("/");

  const jar = await cookies();
  const session = readMkSession(jar.get(MK_SESSION_COOKIE)?.value);
  if (!session) {
    redirect(
      MADENKOREA_URL ? `${MADENKOREA_URL}/skin-analyzer?error=session_expired` : "/",
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
        MadeNKorea × Skin Analyzer
      </p>
      <MkCapture name={session!.name} />
    </main>
  );
}
