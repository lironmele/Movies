# Hot Cinema — showtimes API

> Unofficial, undocumented. Verified 2026-09-25.

Hot Cinema runs the same ticketing platform as Cinema City (same `/tickets/…`
routes, same `Dates[].EventId` / `TheaterId` shape), but `EventsFlat` returns
nothing here. The site's own theater page (`js/theater-order.js`) uses a
per-day endpoint instead, so a branch's schedule takes one request per date.

## Branches

The site theater id is the number in `https://www.hotcinema.co.il/theater/{id}`
(listed on the home page):

| theaterId | Branch |
|---|---|
| `1` | HOT CINEMA מודיעין |
| `2` | HOT CINEMA קריון (Kiryat Bialik) |
| `5` | HOT CINEMA אשדוד |
| `6` | HOT CINEMA נהריה |
| `8` | HOT CINEMA אשקלון |
| `9` | HOT CINEMA חיפה |
| `14` | HOT CINEMA פתח תקווה |
| `15` | HOT CINEMA כרמיאל |
| `16` | HOT CINEMA כפר סבא |
| `17` | HOT CINEMA רחובות |

Not included: `3` (פופ אפ, a roaming venue with a couple of one-off events)
and `22` (DREAM STAGE חולון, a live-show stage — stand-up and concerts, every
event flagged `IsPreformance`).

## 1. Which dates have screenings

`GET https://www.hotcinema.co.il/theater/{theaterId}` — the HTML embeds them:

```html
<theaterorder … eventsdays='["04/10/2026","26/11/2026",…,"25/09/2026"]'>
```

`DD/MM/YYYY`, unsorted, running months ahead (sparse far dates are pre-sales).
Filter to the window you want.

## 2. One day's schedule

```
GET https://www.hotcinema.co.il/tickets/TheaterEvents2?date=DD/MM/YYYY&theatreid={theaterId}&movieid=0
X-Requested-With: XMLHttpRequest
```

The site sends many more (empty) filter params; they are optional.

```jsonc
{
  "TheaterEvents": [
    {
      "MovieName": "בחורים טובים 3",
      "MovieId": 3889,                     // stable movie id
      "ScreeningType": "…",
      "Dates": [
        {
          "Date": "2026-09-25T17:30:00",   // local Asia/Jerusalem, no offset
          "Hour": "17:30",
          "EventId": "152657",             // bookable screening id
          "TheaterId": 16,
          "IsVIP": false,
          "IsPreformance": false
        }
      ]
    }
  ],
  "Genres": [ … ]
}
```

`date` is the business day: a day's response can include an after-midnight
show dated the next calendar day. Group by the queried date.

## 3. Booking link

```
https://www.hotcinema.co.il/order/?eventID={EventId}&theaterId={TheaterId}
```

302-redirects to `https://tickets.hotcinema.co.il/site/{siteCode}?code={siteCode}-{EventId}…`.
The per-branch `siteCode` (e.g. `1197` for Kfar Saba) isn't in the API, so link
to the redirecting URL. The ticket page sends no `X-Frame-Options`, so it opens
in the inline booking frame.
