# Movie Showtimes

A page that displays cinema schedules grouped by movie and by day. Every theater
is shown at once: the schedules from all providers are merged into a single movie
list, and each showtime is tagged with the theater's logo so you can see where it
plays. It is built around **pluggable movie providers** — Cinema City Galilot,
Cinema City Kfar Saba, Lev Ramat HaSharon, Planet Ayalon, Rav-Hen Givatayim,
Rav-Hen Dizengoff and the Tel Aviv Cinematheque are bundled today, and more can be added
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
app.js                  UI: reads data/showtimes.json, search, day filter, accordion,
                        inline booking frame
data/showtimes.json     the pre-built, merged schedule (regenerated daily)
scripts/build-data.mjs  Node build script: fetch all providers -> write the JSON
lib/proxy.js            optional request-proxy helper (off by default)
lib/day.js              canonical day key + shared Hebrew day label
providers/
  registry.js           the providers + fetchAllShows() (merge + theater tag)
  cinema-city.js        Cinema City provider factory (any branch by TheatreId)
  lev.js                Lev Cinema provider factory (any branch by locationId)
  planet.js             Planet Cinema / Rav-Hen provider factory (any branch by cinemaId)
  cinematheque.js       Tel Aviv Cinematheque provider (scrapes cinema.co.il/shown/)
assets/icons/           theater logos, fetched from each cinema's website
.github/workflows/update-data.yml   the daily cron job
```

The build script calls `fetchAllShows()`, which fetches all providers in parallel
and merges their movies into one list (same title from two theaters collapses
into one row), stamping every screening with `{ providerId, providerName, icon }`.
It then sorts everything — each movie's screenings chronologically, and the
movies themselves by total number of screenings (most first) — and writes
`data/showtimes.json`:

```json
{
  "generatedAt": "2026-06-22T03:00:00.000Z",
  "regions": [ { "id": "sharon", "name": "השרון" } ],
  "providers": [ { "id": "...", "name": "...", "short": "...", "icon": "...", "region": "sharon" } ],
  "shows": [ { "key": "...", "name": "...", "screenings": [ /* tagged */ ] } ],
  "errors": [ { "provider": "...", "reason": "..." } ]
}
```

The page reads that file on load. If a provider failed during the last build, it is listed in `errors` and
shown in a small banner without blocking the rest.

## Many theaters, shared logos

The page is built to stay usable as the theater list grows, and since branches
of one chain share a logo, it never relies on the logo alone:

- **"My cinemas" picker.** One button above the search summarizes the choice
  ("3 בתי קולנוע · השרון") and opens a sheet with the theaters grouped by
  region. Regions are folded rows with an `on/total` count and a "בחירת כולם"
  toggle; "רק <אזור>" shortcuts and a city/chain search sit on top. The choice
  is remembered in `localStorage` (an empty choice means "all theaters", so new
  theaters appear by default). Days, counts and ordering follow it.
- **First-visit region prompt.** Until the viewer has chosen, a card above the
  search asks "איפה אתם רואים סרטים?" and filters to a region in one tap (or
  keeps every theater). It only shows when there is more than one region.
- **One day at a time.** The day strip starts on today (היום / מחר / weekday +
  date); showtimes that already started are dimmed.
- **Compact movie rows.** Each row shows the next showing, at most three chain
  logos plus "+N", and how many theaters show it.
- **Opened movie.** Theaters are grouped under region headers, one line each
  (logo + branch name `short`), folding after six with "הצגת עוד N". A
  "לפי שעה" switch lists every time in order, split into part of day, with
  each time carrying its theater.

## Booking inline

Clicking a showtime opens its `bookingUrl` in an iframe right under that theater's
times instead of sending you to a new tab, so you keep the schedule in view while
you book. One frame is open at a time; it closes when you click the same time
again, hit the ✕, collapse the movie, or change the day/search/theaters. In the
"לפי שעה" view the frame opens under that part of the day. The chip is still
a real link, so ctrl/cmd/middle-click keeps the browser's own new-tab behavior and
the frame's title bar carries a "פתיחה בלשונית" escape hatch for any ticket page
that misbehaves when framed.

## Adding a provider

A provider is any object shaped like:

```js
{
  id:   "my-cinema",          // stable id
  name: "My Cinema",          // theater name (legend + tooltip)
  short: "Downtown",          // branch name, shown next to its showtimes
  icon: "assets/icons/my.png",// theater logo shown next to each showtime
  region: "tlv",              // one of the `regions` ids in registry.js
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

Add it to the array in [`providers/registry.js`](providers/registry.js) with a
`region` from the `regions` list there (add a region if none fits), and drop
its logo in `assets/icons/` (grab the theater's own favicon/PNG from its site).
The UI only ever sees the normalized shape — plus the per-screening theater tag
that `fetchAllShows()` adds — so it never needs to change. For another Cinema
City branch, reuse the factory with that branch's `TheatreId`:

```js
createCinemaCityProvider({ id: "cc-rishon", name: "Cinema City · ראשון", short: "ראשון", icon: "assets/icons/cinema-city.png", region: "tlv", theatreId: <id> })
```

For another Lev branch, reuse its factory with that branch's `locationId`
(branch IDs are listed in [`docs/lev-presentations-api.md`](docs/lev-presentations-api.md)):

```js
createLevProvider({ id: "lev-telaviv", name: "לב · תל אביב", short: "תל אביב", icon: "assets/icons/lev.png", region: "tlv", locationId: 1150 })
```

For another Planet Cinema branch, reuse its factory with that branch's `cinemaId`
(branch IDs are listed in [`docs/planet-cinema-api.md`](docs/planet-cinema-api.md)):

```js
createPlanetProvider({ id: "planet-haifa", name: "פלאנט · חיפה", short: "חיפה", icon: "assets/icons/planet-cinema.png", region: "north", cinemaId: 1070 })
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

## The Rav-Hen provider

- Rav-Hen is a sibling Cineworld chain on the same Vista "quickbook" API, only
  under `www.rav-hen.co.il/rh/…` with group ID `10104` — see
  [`docs/rav-hen-api.md`](docs/rav-hen-api.md). It reuses the Planet factory
  with `base: RAV_HEN_BASE`.
- Both of the chain's current branches are included: Givatayim (`1058`) and
  Dizengoff (`1071`).

## The Tel Aviv Cinematheque provider

- Scrapes the public "by day" page `https://www.cinema.co.il/shown/?date=…` —
  see [`docs/cinematheque-tlv-shown.md`](docs/cinematheque-tlv-shown.md). Its
  ticketing API (Presentations, like Lev) is behind Cloudflare and blocks
  datacenter IPs, so the HTML page is the reliable source.
- Makes one request per day for the next 14 days, reads the "by hour" tab, and
  groups screenings by title. A single day that fails is tolerated; the provider
  only errors if every day fails.
- Each showtime links to its `cintlv.pres.global/order/{id}` page (or the
  event's details page when it has no order link).

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
