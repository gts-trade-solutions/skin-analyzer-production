import { NextRequest, NextResponse } from "next/server";
import { integrationEnabled } from "@/lib/mk/crypto";
import { verifyImageKey } from "@/lib/mk/imageProxy";
import { isS3Configured, presignGetUrl } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signed image proxy. MadeNKorea stores a stable `/mk/image?key=…&sig=…` URL;
 * on each load we validate the signature, re-presign a fresh S3 URL, and
 * redirect. Durable (never expires from MadeNKorea's side) and decoupled (no
 * shared bucket access). See lib/mk/imageProxy.ts.
 */
export async function GET(req: NextRequest) {
  if (!integrationEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 404 });
  }

  const key = req.nextUrl.searchParams.get("key");
  const sig = req.nextUrl.searchParams.get("sig");
  if (!key || !sig || !verifyImageKey(key, sig)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 403 });
  }
  if (!isS3Configured()) {
    return NextResponse.json({ error: "no_storage" }, { status: 503 });
  }

  try {
    const url = await presignGetUrl(key, 300); // fresh 5-min presign per load
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
