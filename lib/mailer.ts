import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let _ses: SESClient | null = null;
function ses(): SESClient {
  if (!_ses) {
    _ses = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _ses;
}

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SES_FROM_EMAIL &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID,
  );
}

function template(
  title: string,
  intro: string,
  cta: string,
  link: string,
): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:auto;color:#2a2420">
    <h2 style="font-weight:600">${title}</h2>
    <p>${intro}</p>
    <p style="margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#2a2420;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600">${cta}</a>
    </p>
    <p style="color:#999;font-size:12px">Or paste this link into your browser:<br>${link}</p>
  </div>`;
}

async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  await ses().send(
    new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL!,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html }, Text: { Data: text } },
      },
    }),
  );
}

export async function sendVerificationEmail(
  to: string,
  link: string,
): Promise<void> {
  await send(
    to,
    "Verify your email — Skin & Hair Analyzer",
    template(
      "Confirm your email",
      "Welcome to the Skin &amp; Hair Analyzer. Tap below to verify your account.",
      "Verify email",
      link,
    ),
    `Verify your email: ${link}`,
  );
}

export async function sendPasswordResetEmail(
  to: string,
  link: string,
): Promise<void> {
  await send(
    to,
    "Reset your password — Skin & Hair Analyzer",
    template(
      "Reset your password",
      "We received a request to reset your password. Tap below to choose a new one. If you didn't ask for this, you can safely ignore this email.",
      "Reset password",
      link,
    ),
    `Reset your password: ${link}`,
  );
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:auto;color:#2a2420">
    <h2 style="font-weight:600">Verify your email</h2>
    <p>Enter this code to verify your email for the Skin &amp; Hair Analyzer:</p>
    <p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:10px;color:#2a2420">${code}</p>
    <p style="color:#999;font-size:12px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>`;
  await send(
    to,
    `${code} is your verification code`,
    html,
    `Your verification code is ${code}. It expires in 10 minutes.`,
  );
}
