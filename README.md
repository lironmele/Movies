# Movie Showtimes

A static page that fetches cinema schedules and displays the movies and their
showtimes, grouped by movie and by day. Every theater is shown at once: the
schedules from all providers are merged into a single movie list, and each
showtime is tagged with the theater's logo so you can see where it plays. It is
built around **pluggable movie providers** — Cinema City Galilot, Lev Ramat
HaSharon and Planet Ayalon are bundled today, and more can be added without
touching the UI.

## Structure

```
index.html              markup + styles (no app logic)
app.js                  provider-agnostic UI: search, day filter, accordion
lib/proxy.js            shared CORS-proxy helper
lib/day.js              canonical day key + shared Hebrew day label
providers/
  registry.js           the providers + fetchAllShows() (merge + theater tag)
  cinema-city.js        Cinema City provider factory (any branch by TheatreId)
  lev.js                Lev Cinema provider factory (any branch by locationId)
  planet.js             Planet Cinema provider factory (any branch by cinemaId)
assets/icons/           theater logos, fetched from each cinema's website
```

All providers are fetched in parallel by `fetchAllShows()`, which merges their
movies into one list (same title from two theaters collapses into one row) and
stamps every screening with `{ providerId, providerName, icon }`. A legend under
the title maps each logo to its theater; a provider that fails to load is
reported in a small banner without blocking the others.

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

## CORS proxy (required)

The cinema endpoints send no `Access-Control-Allow-Origin` header, so the browser
cannot call them directly. Requests are routed through
[cors-anywhere](https://github.com/Rob--W/cors-anywhere), which also forwards the
`X-Requested-With: XMLHttpRequest` header that Cinema City requires.

The proxy URL is editable in the page (saved to `localStorage`). It defaults to
the public demo host `https://cors-anywhere.herokuapp.com/`, which requires a
one-time manual unlock:

1. Open <https://cors-anywhere.herokuapp.com/corsdemo>
2. Click **Request temporary access to the demo server**

For anything beyond casual use, run your own cors-anywhere instance and paste
its URL into the proxy field.

## Run

The app now uses ES modules, so it must be served over HTTP (opening the file
directly via `file://` will not load the modules):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

The schedule loads automatically on open.
