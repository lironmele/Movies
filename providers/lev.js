// Lev Cinema provider.
//
// `createLevProvider` builds a provider for any Lev Cinema branch from its
// locationId. The `/api/presentations/` endpoint returns a branch's entire
// forward schedule (today through ~4 weeks out) in a single request, with the
// movie, hall, date/time and booking info already on each row.
// See ../docs/lev-presentations-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";

const ENDPOINT = "https://ticket.lev.co.il/api/presentations/";
const VENUE_HALL = 1; // physical cinema hall (101 = VOD, excluded)
const WINDOW_DAYS = 28; // forward window the API publishes, ~4 weeks

// Match the Cinema City provider's display-ready day label: "שבת 20/06/2026".
const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" (Asia/Jerusalem business day) -> "שבת 20/06/2026".
function dayLabel(businessDate) {
  const [yyyy, mm, dd] = businessDate.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd); // local midnight, so getDay() is stable
  return `${HE_WEEKDAYS[d.getDay()]} ${pad(dd)}/${pad(mm)}/${yyyy}`;
}

// "YYYY-MM-DD HH:MM" (no offset) -> epoch millis, for chronological sorting.
// Parsed as local wall-clock; all rows share Asia/Jerusalem, so order holds.
function toTs(dateTime) {
  return new Date(dateTime.replace(" ", "T")).getTime();
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
  const res = await fetch(viaProxy(buildEndpointUrl(locationId)), {
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
    shows.get(key).screenings.push({
      ts: toTs(p.dateTime),
      day: dayLabel(p.businessDate),
      hour: p.dateTime.slice(11, 16), // "HH:MM"
      bookingUrl: bookingUrl(p.id),
    });
  }
  return [...shows.values()];
}

export function createLevProvider({ id, name, locationId }) {
  return {
    id,
    name,
    async fetchShows() {
      return groupShows(await fetchPresentations(locationId));
    },
  };
}
