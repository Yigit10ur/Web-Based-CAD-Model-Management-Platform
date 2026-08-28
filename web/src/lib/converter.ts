/**
 * Asking for a conversion to be run.
 *
 * The converter is not a service that is up waiting for work: OpenCascade is
 * too large to sit inside a serverless function, so it cannot be deployed
 * alongside the web application. The worker is started per upload instead, as
 * a GitHub Actions run, and this is the call that starts it.
 *
 * The queue is still the source of truth. This only shortens the wait: a
 * version that is `queued` will be converted by whichever worker gets to it,
 * and if this request never arrives the file sits in the queue rather than
 * being lost.
 */

const DISPATCH_EVENT = 'convert';

export async function requestConversion(): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  // Unset in development, where the worker is run directly against the same
  // queue. Nothing to report: this is a configuration, not a failure.
  if (!token || !repository) return;

  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: DISPATCH_EVENT }),
    });

    if (!response.ok) {
      console.error(
        `could not ask for a conversion: ${response.status} ${await response.text()}`,
      );
    }
  } catch (error) {
    // An upload that cannot summon a worker is still a good upload. Failing the
    // request here would tell the user their file did not arrive, which is
    // false: it is in storage and in the queue.
    console.error('could not ask for a conversion', error);
  }
}
