// Planet Cinema provider.
//
// `createPlanetProvider` builds a provider for any Planet Cinema branch from its
// cinemaId. Planet is part of Cineworld and serves showtimes from the Vista
// "quickbook" JSON API. Unlike the other providers there is no single bulk
// endpoint: you first ask which dates have showings, then fetch films + events
// once per date. The two are joined on `filmId`.
// See ../docs/planet-cinema-api.md for the endpoint details.

import { viaProxy } from "../lib/proxy.js";
import { toDayKey, dayLabel } from "../lib/day.js";

const BASE = "https://www.planetcinema.co.il/il/data-api-service/v1/quickbook/10100";
const LANG = "he_IL";
const WINDOW_DAYS = 14; // how far ahead to ask for dates; API caps to what's published

// "YYYY-MM-DDTHH:MM:SS" (no offset, Asia/Jerusalem) -> epoch millis for sorting.
// Parsed as local wall-clock; all rows share Asia/Jerusalem, so order holds.
function toTs(eventDateTime) {
  return new Date(eventDateTime).getTime();
}

// The API's `bookingLink` points at the internal data path
// `https://tickets5.../api/order/{id}` which 404s in a browser ("This page
// could not be found"). The real, user-facing ordering page is the same URL
// without the `/api/` segment: `https://tickets5.../order/{id}`. Strip it so
// the link we store actually opens the booking page.
function toOrderUrl(bookingLink) {
  if (!bookingLink) return bookingLink;
  return bookingLink.replace("/api/order/", "/order/");
}

// "YYYY-MM-DD" (business day) -> canonical "YYYY-MM-DD" day key.
function toDay(businessDay) {
  const [yyyy, mm, dd] = businessDay.split("-").map(Number);
  return toDayKey(yyyy, mm, dd);
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

async function fetchJson(url) {
  const qs = new URLSearchParams({ attr: "", lang: LANG });
  const res = await fetch(viaProxy(`${url}?${qs.toString()}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data?.body ?? {};
}

// The dates that actually have showings, within our forward window.
async function fetchDates(cinemaId) {
  const until = addDays(israelToday(), WINDOW_DAYS);
  const body = await fetchJson(`${BASE}/dates/in-cinema/${cinemaId}/until/${until}`);
  return Array.isArray(body.dates) ? body.dates : [];
}

// One date's { films[], events[] }, already joined into normalized screenings.
async function fetchDateShows(cinemaId, date) {
  const body = await fetchJson(`${BASE}/film-events/in-cinema/${cinemaId}/at-date/${date}`);
  const films = Array.isArray(body.films) ? body.films : [];
  const events = Array.isArray(body.events) ? body.events : [];
  const byId = new Map(films.map((f) => [f.id, f]));
  return events.map((e) => ({ event: e, film: byId.get(e.filmId) ?? {} }));
}

// Joined (event, film) rows from every date -> normalized shows grouped by movie.
function groupShows(rows) {
  const shows = new Map();
  for (const { event: e, film } of rows) {
    if (!e.eventDateTime || !e.businessDay) continue;
    const key = String(e.filmId ?? film.name); // filmId is the stable id
    if (!shows.has(key)) shows.set(key, { key, name: film.name, screenings: [] });
    const dayKey = toDay(e.businessDay);
    shows.get(key).screenings.push({
      ts: toTs(e.eventDateTime),
      dayKey, // canonical "YYYY-MM-DD" — groups across providers
      day: dayLabel(dayKey), // display label, built from the same source
      hour: e.eventDateTime.slice(11, 16), // "HH:MM"
      bookingUrl: toOrderUrl(e.bookingLink),
    });
  }
  return [...shows.values()];
}

export function createPlanetProvider({ id, name, icon, cinemaId }) {
  return {
    id,
    name,
    icon,
    async fetchShows() {
      const dates = await fetchDates(cinemaId);
      // One request per date (no bulk endpoint). Tolerate a single date failing;
      // only fail outright if every date request failed.
      const results = await Promise.allSettled(
        dates.map((d) => fetchDateShows(cinemaId, d))
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
