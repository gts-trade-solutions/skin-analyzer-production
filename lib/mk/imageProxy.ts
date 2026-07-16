import crypto from "node:crypto";

/**
 * Durable image proxy for MadeNKorea results.
 *
 * The analyzer's result images (the analyzed photo + per-concern overlays) live
 * in a PRIVATE S3 bucket and are normally shown via short-lived presigned URLs.
 * Those expire, so they can't be stored in MadeNKorea for "future reference".
 *
 * Instead we hand MadeNKorea a STABLE signed URL that points back at the
 * analyzer's `/mk/image` route. On each load that route re-presigns a fresh S3
 * URL and redirects — so the image is always viewable, MadeNKorea never needs
 * access to the private bucket, and users can't request arbitrary keys (the key
 * is HMAC-signed).
 */
const SECRET = process.env.MADENKOREA_SHARED_SECRET || "";

export function signImageKey(key: string): string {
  return crypto.createHmac("sha256", SECRET).update(key).digest("base64url");
}

export function verifyImageKey(key: string, sig: string): boolean {
  if (!SECRET || !key || !sig) return false;
  const expected = signImageKey(key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stable proxy URL MadeNKorea stores and renders. `base` = analyzer public URL. */
export function buildImageProxyUrl(base: string, key: string): string {
  return `${base}/mk/image?key=${encodeURIComponent(key)}&sig=${signImageKey(key)}`;
}
