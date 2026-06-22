# Movie Showtimes

A page that displays cinema schedules grouped by movie and by day. Every theater
is shown at once: the schedules from all providers are merged into a single movie
list, and each showtime is tagged with the theater's logo so you can see where it
plays. It is built around **pluggable movie providers** — Cinema City Galilot,
Lev Ramat HaSharon and Planet Ayalon are bundled today, and more can be added
without touching the UI.

The project is in two parts:

1. **A daily build script** (`scripts/build-data.mjs`) run by GitHub Actions. It
   fetches every provider, merges them, and commits the result to
   `data/showtimes.json`.
2. **A static page** (`index.html` + `app.js`) that just reads
   `data/showtimes.json` and renders it. The page does no fetching of cinema
   APIs, so it needs no CORS proxy and works on any static host (e.g. GitHub
   Pages).

## Structure

```
index.html              markup + styles (no app logic)
app.js                  UI: reads data/showtimes.json, search, day filter, accordion
data/showtimes.json     the pre-built, merged schedule (regenerated daily)
scripts/build-data.mjs  Node build script: fetch all providers -> write the JSON
lib/proxy.js            optional request-proxy helper (off by default)
lib/day.js              canonical day key + shared Hebrew day label
providers/
  registry.js           the providers + fetchAllShows() (merge + theater tag)
  cinema-city.js        Cinema City provider factory (any branch by TheatreId)
  lev.js                Lev Cinema provider factory (any branch by locationId)
  planet.js             Planet Cinema provider factory (any branch by cinemaId)
assets/icons/           theater logos, fetched from each cinema's website
.github/workflows/update-data.yml   the daily cron job
```

The build script calls `fetchAllShows()`, which fetches all providers in parallel
and merges their movies into one list (same title from two theaters collapses
into one row), stamping every screening with `{ providerId, providerName, icon }`.
It then sorts everything and writes `data/showtimes.json`:

```json
{
  "generatedAt": "2026-06-22T03:00:00.000Z",
  "providers": [ { "id": "...", "name": "...", "icon": "..." } ],
  "shows": [ { "key": "...", "name": "...", "screenings": [ /* tagged */ ] } ],
  "errors": [ { "provider": "...", "reason": "..." } ]
}
```

The page reads that file on load. A legend under the title maps each logo to its
theater; if a provider failed during the last build, it is listed in `errors` and
shown in a small banner without blocking the rest.

## Adding a provider

A provider is any object shaped like:

```js
{
  id:   "my-cinema",          // stable id
  name: "My Cinema",          // theater name (legend + tooltip)
  icon: "assets/icons/my.png",// theater logo shown next to each showtime
  async fetchShows() {        // returns the normalized shape below
    return [
      {
        key: "movie-123",
        name: "Some Movie",
        screenings: [
          { ts: 1750000000000, dayKey: "2026-06-20",
            day: "שבת 20/06/2026", hour: "18:00", bookingUrl: "https://…" },
        ],
      },
    ];
  },
}
```

Add it to the array in [`providers/registry.js`](providers/registry.js) and drop
its logo in `assets/icons/` (grab the theater's own favicon/PNG from its site).
The UI only ever sees the normalized shape — plus the per-screening theater tag
that `fetchAllShows()` adds — so it never needs to change. For another Cinema
City branch, reuse the factory with that branch's `TheatreId`:

```js
createCinemaCityProvider({ id: "cc-rishon", name: "Cinema City · ראשון", icon: "assets/icons/cinema-city.png", theatreId: <id> })
```

For another Lev branch, reuse its factory with that branch's `locationId`
(branch IDs are listed in [`docs/lev-presentations-api.md`](docs/lev-presentations-api.md)):

```js
createLevProvider({ id: "lev-telaviv", name: "לב · תל אביב", icon: "assets/icons/lev.png", locationId: 1150 })
```

For another Planet Cinema branch, reuse its factory with that branch's `cinemaId`
(branch IDs are listed in [`docs/planet-cinema-api.md`](docs/planet-cinema-api.md)):

```js
createPlanetProvider({ id: "planet-haifa", name: "פלאנט · חיפה", icon: "assets/icons/planet-cinema.png", cinemaId: 1070 })
```

## The Cinema City provider

- Pulls from the undocumented `EventsFlat` endpoint — see
  [`docs/cinema-city-galilot-api.md`](docs/cinema-city-galilot-api.md).
- Makes 1–2 requests per branch (standard halls + optional VIP), merges and
  de-dupes them, groups screenings by `ExportCode`, and sorts chronologically.
- Each showtime links to the booking handle built from `Dates.EventId`.

## The Lev provider

- Pulls from the `/api/presentations/` endpoint — see
  [`docs/lev-presentations-api.md`](docs/lev-presentations-api.md).
- Makes one request per branch (`locationId` + a ~4-week date window), keeps only
  physical-hall rows (`venueTypeId === 1`), groups screenings by `featureId`, and
  sorts chronologically.
- Each showtime links to the order page built from the presentation `id`.

## The Planet Cinema provider

- Pulls from the Cineworld/Vista "quickbook" JSON API — see
  [`docs/planet-cinema-api.md`](docs/planet-cinema-api.md).
- There is no bulk endpoint, so it first asks which dates have showings, then
  makes one request per date, joins `events` to `films` on `filmId`, groups
  screenings by `filmId`, and sorts chronologically. A single date that fails to
  load is tolerated; the branch only errors if every date request fails.
- Each showtime links to the `bookingLink` returned on the event.

## Daily update (GitHub Actions)

[`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) runs the
build script once a day (03:00 UTC ≈ 06:00 Israel) and on demand via
*workflow_dispatch*. If `data/showtimes.json` changed, it commits and pushes the
new file. The workflow needs `contents: write` permission (already set in the
file) so the bot can push.

Because the fetch now happens server-side in Node, there is **no CORS proxy**:
the cinema endpoints are called directly. If a host ever needs to be routed
through a proxy from the runner, set the `CORS_PROXY` env var (see
[`lib/proxy.js`](lib/proxy.js)). The build refuses to overwrite the data file
with an empty result, so a total fetch failure leaves the last good file in place
and fails the job loudly.

## Run

Build the data once, then serve the static page over HTTP (ES modules / `fetch`
won't work from `file://`):

```sh
node scripts/build-data.mjs    # writes data/showtimes.json
python3 -m http.server 8000    # then visit http://localhost:8000
```

In production only the second step runs in the browser — the first is done daily
by GitHub Actions. The schedule loads automatically on open.
