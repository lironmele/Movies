# Rav-Hen — showtimes API

> Unofficial, undocumented. Verified 2026-09-25.

Rav-Hen (רב חן) is part of Cineworld, like Planet Cinema, and its site is
backed by the same Vista "quickbook" JSON API described in
[`planet-cinema-api.md`](planet-cinema-api.md). Only the base path and the
group ID differ:

| | Planet | Rav-Hen |
|---|---|---|
| Base | `https://www.planetcinema.co.il/il/data-api-service/v1/quickbook/10100` | `https://www.rav-hen.co.il/rh/data-api-service/v1/quickbook/10104` |
| Group ID | `10100` | `10104` (matches the site's `xmedia/img/10104/` assets) |

Endpoints (`?attr=&lang=he_IL`) are identical:

- `…/cinemas/with-event/until/{YYYY-MM-DD}` — branch list
- `…/dates/in-cinema/{cinemaId}/until/{YYYY-MM-DD}` — dates with showings
- `…/film-events/in-cinema/{cinemaId}/at-date/{YYYY-MM-DD}` — `films[]` + `events[]`

## Branches

The chain currently has two branches (also listed in `apiSitesList` on the
home page):

| cinemaId | Branch |
|---|---|
| `1058` | רב חן גבעתיים (Givatayim Mall) |
| `1071` | רב חן דיזינגוף (Dizengoff Center, Tel Aviv) |

## Booking links

As with Planet, `bookingLink` points at `https://tickets5.rav-hen.co.il/api/order/{id}`,
which 404s in a browser. Dropping `/api/` gives the working order page
`https://tickets5.rav-hen.co.il/order/{id}?lang=he` (HTTP 200).
