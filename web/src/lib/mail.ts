/**
 * Sending email.
 *
 * One function, and a provider behind it that can be replaced by editing this
 * file alone. Resend is what it talks to today, over plain HTTP -- its API is a
 * POST with a JSON body, so there is no SDK here and no dependency to keep up
 * to date.
 *
 * With no API key configured the message is written to the log instead of
 * being sent. That is what makes the flows that depend on email -- resetting a
 * password, proving an address -- testable on a machine that has no mail
 * provider at all, which is every development machine.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export interface Message {
  to: string;
  subject: string;
  /** Plain text only. A password reset is not a newsletter. */
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.MAIL_API_KEY && process.env.MAIL_FROM);
}

/**
 * Send, or log if there is nowhere to send to.
 *
 * Never throws. A caller is always in the middle of something a person is
 * waiting on, and the useful answer to "the mail provider is down" is not to
 * fail the request that provoked it -- it is to say so in the log and let the
 * person try again.
 */
export async function sendMail(message: Message): Promise<boolean> {
  if (!mailConfigured()) {
    console.info(
      `[mail] not configured, would have sent to ${message.to}\n` +
        `[mail] subject: ${message.subject}\n${message.text}`,
    );
    return false;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.MAIL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      console.error(`[mail] ${response.status}: ${await response.text()}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[mail] could not send', error);
    return false;
  }
}

/** The address links in email should point at. */
export function siteUrl(): string {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Vercel sets this for every deployment, so a preview links to itself rather
  // than to production.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : 'http://localhost:3000';
}
