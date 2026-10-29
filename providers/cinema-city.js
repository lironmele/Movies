// Cinema City provider.
//
// `createCinemaCityProvider` builds a provider for any Cinema City branch from
// its locationId. Since the October 2026 move to a Wix site, showtimes come
// from the chain's ticketing backend (the same platform Lev uses): the
// `/api/presentations/` endpoint on tickets.cinema-city.co.il returns a
// branch's entire forward schedule — every hall type (standard, VIP, Prime,
// Lounge, Onyx…) — in a single request.
// See ../docs/cinema-city-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";
import { fetchWithRetry } from "../lib/http.js";
import { toDayKey, dayLabel, israelTs } from "../lib/day.js";

const ORIGIN = "https://tickets.cinema-city.co.il";
const ENDPOINT = `${ORIGIN}/api/presentations/`;
const VENUE_VOD = 101; // home-streaming rows on this platform; not a hall

// "YYYY-MM-DD" (Asia/Jerusalem business day) -> canonical "YYYY-MM-DD" day key.
function toDay(businessDate) {
  const [yyyy, mm, dd] = businessDate.split("-").map(Number);
  return toDayKey(yyyy, mm, dd);
}

// "YYYY-MM-DD HH:MM" (no offset) -> epoch millis, for chronological sorting.
// Interpreted in Asia/Jerusalem regardless of the runner's time zone.
function toTs(dateTime) {
  return israelTs(dateTime);
}

// The Wix site's "הזמנת כרטיסים" button opens this page directly (no redirect).
function bookingUrl(id) {
  return `${ORIGIN}/order/${id}`;
}

// Today's date in Asia/Jerusalem as "YYYY-MM-DD" (en-CA yields ISO order).
function israelToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function buildEndpointUrl(locationId) {
  const qs = new URLSearchParams({
    locationId, // server-side filter to one branch
    startDate: israelToday(), // no endDate: keep everything published ahead
  });
  return `${ENDPOINT}?${qs.toString()}`;
}

async function fetchPresentations(locationId) {
  const res = await fetchWithRetry(viaProxy(buildEndpointUrl(locationId)), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data?.presentations) ? data.presentations : [];
}

// Flat presentation array -> normalized shows grouped by movie.
function groupShows(presentations) {
  const shows = new Map();
  const seen = new Set();
  for (const p of presentations) {
    if (p.venueTypeId === VENUE_VOD) continue; // drop VOD defensively
    if (!p.dateTime || !p.businessDate) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const key = String(p.featureId ?? p.featureName); // featureId is the stable id
    if (!shows.has(key)) shows.set(key, { key, name: p.featureName, screenings: [] });
    const dayKey = toDay(p.businessDate);
    shows.get(key).screenings.push({
      ts: toTs(p.dateTime),
      dayKey, // canonical "YYYY-MM-DD" — groups across providers
      day: dayLabel(dayKey), // display label, built from the same source
      hour: p.dateTime.slice(11, 16), // "HH:MM"
      bookingUrl: bookingUrl(p.id),
    });
  }
  return [...shows.values()];
}

export function createCinemaCityProvider({ id, name, short, icon, region, locationId }) {
  return {
    id,
    name,
    short,
    icon,
    region,
    async fetchShows() {
      return groupShows(await fetchPresentations(locationId));
    },
  };
}
