import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Private bucket for face images. Objects are never public — they're written
// server-side and (Phase 3) deleted right after analysis. No ACLs are set;
// the bucket should have Block Public Access ON.

let _client: S3Client | null = null;

/** True when all S3 env vars are present. Lets local dev run without AWS. */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_S3_BUCKET &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  );
}

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

export async function uploadImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Mirror an external image into our bucket (download -> upload). */
export async function uploadFromUrl(
  key: string,
  sourceUrl: string,
  contentType = "image/jpeg",
): Promise<void> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`s3_mirror_fetch_${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await uploadImage(key, body, contentType);
}

/** Short-lived presigned GET URL for an object in our bucket. */
export async function presignGetUrl(
  key: string,
  expiresInSec = 600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }),
    { expiresIn: expiresInSec },
  );
}

export async function deleteImage(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    }),
  );
}
