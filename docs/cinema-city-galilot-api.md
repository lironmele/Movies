# Cinema City Galilot — API Requests to Compile Shows & Hours

> Unofficial, undocumented endpoint observed on `cinema-city.co.il`. Structure
> may change without notice. Verified 2026-06-20.

## TL;DR

A **single request** returns the theatre's entire forward schedule (every
movie, every showtime, across all currently-bookable dates). To also include
VIP-hall screenings, make a **second request** with a different venue type.
So compiling the full list of shows and hours takes **1–2 requests total** —
no per-movie or per-day looping required.

---

## The endpoint

```
GET https://www.cinema-city.co.il/tickets/EventsFlat
```

### Query parameters

| Param          | Value          | Notes                                                                 |
|----------------|----------------|-----------------------------------------------------------------------|
| `TheatreId`    | `1170`         | Cinema City Galilot.                                                   |
| `VenueTypeId`  | `1` or `3`     | `1` = standard halls, `3` = VIP. (`2`,`4`,`5`,`6` return 0 at Galilot.)|
| `MovieId`      | `0`            | `0` means "all movies in the theatre" — this is what flattens it.     |
| `Date`         | `YYYY-MM-DD`   | **Required by the endpoint but does NOT filter.** Any valid date returns the full schedule. |

> The `Date` parameter is misleading: passing `2026-06-20` and `2026-07-15`
> both returned the identical 380-event payload spanning ~6 weeks. Treat it as
> a mandatory-but-ignored field; just send today's date.

### Required headers

| Header             | Value              | Why                                                      |
|--------------------|--------------------|----------------------------------------------------------|
| `X-Requested-With` | `XMLHttpRequest`   | Without it the server does not return the JSON payload.  |
| `User-Agent`       | any browser string | Default/empty agents may be rejected.                    |

---

## The requests you actually need

**Request 1 — standard screenings (covers the large majority):**
```
GET /tickets/EventsFlat?TheatreId=1170&VenueTypeId=1&MovieId=0&Date=2026-06-20
```

**Request 2 — VIP screenings (optional, merge into the same list):**
```
GET /tickets/EventsFlat?TheatreId=1170&VenueTypeId=3&MovieId=0&Date=2026-06-20
```

Merge the two arrays and de-duplicate. That is the complete data source for
the shows-and-hours list.

---

## Response shape

A **flat JSON array** — one element per individual screening (hence
"EventsFlat"). The movie fields repeat across that movie's screenings.

```jsonc
[
  {
    "Name": "ערך סנטימנטלי",        // movie title (display)
    "Pic": "ערך סנטימנטלי.jpg",     // poster filename (CDN base TBD)
    "ExportCode": 8311,             // stable movie identifier (use to group)
    "EventId": null,                // null at the top level — see Dates.EventId
    "VenueType": "",                // "" = standard, "Vip" = VIP hall
    "Dates": {                       // ONE screening (object, not an array)
      "Date":  "20/06/2026 18:00",  // full timestamp, DD/MM/YYYY HH:MM
      "Day":   "שבת 20/06/2026",     // Hebrew weekday + date (display-ready)
      "Hour":  "18:00",             // the showtime
      "EventId": "812334",          // bookable screening ID (for ticket links)
      "TheaterId": 1170
    }
  }
  // ... ~380 more screening objects
]
```

### Fields you need for "shows and hours"

- **Show (movie):** `Name`, grouped by `ExportCode` (the stable key — `Name`
  alone can collide or vary).
- **Hour (showtime):** `Dates.Hour`, with `Dates.Date` / `Dates.Day` for the
  calendar day.
- **Hall type:** `VenueType` (`""` vs `"Vip"`).
- **Booking handle:** `Dates.EventId` (per-screening, for "buy tickets" links).

---

## Building the list (grouping logic)

```js
// events = merged array from Request 1 (+ Request 2)
const shows = new Map();               // ExportCode -> { name, screenings[] }

for (const e of events) {
  const key = e.ExportCode;
  if (!shows.has(key)) {
    shows.set(key, { name: e.Name, venueType: e.VenueType || "Standard", screenings: [] });
  }
  shows.get(key).screenings.push({
    day:  e.Dates.Day,
    date: e.Dates.Date,              // "DD/MM/YYYY HH:MM"
    hour: e.Dates.Hour,             // "HH:MM"
    eventId: e.Dates.EventId,
  });
}

// Sort each movie's screenings chronologically (parse DD/MM/YYYY HH:MM):
const toTs = s => {
  const [d, t] = s.split(" ");
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}T${t}`).getTime();
};
for (const v of shows.values())
  v.screenings.sort((a, b) => toTs(a.date) - toTs(b.date));
```

---

## CORS — why these requests must go through your proxy

The endpoint returns **no `Access-Control-Allow-Origin` header**, so a browser
`fetch()` from your GitHub Pages origin is blocked. The requests above must be
routed through the proxy from earlier in this project.

One integration detail: `X-Requested-With` is a *non-simple* header. If your
static JS sends it directly, the browser fires a preflight against your proxy,
and the proxy must list it in `Access-Control-Allow-Headers`. **Cleaner option:**
let the **proxy inject `X-Requested-With: XMLHttpRequest`** when forwarding to
Cinema City, so the browser makes a plain GET to the proxy (no preflight) and
never sends custom headers itself.

Through the proxy, the call becomes:
```js
const PROXY = "https://proxy.yourdomain.com"; // or your Worker URL
const target = "https://www.cinema-city.co.il/tickets/EventsFlat"
             + "?TheatreId=1170&VenueTypeId=1&MovieId=0&Date=2026-06-20";
const res = await fetch(`${PROXY}/?url=${encodeURIComponent(target)}`);
const events = await res.json();
```

---

## Open items / notes

- **Poster base URL:** `Pic` is only a filename; the guessed
  `/Media/Movies/Images/<Pic>` path returned 404. Confirm the real CDN base
  from the live site's `<img>` tags before relying on posters. Posters are not
  required for the shows/hours list.
- **Booking link:** build from `Dates.EventId`; confirm the exact purchase URL
  pattern from the site's "buy" flow.
- **Other theatres:** swap `TheatreId`. Galilot = `1170`.
