# Movie Showtimes

A static page that fetches cinema schedules and displays the movies and their
showtimes, grouped by movie and by day. It is built around **pluggable movie
providers** — Cinema City Galilot and Lev Ramat HaSharon are bundled today, and
more can be added without touching the UI.

## Structure

```
index.html              markup + styles (no app logic)
app.js                  provider-agnostic UI: search, day filter, accordion
lib/proxy.js            shared CORS-proxy helper
providers/
  registry.js           the list of available providers
  cinema-city.js        Cinema City provider factory (any branch by TheatreId)
  lev.js                Lev Cinema provider factory (any branch by locationId)
```

When more than one provider is registered, a provider selector appears under
the title; the choice is remembered in `localStorage`.

## Adding a provider

A provider is any object shaped like:

```js
{
  id:   "my-cinema",          // stable id (used for persistence)
  name: "My Cinema",          // label shown in the selector
  async fetchShows() {        // returns the normalized shape below
    return [
      {
        key: "movie-123",
        name: "Some Movie",
        screenings: [
          { ts: 1750000000000, day: "שבת 20/06/2026", hour: "18:00",
            bookingUrl: "https://…" },
        ],
      },
    ];
  },
}
```

Add it to the array in [`providers/registry.js`](providers/registry.js). The UI
only ever sees this normalized shape, so it never needs to change. For another
Cinema City branch, reuse the factory with that branch's `TheatreId`:

```js
createCinemaCityProvider({ id: "cc-rishon", name: "Cinema City · ראשון", theatreId: <id> })
```

For another Lev branch, reuse its factory with that branch's `locationId`
(branch IDs are listed in [`docs/lev-presentations-api.md`](docs/lev-presentations-api.md)):

```js
createLevProvider({ id: "lev-telaviv", name: "לב · תל אביב", locationId: 1150 })
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
