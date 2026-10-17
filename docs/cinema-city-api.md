# Cinema City — Showtimes API (ticketing backend)

> Unofficial, undocumented endpoint behind `tickets.cinema-city.co.il`.
> Structure may change without notice. Verified 2026-10-17.

## TL;DR

**One request per branch** returns that branch's whole forward schedule,
every hall type included (standard, VIP, Prime, Lounge, Onyx):

```
GET https://tickets.cinema-city.co.il/api/presentations/?locationId=1170&startDate=2026-10-17
```

No auth, no cookies, no tokens and no custom headers. It works from plain
Node `fetch`. The booking link for a screening is
`https://tickets.cinema-city.co.il/order/<id>`.

---

## Background: what changed

Between 2026-10-04 and 2026-10-06 Cinema City replaced its old site with a
Wix (Wix Studio) site. The old endpoint,
`https://www.cinema-city.co.il/tickets/EventsFlat?TheatreId=…&VenueTypeId=…`,
now returns 404, and so does every branch in the old provider.

The ticketing host `tickets.cinema-city.co.il` was **not** replaced. It is
the same "presglobal" ticketing platform that Lev uses (see
[lev-presentations-api.md](lev-presentations-api.md)), and its JSON API under
`/api/…` still works. Only its root (`/`) returns 403.

### How it was found

1. The branch pages are Wix dynamic pages at `/city/<slug>`
   (`/city/glilot`, …), backed by the `CityDynamicPage` CMS collection. The
   SSR `wix-warmup-data` for each one has a `locationId` field (1170 for
   Glilot, …), but the HTML contains no showtimes.
2. The "הזמנת כרטיסים" widget (choose a branch, then "לפי שעות") loads the
   schedule from page code running in the Wix platform web worker. Those
   requests don't appear in the page's own resource timing or network log.
   The dates and rows it renders match this API exactly: for Glilot on
   2026-10-17 it showed the same 17 business dates and the same first
   screening (`מי בעד`, 11:40) as the API.
3. When a showtime is chosen and "הזמנת כרטיסים" is clicked, the browser
   navigates straight to `https://tickets.cinema-city.co.il/order/880074`.
   That page then calls `/api/presentations/880074`,
   `/api/seats/seatplanV2`, … on the same host.
4. The list form of that API (`/api/presentations/?locationId=…`), which is
   already documented for Lev, works for Cinema City too.

We call the ticketing API directly instead of the Wix layer. It is the
system of record (the site's own booking flow runs on it), it needs no Wix
instance token, and it avoids a headless browser.

---

## Endpoint

```
GET https://tickets.cinema-city.co.il/api/presentations/
```

| Param        | Value        | Notes                                                                          |
|--------------|--------------|--------------------------------------------------------------------------------|
| `locationId` | e.g. `1170`  | **Required in practice.** Filters to one branch on the server. Without any params the endpoint returns 500. |
| `startDate`  | `YYYY-MM-DD` | Optional, inclusive lower bound on `businessDate`. We send today's date in Israel. |
| `endDate`    | `YYYY-MM-DD` | Optional, inclusive upper bound. We omit it so special/premiere screenings published months ahead are kept. |

Headers: none required. We send `Accept: application/json`.

Size and latency: about 250–460 presentations per branch, 350–650 KB, 0.5–5 s.

### Response

```jsonc
{
  "presentations": [
    {
      "id": 880074,                       // presentation id → booking link
      "dateTime": "2026-10-17 11:40",     // local Israel wall-clock, no offset
      "businessDate": "2026-10-17",       // cinema business day (use for dayKey)
      "featureName": "מי בעד",            // movie title (display)
      "featureId": 6622,                  // stable movie id (group by this)
      "featureCode": "8460",
      "venueTypeId": 1,                   // 1 standard, 30 VIP, 4 Prime (Netanya) …
      "venueName": "אולם 26",             // e.g. "אולם 18(Lounge)", "אולם  16 VIP"
      "venueLocationId": 1170,
      "locationName": "סינמה סיטי גלילות",
      "durationInMinutes": 88,
      "soldout": 0,
      "availRatio": 0.8868,
      "ticketSaleStop": "2026-10-17 11:48:00",
      "private": 0
      // … plus language / rating / category fields
    }
  ],
  "hasReserved": true,
  "hasGA": false
}
```

All hall types come back in one response, so (unlike the old `EventsFlat`)
there is no separate VIP request. The provider skips `venueTypeId` 101 (VOD on
this platform, as with Lev) as a precaution, and drops duplicate `id`s.

### Related endpoints (same host, no auth)

- `GET /api/customer/locations` returns
  `[{ "text": "סינמה סיטי גלילות", "value": 1170 }, …]`, the list of
  branch IDs.
- `GET /api/presentations/<id>?referralMiniSiteId=0` returns a single
  presentation, with `locationId` and the full `dateTime`.

---

## Branch IDs

The old `TheatreId` values carried over unchanged. They match the ticketing
API's `locationId` and the `locationId` field of the Wix `CityDynamicPage`
records:

| Branch        | Wix page                | `locationId` |
|---------------|-------------------------|--------------|
| גלילות        | `/city/glilot`          | 1170         |
| ראשון לציון   | `/city/rishon-lezion`   | 1173         |
| ירושלים       | `/city/jerusalem`       | 1174         |
| כפר סבא       | `/city/kfar-saba`       | 1175         |
| נתניה         | `/city/netanya`         | 1176         |
| באר שבע       | `/city/beer-sheva`      | 1178         |
| אשדוד         | `/city/ashdod`          | 1181         |
| חדרה          | `/city/hadera`          | 1350         |

`/api/customer/locations` also lists non-public IDs (995 head office, 1179
test, 1171/1172/1177 other venues). Don't use them.

---

## Booking URL

```
https://tickets.cinema-city.co.il/order/<presentation id>
```

This is the exact URL the Wix site opens when a showtime is chosen and
"הזמנת כרטיסים" is clicked. It returns 200 with no redirect. The order page
uses a Cloudflare Turnstile challenge later in checkout, but opening the link
needs nothing.

---

## Caveats

- The API is undocumented, and the field set is the generic presglobal one.
  If it breaks, check the Lev provider/doc first, because the two chains share
  the platform.
- `dateTime` has no offset. The provider parses it as local wall-clock time,
  which is only used for sorting, and takes the day from `businessDate`. This
  is the same convention as the Lev and Hot Cinema providers.
- Responses can take up to about 5 s per branch. All 8 branches are fetched in
  parallel with the other providers.
