# Scraping Planet Cinema Showtimes — API Report

**Target:** `https://www.planetcinema.co.il/cinemas/ayalon/1025` (פלאנט אילון / Planet Ayalon)
**Date of investigation:** 2026-06-22

---

## 1. Summary

The cinema page is a shell — the actual showtimes are **not** in the HTML. They are loaded
client-side from a JSON backend. That backend is the **Vista / Cineworld "quickbook" data API**
(Planet Cinema is part of Cineworld Group PLC, which is visible in the page footer). The same API
powers Cineworld UK, Yes Planet, and other Cineworld brands — only the host and group ID differ.

The good news: it is a clean, unauthenticated, read-only JSON API. No login, no API key, no
signed tokens. You can get every film and every showtime for the cinema with two endpoints.

---

## 2. Key identifiers

| Thing | Value | How it was found |
|---|---|---|
| API host | `www.planetcinema.co.il` | same origin as the site |
| API base path | `/il/data-api-service/v1/quickbook/{groupId}` | Vista standard path |
| **Group ID** | **`10100`** | only ID returning HTTP 200; matches `xmedia/img/10100/` asset paths |
| **Cinema ID (Ayalon)** | **`1025`** | the number in your URL; confirmed by the cinemas endpoint |
| Language | `he_IL` (or `en_GB`) | `lang` query param |

Other cinemas in the chain (same group ID, just swap the cinema ID): Beersheva `1074`,
Zichron Yaakov `1075`, Haifa `1070`, Jerusalem `1073`.

---

## 3. The three endpoints you need

All are `GET`, all take `?attr=&lang=he_IL`, all return `{"body": {...}}`.

### 3a. List of cinemas (optional — for discovery)
```
GET /il/data-api-service/v1/quickbook/10100/cinemas/with-event/until/{YYYY-MM-DD}?attr=&lang=he_IL
```
Returns each cinema's `id`, `displayName`, `address`, `latitude`, `longitude`, `bookingUrl`.

### 3b. Which dates have showings — **call this first**
```
GET /il/data-api-service/v1/quickbook/10100/dates/in-cinema/1025/until/{YYYY-MM-DD}?attr=&lang=he_IL
```
Returns just the dates that actually have events, e.g.:
```json
{"body":{"dates":["2026-06-22","2026-06-23","2026-06-24","2026-06-26"]}}
```
This is how you discover the **available window** (see §5) and avoid wasting requests on empty days.

### 3c. Films + showtimes for one date — **the main one**
```
GET /il/data-api-service/v1/quickbook/10100/film-events/in-cinema/1025/at-date/{YYYY-MM-DD}?attr=&lang=he_IL
```
Returns two parallel arrays, `films` and `events`, joined by `filmId`.

> ⚠️ There is **no** bulk `.../film-events/.../until/{date}` endpoint — it returns 404.
> You must call the per-date endpoint once per date. That's why you call **3b first** and then
> loop only over the dates it returns.

---

## 4. Response schema (the part that matters)

### `films[]`
| Field | Example | Notes |
|---|---|---|
| `id` | `"8134s2r"` | join key for events |
| `name` | `"אובססיה"` | Hebrew title |
| `length` | `110` | runtime in minutes |
| `posterLink` | `https://.../posters/8134S2R.jpg` | poster image |
| `videoLink` | YouTube URL | trailer |
| `link` | `https://.../films/obsession/8134s2r` | film page |
| `releaseYear` | `2025` | |
| `attributeIds` | `["14-plus","2d","horror","original-lang-en","subbed",...]` | tags: rating, format, genre, language |

### `events[]` (one per screening)
| Field | Example | Notes |
|---|---|---|
| `id` | `"263146"` | unique screening / order ID |
| `filmId` | `"8234s2r"` | join back to `films[]` |
| `cinemaId` | `"1025"` | |
| `businessDay` | `"2026-06-23"` | the date |
| **`eventDateTime`** | **`"2026-06-23T10:00:00"`** | **the showtime you want** |
| `auditorium` | `"אולם 5"` | screen / hall name |
| `auditoriumTinyName` | `"5"` | short hall number |
| `bookingLink` | `https://tickets5.planetcinema.co.il/api/order/263146?lang=he` | ⚠️ internal `/api/` path — 404s in a browser. Strip `/api/` → `https://tickets5.planetcinema.co.il/order/263146?lang=he` for the real ordering page |
| `soldOut` | `false` | |
| `availabilityRatio` | number | rough seat availability |
| `attributeIds` | `["2d","comedy","subbed",...]` | format/language of this specific screening |

To build "what's showing and when," you iterate `events`, take `eventDateTime` for the time and
`films[filmId].name` for the title. That's the whole job.

---

## 5. How much data you can get (the "next week" question)

The `dates` endpoint defines the window. On the day of investigation it returned showings out to
**2026-06-26**, plus some sparse far-future dates (mid-July) that are pre-sale events. In practice
Cineworld publishes the **next ~3–7 days** reliably, with the schedule firming up a few days ahead.

So the robust pattern is:

1. Ask the `dates` endpoint with an `until` ~14 days out.
2. Loop the dates it returns and call `film-events` for each.

You never have to guess — the API tells you which dates exist.

---

## 6. Operational notes (caching, blocking, CORS)

- **Cloudflare-fronted** with `cache-control: public, max-age=60`. Responses are cached ~60s and
  served from Cloudflare's edge (`cf-cache-status: HIT`). Don't hammer it; once a minute per date
  is more than enough. Occasionally a cold/edge-cached "today" can come back empty for a few
  seconds — just retry.
- **No CORS headers.** A browser `fetch()` from your own web app's origin will be **blocked** by
  the browser. You must call this from a **server / backend / script** (Python, Node, a cron job,
  a serverless function), not directly from front-end JavaScript. Your own backend then serves the
  cleaned data to your app.
- **No auth, no rate-limit headers observed**, but be polite: a small delay between requests and a
  real `User-Agent` header. Cache results on your side (the schedule changes at most a few times a
  day).
- The API is **undocumented and unofficial** — Cineworld can change paths or IDs without notice.
  Centralize the base URL / group ID / cinema ID as config so a change is a one-line fix. Validate
  the JSON shape on each run and alert if `body.films` is missing.

---

## 7. Legal / ToS

This is public, unauthenticated data, which keeps things relatively low-risk, but it is still
**unofficial scraping** of a private site. Before shipping anything public-facing: check
`planetcinema.co.il/robots.txt` and the site's terms, keep request volume low, cache aggressively,
and don't redistribute their poster images or imply affiliation. For personal "what's near me
tonight" use this is firmly in normal territory; a commercial product is a different conversation.

---

## 8. Reference implementation (validated, working)

```python
import requests, datetime

BASE   = "https://www.planetcinema.co.il/il/data-api-service/v1/quickbook/10100"
LANG   = "he_IL"
CINEMA = "1025"                      # Planet Ayalon
H      = {"User-Agent": "Mozilla/5.0"}

def get_dates(cinema, horizon_days=14):
    until = (datetime.date.today() + datetime.timedelta(days=horizon_days)).isoformat()
    r = requests.get(f"{BASE}/dates/in-cinema/{cinema}/until/{until}",
                     params={"attr": "", "lang": LANG}, headers=H, timeout=30)
    r.raise_for_status()
    return r.json()["body"]["dates"]

def get_events(cinema, date):
    r = requests.get(f"{BASE}/film-events/in-cinema/{cinema}/at-date/{date}",
                     params={"attr": "", "lang": LANG}, headers=H, timeout=30)
    r.raise_for_status()
    return r.json()["body"]          # -> {"films":[...], "events":[...]}

def schedule(cinema):
    out = []
    for date in get_dates(cinema):
        body  = get_events(cinema, date)
        films = {f["id"]: f for f in body["films"]}
        for e in body["events"]:
            film = films.get(e["filmId"], {})
            out.append({
                "date":       date,
                "time":       e["eventDateTime"][11:16],   # "HH:MM"
                "datetime":   e["eventDateTime"],
                "film":       film.get("name"),
                "runtime":    film.get("length"),
                "auditorium": e["auditorium"],
                "sold_out":   e["soldOut"],
                "booking":    e["bookingLink"],
                "attributes": e["attributeIds"],           # 2d/3d, subbed, genre...
            })
    out.sort(key=lambda x: x["datetime"])
    return out

if __name__ == "__main__":
    for s in schedule(CINEMA):
        flag = " [SOLD OUT]" if s["sold_out"] else ""
        print(f'{s["date"]} {s["time"]}  {s["film"]}  ({s["auditorium"]}){flag}')
```

This was run against the live API and returned 189 showtimes across the first 3 available days for
Ayalon, so it works as-is.

---

## 9. TL;DR

1. **Group ID `10100`, Cinema ID `1025`.**
2. `GET .../dates/in-cinema/1025/until/{date}` → list of dates that have showings.
3. For each date: `GET .../film-events/in-cinema/1025/at-date/{date}` → `films[]` + `events[]`.
4. Join on `filmId`; read `eventDateTime` for the time.
5. Run it **server-side** (no CORS), cache ~minutes, be gentle.
