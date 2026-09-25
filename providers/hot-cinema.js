// Hot Cinema provider.
//
// `createHotCinemaProvider` builds a provider for any Hot Cinema branch from its
// site theater id (the number in `hotcinema.co.il/theater/<id>`). Hot Cinema
// runs the same ticketing platform as Cinema City, but has no flat bulk
// endpoint: the theater page embeds the dates that have screenings, and
// `TheaterEvents2` returns one business day's schedule, grouped by movie.
// See ../docs/hot-cinema-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";
import { toDayKey, dayLabel } from "../lib/day.js";

const ORIGIN = "https://www.hotcinema.co.il";
const WINDOW_DAYS = 14; // how far ahead to fetch; one request per date

// "DD/MM/YYYY" -> canonical "YYYY-MM-DD" day key.
function toDay(date) {
  const [dd, mm, yyyy] = date.split("/").map(Number);
  return toDayKey(yyyy, mm, dd);
}

// "YYYY-MM-DDTHH:MM:SS" (no offset, Asia/Jerusalem) -> epoch millis for sorting.
// Parsed as local wall-clock; all rows share Asia/Jerusalem, so order holds.
function toTs(dateTime) {
  return new Date(dateTime).getTime();
}

// The site's order button (theater-order.js -> order) hits `/order/?eventID=`,
// which 302-redirects to the branch's page on tickets.hotcinema.co.il. That
// final URL carries an internal per-branch site code the API doesn't expose, so
// link to the redirecting URL.
function bookingUrl(eventId, theaterId) {
  return `${ORIGIN}/order/?eventID=${eventId}&theaterId=${theaterId}`;
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

// The theater page embeds every date with screenings as
// `eventsdays='["25/09/2026", ...]'`, unsorted and running months ahead.
// Keep the ones within our forward window.
async function fetchDates(theaterId) {
  const res = await fetch(viaProxy(`${ORIGIN}/theater/${theaterId}`));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const match = (await res.text()).match(/eventsdays='([^']*)'/);
  if (!match) throw new Error("no eventsdays on theater page");
  const from = israelToday();
  const until = addDays(from, WINDOW_DAYS);
  return JSON.parse(match[1]).filter((d) => {
    const key = toDay(d);
    return key >= from && key <= until;
  });
}

// One business day's movies, each with its screenings in `Dates`.
async function fetchDateEvents(theaterId, date) {
  const qs = new URLSearchParams({ date, theatreid: theaterId, movieid: 0 });
  const res = await fetch(viaProxy(`${ORIGIN}/tickets/TheaterEvents2?${qs.toString()}`), {
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  const events = Array.isArray(data?.TheaterEvents) ? data.TheaterEvents : [];
  return events.map((movie) => ({ date, movie }));
}

// (business date, movie) rows from every date -> normalized shows grouped by movie.
function groupShows(rows) {
  const shows = new Map();
  for (const { date, movie: m } of rows) {
    const key = String(m.MovieId ?? m.MovieName); // MovieId is the stable id
    if (!shows.has(key)) shows.set(key, { key, name: m.MovieName, screenings: [] });
    // Group by the queried business day, so an after-midnight show stays with
    // the evening it belongs to (as Lev and Planet do).
    const dayKey = toDay(date);
    for (const d of m.Dates ?? []) {
      if (!d.Date || !d.EventId) continue;
      shows.get(key).screenings.push({
        ts: toTs(d.Date),
        dayKey, // canonical "YYYY-MM-DD" — groups across providers
        day: dayLabel(dayKey), // display label, built from the same source
        hour: d.Hour,
        bookingUrl: bookingUrl(d.EventId, d.TheaterId),
      });
    }
  }
  return [...shows.values()];
}

export function createHotCinemaProvider({ id, name, short, icon, region, theaterId }) {
  return {
    id,
    name,
    short,
    icon,
    region,
    async fetchShows() {
      const dates = await fetchDates(theaterId);
      // One request per date. Tolerate a single date failing; only fail
      // outright if every date request failed.
      const results = await Promise.allSettled(
        dates.map((d) => fetchDateEvents(theaterId, d))
      );
      if (dates.length && results.every((r) => r.status === "rejected"))
        throw results[0].reason;
      const rows = results.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );
      return groupShows(rows);
    },
  };
}
