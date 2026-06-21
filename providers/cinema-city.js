// Cinema City provider.
//
// `createCinemaCityProvider` builds a provider for any Cinema City branch from
// its TheatreId. The undocumented `EventsFlat` endpoint returns a branch's
// entire forward schedule in 1–2 requests (standard halls + optional VIP).
// See ../docs/cinema-city-galilot-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";
import { toDayKey, dayLabel } from "../lib/day.js";

const ENDPOINT = "https://www.cinema-city.co.il/tickets/EventsFlat";
const VENUE_STANDARD = 1;
const VENUE_VIP = 3;

// "DD/MM/YYYY HH:MM" -> epoch millis, for chronological sorting.
function toTs(dateStr) {
  const [d, t] = dateStr.split(" ");
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}T${t || "00:00"}`).getTime();
}

// "DD/MM/YYYY HH:MM" -> canonical "YYYY-MM-DD" day key.
function toDay(dateStr) {
  const [dd, mm, yyyy] = dateStr.split(" ")[0].split("/").map(Number);
  return toDayKey(yyyy, mm, dd);
}

function bookingUrl(eventId) {
  return `https://www.cinema-city.co.il/tickets/seats?eventId=${eventId}`;
}

function buildEndpointUrl(theatreId, venueTypeId) {
  const today = new Date().toISOString().slice(0, 10);
  const qs = new URLSearchParams({
    TheatreId: theatreId,
    VenueTypeId: venueTypeId,
    MovieId: 0, // 0 = all movies — this is what flattens the whole schedule
    Date: today, // required by the endpoint but ignored as a filter
  });
  return `${ENDPOINT}?${qs.toString()}`;
}

async function fetchEvents(theatreId, venueTypeId) {
  const res = await fetch(viaProxy(buildEndpointUrl(theatreId, venueTypeId)), {
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Flat screening array -> normalized shows grouped by movie.
function groupShows(events) {
  const shows = new Map();
  const seen = new Set();
  for (const e of events) {
    const d = e.Dates;
    if (!d) continue;
    const dedupeKey = `${e.ExportCode}|${d.EventId}`;
    if (seen.has(dedupeKey)) continue; // standard + VIP can overlap
    seen.add(dedupeKey);
    const key = String(e.ExportCode ?? e.Name); // ExportCode is the stable id
    if (!shows.has(key)) shows.set(key, { key, name: e.Name, screenings: [] });
    const dayKey = toDay(d.Date);
    shows.get(key).screenings.push({
      ts: toTs(d.Date),
      dayKey, // canonical "YYYY-MM-DD" — groups across providers
      day: dayLabel(dayKey), // display label, built from the same source
      hour: d.Hour,
      bookingUrl: bookingUrl(d.EventId),
    });
  }
  return [...shows.values()];
}

export function createCinemaCityProvider({ id, name, icon, theatreId, includeVip = true }) {
  return {
    id,
    name,
    icon,
    async fetchShows() {
      const venues = includeVip ? [VENUE_STANDARD, VENUE_VIP] : [VENUE_STANDARD];
      const results = await Promise.allSettled(
        venues.map((v) => fetchEvents(theatreId, v))
      );
      // Tolerate a missing VIP hall; only fail if every request failed.
      if (results.every((r) => r.status === "rejected")) throw results[0].reason;
      const events = results.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );
      return groupShows(events);
    },
  };
}
