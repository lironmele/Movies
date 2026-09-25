// Cinematheque Tel Aviv provider.
//
// `createCinemathequeProvider` scrapes the Tel Aviv Cinematheque's "by day"
// schedule page (https://www.cinema.co.il/shown/). Its ticketing runs on the
// same Presentations platform as Lev (cintlv.pres.global), but that API sits
// behind Cloudflare and blocks datacenter IPs, so we read the public WordPress
// page instead. The page shows a single day, chosen with `?date=YYYY-MM-DD`;
// we fetch one page per day in a forward window.
// See ../docs/cinematheque-tlv-shown.md for the page structure.

import { viaProxy } from "../lib/proxy.js";
import { toDayKey, dayLabel } from "../lib/day.js";

const PAGE = "https://www.cinema.co.il/shown/";
const WINDOW_DAYS = 14; // how many days ahead to fetch, one page per day

// Today's date in Asia/Jerusalem as "YYYY-MM-DD" (en-CA yields ISO order).
function israelToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function addDays(isoDate, days) {
  const [yyyy, mm, dd] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd + days));
  return d.toISOString().slice(0, 10);
}

// The few entities WordPress emits in titles (&#8211;, &amp;, &quot;, …).
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function fetchDayHtml(date) {
  const res = await fetch(viaProxy(`${PAGE}?date=${date}`), {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

// One day's page -> [{ name, hour, bookingUrl }]. The "by hour" tab
// (#nav-date) lists one `festival-grid-box` per screening, each with the title
// in an <h3>, the time in a `badg` span and the order link next to it. The
// page's other tab and the header mega-menu repeat these, so only the #nav-date
// panel (up to the footer) is read.
function parseDay(html) {
  const start = html.indexOf('id="nav-date"');
  if (start < 0) return [];
  const end = html.indexOf("<footer", start);
  const panel = html.slice(start, end < 0 ? undefined : end);

  const rows = [];
  for (const box of panel.split('class="festival-grid-box').slice(1)) {
    const title = box.match(/<h3>\s*<a[^>]*>([^<]*)<\/a>/);
    const hour = box.match(/class="badg">\s*(\d{1,2}:\d{2})/);
    if (!title || !hour) continue;
    const order = box.match(/href="(https:\/\/[^"]*\/order\/\d+)"/);
    const details = box.match(/<h3>\s*<a href="([^"]*)"/);
    rows.push({
      name: decodeEntities(title[1]).trim(),
      hour: hour[1].padStart(5, "0"),
      // Some events (lecture series etc.) have no order link; fall back to
      // the event's details page.
      bookingUrl: order ? order[1] : details[1],
    });
  }
  return rows;
}

// [{ date, rows }] -> normalized shows grouped by title.
function groupShows(days) {
  const shows = new Map();
  for (const { date, rows } of days) {
    const [yyyy, mm, dd] = date.split("-").map(Number);
    const dayKey = toDayKey(yyyy, mm, dd);
    for (const r of rows) {
      if (!shows.has(r.name)) shows.set(r.name, { key: r.name, name: r.name, screenings: [] });
      shows.get(r.name).screenings.push({
        // Parsed as local wall-clock; all rows share Asia/Jerusalem, so order holds.
        ts: new Date(`${dayKey}T${r.hour}:00`).getTime(),
        dayKey, // canonical "YYYY-MM-DD" — groups across providers
        day: dayLabel(dayKey), // display label, built from the same source
        hour: r.hour,
        bookingUrl: r.bookingUrl,
      });
    }
  }
  return [...shows.values()];
}

export function createCinemathequeProvider({ id, name, short, icon, region }) {
  return {
    id,
    name,
    short,
    icon,
    region,
    async fetchShows() {
      const today = israelToday();
      const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i));
      // Tolerate a single day failing; only fail outright if every day failed.
      const results = await Promise.allSettled(
        dates.map(async (date) => ({ date, rows: parseDay(await fetchDayHtml(date)) }))
      );
      if (results.every((r) => r.status === "rejected")) throw results[0].reason;
      return groupShows(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
    },
  };
}
