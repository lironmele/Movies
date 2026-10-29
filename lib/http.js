// Shared fetch with retry.
//
// Cinema backends occasionally return a one-off 5xx (e.g. Cinema City answered
// HTTP 500 for a single branch on 2026-10-29 and was fine minutes later). Every
// provider request goes through `fetchWithRetry`, which retries network errors,
// 5xx and 429 a few times with a growing delay before handing the last
// response (or error) back to the caller. Other statuses are returned at once —
// a 404 won't fix itself by asking again.

const RETRY_DELAYS_MS = [1000, 3000]; // one initial try + one retry per entry

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (status) => status >= 500 || status === 429;

export async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    try {
      const res = await fetch(url, options);
      if (last || !isRetryable(res.status)) return res;
    } catch (err) {
      if (last) throw err;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}
