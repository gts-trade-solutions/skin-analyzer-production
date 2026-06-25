import { createHash, randomInt } from "crypto";

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const otpIdentifier = (email: string) => `otp:${email.toLowerCase()}`;

/** A 6-digit, zero-padded numeric code. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Stored hashed (salted with AUTH_SECRET) so plaintext codes never hit the DB. */
export function hashOtp(email: string, code: string): string {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}
