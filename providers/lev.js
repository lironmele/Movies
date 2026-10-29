// Lev Cinema provider.
//
// `createLevProvider` builds a provider for any Lev Cinema branch from its
// locationId. The `/api/presentations/` endpoint returns a branch's entire
// forward schedule (today through ~4 weeks out) in a single request, with the
// movie, hall, date/time and booking info already on each row.
// See ../docs/lev-presentations-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";
import { fetchWithRetry } from "../lib/http.js";
import { toDayKey, dayLabel, israelTs } from "../lib/day.js";

const ENDPOINT = "https://ticket.lev.co.il/api/presentations/";
const VENUE_HALL = 1; // physical cinema hall (101 = VOD, excluded)
const WINDOW_DAYS = 28; // forward window the API publishes, ~4 weeks

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

function bookingUrl(id) {
  return `https://ticket.lev.co.il/order/${id}`;
}

// Today's date in Asia/Jerusalem as "YYYY-MM-DD" (en-CA yields ISO order).
function israelToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function addDays(isoDate, days) {
  const [yyyy, mm, dd] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd + days));
  return d.toISOString().slice(0, 10);
}

function buildEndpointUrl(locationId) {
  const startDate = israelToday();
  const qs = new URLSearchParams({
    locationId,
    startDate,
    endDate: addDays(startDate, WINDOW_DAYS),
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
  for (const p of presentations) {
    if (p.venueTypeId !== VENUE_HALL) continue; // drop VOD defensively
    if (!p.dateTime || !p.businessDate) continue;
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

export function createLevProvider({ id, name, short, icon, region, locationId }) {
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
