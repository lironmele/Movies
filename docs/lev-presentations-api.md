# Lev Cinema — `/api/presentations/` API Reference

Reference for the showtimes endpoint of Lev Cinema (קולנוע לב). Audience: a
developer/agent building a site that lists shows with their date and time.

This single endpoint returns everything needed to render a schedule: each record
already carries the movie, venue, location, date/time, language, and
availability. No second call is strictly required.

---

## 1. Endpoint

```
GET https://ticket.lev.co.il/api/presentations/
```

- **Method:** `GET` (only `GET`/`HEAD` allowed).
- **Auth:** none. No API key, cookie, token, or custom header is required.
- **Headers:** none required. `Accept: application/json` is fine but optional.
- **CORS:** the API is same-origin to `ticket.lev.co.il`. From a browser on a
  different origin you will likely hit CORS; call it from your **server/backend**
  (or a serverless proxy) and serve the cleaned data to your frontend. From any
  server-side HTTP client it works with no headers.
- **Trailing slash matters:** use `/api/presentations/` (with the slash).

> A sibling endpoint `GET /api/customer/locations` returns the list of locations
> as `[{ "text": <name>, "value": <locationId> }, …]`. Use it if you want to
> discover location IDs dynamically instead of hard-coding them (Section 7).

---

## 2. Query parameters

| Param | Type | Effect | Notes |
|---|---|---|---|
| `locationId` | int | **Filters to one cinema, server-side.** Strongly recommended. | Without it you get the entire historical dump (see below). With it you get only that cinema's **upcoming** schedule and **no VOD rows**. |
| `startDate` | `YYYY-MM-DD` | Lower bound on `businessDate`, **inclusive**. | Only reliably effective **together with** `locationId`. |
| `endDate` | `YYYY-MM-DD` | Upper bound on `businessDate`, **inclusive**. | Optional; omit to get everything from `startDate` forward. |
| `date` | `YYYY-MM-DD` | **Ignored.** Do not use. | Has no effect on the result. |

### Behavior, precisely (verified against the live API)

- **No params** → returns **all 631+ records**: every location, every date back
  to 2020, **including VOD / home-streaming entries**. Heavy (~880 KB) and messy.
  You'd have to filter client-side. Avoid for a showtimes site.
- **`?locationId=1162`** → returns only that cinema's records (e.g. 13), only
  physical-hall showtimes (no VOD), only current/upcoming dates. This is the
  clean path.
- **`?locationId=1162&startDate=2026-06-22&endDate=2026-06-28`** → that cinema's
  shows within the inclusive date window. Single day = set `startDate` ==
  `endDate`.
- `startDate`/`endDate` **without** `locationId` do not filter as expected — keep
  `locationId` present whenever you use them.

### Time window the data covers

There is no way to request arbitrary far-future dates — you only get what the
cinema has published. In practice that is **today through roughly 4 weeks out**.
The chain's own site notes that **weekend listings are finalized only by the
Tuesday of that week**, so a show appearing/disappearing near the edge of the
window is expected, not a bug. Re-fetch (e.g. daily) to stay current.

---

## 3. Response shape

`Content-Type: application/json`. Top-level object:

```jsonc
{
  "presentations": [ /* array of presentation objects, see §4 */ ],
  "hasReserved": true,   // platform flags; ignore for a listings site
  "hasGA": false
}
```

Always read the **`presentations`** array. It may be empty (`[]`) for a location
with no upcoming shows. Order is **not guaranteed** — sort client-side by
`dateTime`.

---

## 4. Presentation object — fields you need

Each element of `presentations` is one screening. The fields below are the ones
relevant to a “shows + date + time” site. (The record has ~60 fields total;
the rest are booking-flow / internal and can be ignored — see §6.)

| Field | Type | Meaning / how to use |
|---|---|---|
| `id` | int | Unique presentation (showtime) ID. Stable key for a row. Also used to build the booking link — see §5. |
| `dateTime` | string | **Show date + start time**, local wall-clock, format `"YYYY-MM-DD HH:MM"` (24h, **no timezone suffix**). This is the primary value to display. Timezone is always **Asia/Jerusalem** (§8). |
| `businessDate` | string | `"YYYY-MM-DD"`. The cinema “calendar day” the show belongs to — group rows by this for a day-by-day layout. Usually equals the date part of `dateTime`; can differ for past-midnight shows. Use this for date filtering/grouping. |
| `featureName` | string | Movie title (Hebrew / primary). Display name. |
| `featureAdditionalName` | string | Secondary title, usually the English/original title. May be `""`. |
| `featureId` | int | Movie ID. Use to group showtimes by film, and to join to `/api/features/` for synopsis/poster/trailer (§7). |
| `durationInMinutes` | int | Runtime in minutes. |
| `featureRatingName` | string | Age rating label, Hebrew (e.g. `"מותר לכל הגילאים"`). See `featureRatingId` map in §9. |
| `featureRatingId` | int | Numeric rating code (§9). |
| `venueLocationId` | int | The cinema/branch ID (matches `locationId` query param). |
| `locationName` | string | Branch display name (e.g. `"לב רמת השרון"`). |
| `venueName` | string | Hall/screen/auditorium name within the branch (e.g. `"לב 1"`). For VOD rows this is `"VOD"`. |
| `venueTypeId` | int | **`1` = physical cinema hall, `101` = VOD (home streaming).** For a showtimes site, **keep only `venueTypeId === 1`.** (Filtering by a physical `locationId` already excludes VOD, but check this if you ever query with no `locationId`.) |
| `language` | int | Original-language code (§9 has the code→ISO map). |
| `languageISO` | string \| null | Original language as ISO-639 (e.g. `"en"`, `"he"`, `"fr"`). Easier than the numeric code. |
| `dubbedLanguageISO` | string \| null | Dub language ISO if dubbed (mostly `null`; e.g. `"he"` for kids’ dubbed screenings). |
| `subbedLanguageISO` | string \| null | Subtitle language ISO (commonly `"he"`). |
| `soldout` | int (0/1) | Explicit sold-out flag. **Note:** in practice this is frequently `0` even for busy shows; treat `availRatio` as the real signal. |
| `availRatio` | number | Seat **availability** ratio in `[0, 1]`. `1.0` ≈ wide open, approaching `0` ≈ nearly full. Optional UI (“almost full”). Treat as advisory. |
| `ticketSaleStart` | string \| null | `"YYYY-MM-DD HH:MM:SS"` when sales open. |
| `ticketSaleStop` | string \| null | When sales close (often the show start). |
| `newBookingUrl` | string \| null | Pre-built booking URL **when present, but it is `null` for essentially all rows** — do not rely on it. Construct the link yourself (§5). |

---

## 5. Building the “Buy tickets” / show link

`newBookingUrl` is null in practice, so build the booking URL from `id`:

```
https://ticket.lev.co.il/order/{id}
```

Verified: `GET https://ticket.lev.co.il/order/599191` → `200`. This is the
canonical per-show order page (the site’s own route is `/order/:presentationId`).

---

## 6. Fields you can ignore

These are present but empty/internal for listing purposes: `featureCode`,
`featureImportCode`, `featureRatingCode` (always null), `venueAdditionalName`,
`venueLocation`/`venueCity` (often null), `seatplanId`, `private`,
`specialEngagement`, `timestamp`, `vodStartDateTime`/`vodEndDateTime` (VOD only),
`presentationSynopsis`/`shortSynopsis` (always null here — get synopsis from
`/features/`), `externalUrl`, `inSeriesName`, `isAddonsEnabled`,
`isBestAvailableEnabled`, `isReserved`, `featureAttributes*` (empty), and the
`*2` / numeric language duplicates when you already have the `*ISO` variants.

---

## 7. Locations (branch IDs)

From `GET /api/customer/locations` (`value` = the `locationId`). Physical cinemas
relevant to showtimes:

| locationId | Name | whatson slug |
|---|---|---|
| 1150 | לב תל אביב (Tel Aviv, Dizengoff) | `telaviv` |
| 1151 | לב אבן יהודה (Even Yehuda) | `even-yehuda` |
| 1154 | לב דניאל (Daniel) | `daniel` |
| 1155 | לב עומר (Omer) | `omer` |
| 1158 | לב סמדר (Smadar) | `smadar` |
| 1161 | לב רעננה (Ra'anana) | `raanana` |
| 1162 | לב רמת השרון (Ramat HaSharon) | `ramathasharon` |

`locationId = 1` is **לב בבית (“Lev at home”) = VOD**, not a physical cinema —
exclude it. Other IDs in the locations list (e.g. `2`, `997`, and some city
names without upcoming shows) are internal/unused; don’t list them. To be safe,
only surface a location if a `locationId` query returns rows with
`venueTypeId === 1`.

### Optional join: richer movie metadata

`GET /api/features/` returns an array of movie objects keyed by `id`
(= `featureId`). Useful fields: `synopsis` (HTML), `director`, `actors`,
`releaseYear`, `trailer`, `duration`, `ratingName`, and `imageData` (poster).
Join `presentation.featureId → feature.id` only if you want posters/synopses;
it’s not needed just to show date/time.

---

## 8. Dates & timezone (important for correctness)

- All datetime strings are **local time in Asia/Jerusalem** and carry **no
  offset**. Do **not** parse them as UTC. If your stack converts to `Date`
  objects, attach the `Asia/Jerusalem` zone explicitly, or keep them as plain
  strings for display.
- Display the start time from `dateTime` (`"…HH:MM"`).
- Group/sort days by `businessDate`; sort showtimes within a day by `dateTime`.
- Israel observes DST; because the API gives wall-clock strings, you generally
  don’t need to handle the offset yourself unless you compute durations across
  the DST switch.

---

## 9. Enumerations (observed values)

**`featureRatingId` → label**

| id | label | approx |
|---|---|---|
| 1 | מותר לכל הגילאים | All ages |
| 4 | 12+ | 12+ |
| 5 | 14+ | 14+ |
| 2 | 16+ | 16+ |
| 6 | 18+ | 18+ |
| 9 | 9+ | 9+ |
| 3 | אחר | Other/unrated |

**`venueTypeId`** — `1` = physical cinema hall · `101` = VOD (exclude).

**`featureTypeId`** — `1` = standard theatrical feature · `121` = VOD/home title
(appears only under the VOD location; excluded once you filter by a physical
`locationId`).

**`language` code → ISO-639** (prefer the `*ISO` string fields; this map is for
the numeric `language`/`language2` codes if you need them):
`0`=none, `1`=en, `2`=he, `4`=ar, `6`=zh, `8`=da, `9`=nl, `12`=fi, `13`=fr,
`14`=ka, `15`=de, `17`=hi, `20`=it, `21`=ja, `22`=ko, `24`=no, `25`=fa, `26`=pl,
`27`=pt, `28`=ro, `29`=ru, `30`=sl, `31`=es, `32`=sv, `34`=tr, `38`=am, `41`=id,
`48`=hu, `62`=sr.

---

## 10. Recommended implementation flow

For a site that shows a branch’s upcoming schedule:

1. **Server-side**, fetch per location with a bounded window:
   ```
   GET /api/presentations/?locationId=1162&startDate=<today>&endDate=<today+7d>
   ```
   (Compute `today` in `Asia/Jerusalem`.) Repeat per branch you display.
2. Read `json.presentations`. Defensively keep only `venueTypeId === 1`.
3. Normalize each row to your own model:
   `{ id, movie: featureName, movieEn: featureAdditionalName, date: businessDate,
   time: dateTime.slice(11,16), durationMin: durationInMinutes,
   hall: venueName, rating: featureRatingName, soldOut: !!soldout,
   bookingUrl: \`https://ticket.lev.co.il/order/${id}\` }`.
4. **Group by `businessDate`**, then **sort by `dateTime`** within each day.
   Optionally also group by `featureId` to show all times per movie.
5. **Cache** the response (e.g. 1–6 h; the data changes at most daily). Don’t
   refetch on every page view — one pull covers the whole branch.
6. Re-fetch at least daily so newly published weekend shows appear.

### Minimal example (Node, server-side)

```js
async function getShows(locationId, startDate, endDate) {
  const url = `https://ticket.lev.co.il/api/presentations/`
            + `?locationId=${locationId}`
            + `&startDate=${startDate}&endDate=${endDate}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`presentations ${res.status}`);
  const { presentations = [] } = await res.json();

  return presentations
    .filter(p => p.venueTypeId === 1)                 // drop VOD defensively
    .map(p => ({
      id: p.id,
      movie: p.featureName,
      movieEn: p.featureAdditionalName || null,
      date: p.businessDate,                            // "YYYY-MM-DD"
      time: (p.dateTime || "").slice(11, 16),          // "HH:MM"
      dateTime: p.dateTime,                            // local Asia/Jerusalem
      durationMin: p.durationInMinutes,
      hall: p.venueName,
      rating: p.featureRatingName,
      langISO: p.languageISO,
      subISO: p.subbedLanguageISO,
      soldOut: Boolean(p.soldout),
      availRatio: p.availRatio,
      bookingUrl: `https://ticket.lev.co.il/order/${p.id}`,
    }))
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}
```

---

## 11. Gotchas checklist

- [ ] Call from a server/proxy, not the browser, to avoid CORS.
- [ ] Always pass `locationId`; otherwise you get the full historical + VOD dump.
- [ ] Filter `venueTypeId === 1` to exclude home-streaming entries.
- [ ] Parse `dateTime` as **Asia/Jerusalem** local time, not UTC.
- [ ] Read the `presentations` array from the wrapper object; handle `[]`.
- [ ] Don’t depend on `newBookingUrl` (null); build `/order/{id}`.
- [ ] `date=` param does nothing; use `startDate`/`endDate` (inclusive).
- [ ] Don’t trust `soldout` alone; use `availRatio` for an “almost full” hint.
- [ ] Re-fetch daily; the forward window is ~4 weeks and weekend rows firm up
      mid-week.
- [ ] Sort by `dateTime`; API order is unspecified.
```
