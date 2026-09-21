// Minimal Resend API wrapper — a plain fetch call, no SDK dependency.
// Server-only: reads RESEND_API_KEY, which must never reach the client bundle.

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends one transactional email via Resend. Throws on a non-2xx response so
 * callers can decide whether to swallow the error (notifications should never
 * block the schedule edit that triggered them) or surface it.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM must be configured to send email");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend sendEmail failed: ${res.status} ${errText}`);
  }
}
