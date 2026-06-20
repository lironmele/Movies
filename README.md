# Cinema City Galilot — Showtimes

A single static page (`index.html`) that fetches the full forward schedule for
Cinema City Galilot (Theatre `1170`) and displays the movies and their showtimes,
grouped by movie and by day, with VIP screenings merged in.

## How it works

- Pulls from the undocumented `EventsFlat` endpoint — see
  [`docs/cinema-city-galilot-api.md`](docs/cinema-city-galilot-api.md).
- Makes 1–2 requests (standard halls + optional VIP), merges and de-dupes them,
  groups screenings by `ExportCode`, and sorts chronologically.
- Each showtime links to the booking handle built from `Dates.EventId`.

## CORS proxy (required)

The endpoint sends no `Access-Control-Allow-Origin` header, so the browser
cannot call it directly. Requests are routed through
[cors-anywhere](https://github.com/Rob--W/cors-anywhere), which forwards the
required `X-Requested-With: XMLHttpRequest` header to Cinema City.

The proxy URL is editable in the page (saved to `localStorage`). It defaults to
the public demo host `https://cors-anywhere.herokuapp.com/`, which requires a
one-time manual unlock:

1. Open <https://cors-anywhere.herokuapp.com/corsdemo>
2. Click **Request temporary access to the demo server**

For anything beyond casual use, run your own cors-anywhere instance and paste
its URL into the proxy field.

## Run

Just open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Click **טען לוח** (Load schedule) to fetch.
