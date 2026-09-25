# Tel Aviv Cinematheque — `/shown/` page

Reference for scraping showtimes of the Tel Aviv Cinematheque (סינמטק תל אביב).

## Why HTML and not an API

Tickets are sold on the Presentations platform (`https://cintlv.pres.global`,
redirecting to `cintlv.presglobal.store`) — the same software as Lev, with the
same `/api/presentations/` endpoint. That host is behind Cloudflare and returns
**403 "Sorry, you have been blocked"** to datacenter IPs (e.g. CI runners), so it
can't be relied on from the daily build. The WordPress site `www.cinema.co.il`
is not blocked and renders the schedule server-side.

## Endpoint

```
GET https://www.cinema.co.il/shown/?date=YYYY-MM-DD
```

- No auth, no cookies. Returns the full HTML page for **one day**.
- Without `date` it shows today. Past dates aren't offered by the site's picker.
- Dates with nothing scheduled simply render an empty list.

## Structure

The page has two tabs with the same data; use the **"by hour"** tab:

```html
<div class="... tab-pane ... shown-content-hour" id="nav-date" ...>
  <div class="fest-box-parent-wrapper ...">
    <h4 class="by-date-title">14:00</h4>
    <div class="festival-grid-box box movie-cat-8 ">       <!-- one per screening -->
      ...
      <h3><a href="https://www.cinema.co.il/event/.../">Title</a></h3>
      ...
      <span class="badg">14:00</span>
      <a href="https://cintlv.pres.global/order/133211" class="order-btn">להזמנה</a>
    </div>
    <!-- more boxes when several events share an hour -->
  </div>
  ...
</div>
...
<footer>
```

- Read from `id="nav-date"` up to `<footer>`; the header mega-menu and the
  "by movie" tab repeat the same screenings and must be skipped.
- Titles contain WordPress HTML entities (`&#8211;` etc.) and sometimes a suffix
  after `|` (e.g. `… | הקרנה על פופים`, `… | נבחרי דוקאביב`).
- Some events (lectures, courses) have no `/order/{id}` link; link to the
  event's details page (the `<h3>` href) instead.
- All times are Asia/Jerusalem wall-clock.
