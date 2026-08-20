// Provider-agnostic UI: search, day filter, the movie accordion, and the
// inline booking frame.
// Every theater is shown at once. The merge + theater-tagging now happens
// server-side once a day (scripts/build-data.mjs); this page just reads the
// pre-built data/showtimes.json, so it only ever works with the normalized
// Show/Screening shape plus the per-screening theater tag.

const DATA_URL = "data/showtimes.json";

const $ = (id) => document.getElementById(id);
const searchEl = $("search");
const legendEl = $("legend");
const daysEl = $("days");
const movieListEl = $("movieList");
const noteEl = $("note");

// ---- State ------------------------------------------------------------------
let allShows = [];
let providers = []; // { id, name, icon } list, read from the data file for the legend
let selectedKey = null;
let query = "";
let activeDay = "";
// bookingUrl of the screening whose ticket page is open inline (one at a time).
let openBookingUrl = null;

function showNote(html, isError) {
  noteEl.innerHTML = html;
  noteEl.className = "note" + (isError ? " error" : "");
  noteEl.style.display = "";
}
function hideNote() { noteEl.style.display = "none"; }

// ---- Theater legend ---------------------------------------------------------
// A non-interactive key mapping each theater's logo to its name, so the small
// icons shown next to every showtime are decodable at a glance.
function renderLegend() {
  legendEl.innerHTML = "";
  for (const p of providers) {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.appendChild(makeLogo(p.icon, p.name));
    const label = document.createElement("span");
    label.textContent = p.name;
    item.appendChild(label);
    legendEl.appendChild(item);
  }
}

function makeLogo(src, name) {
  const img = document.createElement("img");
  img.className = "logo";
  img.src = src;
  img.alt = name;
  img.title = name;
  img.loading = "lazy";
  return img;
}

// ---- Filtering --------------------------------------------------------------
function visibleShows() {
  const q = query.trim().toLowerCase();
  return allShows.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false;
    if (activeDay) return s.screenings.some((sc) => sc.dayKey === activeDay);
    return true;
  });
}

function renderDays() {
  // Key by the canonical dayKey so the same date from two theaters is one chip;
  // keep the earliest ts for ordering and the display label for the text.
  const days = new Map();
  for (const s of allShows)
    for (const sc of s.screenings) {
      const cur = days.get(sc.dayKey);
      if (!cur || sc.ts < cur.ts) days.set(sc.dayKey, { ts: sc.ts, label: sc.day });
    }
  const ordered = [...days.entries()].sort((a, b) => a[1].ts - b[1].ts);

  daysEl.innerHTML = "";
  const make = (value, label) => {
    const b = document.createElement("button");
    b.className = "day-chip" + (activeDay === value ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => {
      activeDay = value;
      openBookingUrl = null;
      renderDays();
      renderMovieList();
    });
    daysEl.appendChild(b);
  };
  make("", "כל הימים");
  for (const [dayKey, { label }] of ordered) make(dayKey, label);
}

// Count a movie's screenings on the active day (or all of them when no day is
// selected). Used both for ordering and the count badge.
function shownCount(show) {
  if (!activeDay) return show.screenings.length;
  let n = 0;
  for (const sc of show.screenings) if (sc.dayKey === activeDay) n++;
  return n;
}

function renderMovieList() {
  const shows = visibleShows();
  // The build-time order is by all-days total. When a day is selected, re-sort
  // by that day's screening count so the order matches the visible counts.
  if (activeDay)
    shows.sort(
      (a, b) => shownCount(b) - shownCount(a) || a.name.localeCompare(b.name, "he")
    );
  movieListEl.innerHTML = "";

  if (!shows.length) {
    showNote(query.trim()
      ? `אין סרט שתואם ל“${query.trim()}”. נסו שם אחר.`
      : "אין הקרנות להצגה כרגע.");
    return;
  }
  hideNote();

  for (const show of shows) {
    const isActive = show.key === selectedKey;
    const screenings = activeDay
      ? show.screenings.filter((sc) => sc.dayKey === activeDay)
      : show.screenings;

    const row = document.createElement("div");
    row.className = "movie-row" + (isActive ? " active" : "");

    const btn = document.createElement("button");
    btn.className = "movie-item";
    btn.setAttribute("aria-expanded", String(isActive));

    const name = document.createElement("span");
    name.className = "title";
    name.textContent = show.name;
    btn.appendChild(name);

    // Right-hand meta: the theaters this movie plays at, then the count. The
    // logos let you see *where* a movie is showing without expanding the row.
    const meta = document.createElement("span");
    meta.className = "meta";

    const theaters = document.createElement("span");
    theaters.className = "theaters";
    const seen = new Set();
    for (const sc of screenings) {
      if (seen.has(sc.providerId)) continue;
      seen.add(sc.providerId);
      theaters.appendChild(makeLogo(sc.icon, sc.providerName));
    }
    meta.appendChild(theaters);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = screenings.length === 1 ? "הקרנה אחת" : `${screenings.length} הקרנות`;
    meta.appendChild(count);

    btn.appendChild(meta);

    btn.addEventListener("click", () => {
      selectedKey = isActive ? null : show.key;
      openBookingUrl = null;
      renderMovieList();
    });
    row.appendChild(btn);

    if (isActive) row.appendChild(buildShowtimesPanel(screenings));
    movieListEl.appendChild(row);
  }
}

function buildShowtimesPanel(screenings) {
  const panel = document.createElement("div");
  panel.className = "movie-panel";

  // Group by canonical dayKey so both theaters' times sit under one day; the
  // screenings arrive ts-sorted, so within a day the times stay chronological
  // and the theater logo (set below) is what tells the cinemas apart.
  const byDay = new Map();
  for (const sc of screenings) {
    if (!byDay.has(sc.dayKey)) byDay.set(sc.dayKey, { label: sc.day, list: [] });
    byDay.get(sc.dayKey).list.push(sc);
  }
  for (const [, { label, list }] of byDay) {
    const group = document.createElement("div");
    group.className = "day-group";

    const dl = document.createElement("div");
    dl.className = "label";
    dl.textContent = label;
    group.appendChild(dl);

    const times = document.createElement("div");
    times.className = "times";
    for (const sc of list) {
      const isOpen = sc.bookingUrl === openBookingUrl;
      const a = document.createElement("a");
      a.className = "time" + (isOpen ? " open" : "");
      a.href = sc.bookingUrl;
      a.rel = "noopener";
      a.dataset.bookingUrl = sc.bookingUrl;
      a.setAttribute("aria-expanded", String(isOpen));
      // The theater logo next to the time says which cinema this screening is at.
      a.title = sc.providerName;
      a.appendChild(makeLogo(sc.icon, sc.providerName));
      const hour = document.createElement("span");
      hour.textContent = sc.hour;
      a.appendChild(hour);
      // A plain click opens the ticket page inline, just under this day's times.
      // Modified/middle clicks are left alone so the browser's own "open in a new
      // tab" still works, and the href keeps the link shareable.
      a.addEventListener("click", (ev) => {
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        openBooking(isOpen ? null : sc.bookingUrl);
      });
      times.appendChild(a);
    }
    group.appendChild(times);

    // The frame belongs to the day it was opened from, so the ticket page shows
    // up in context instead of taking over the page.
    const open = list.find((sc) => sc.bookingUrl === openBookingUrl);
    if (open) group.appendChild(buildBookingFrame(open));

    panel.appendChild(group);
  }
  return panel;
}

// ---- Inline booking ---------------------------------------------------------
// Re-render with a different (or no) screening open, then put focus back on the
// time that was clicked and bring the frame into view.
function openBooking(url) {
  openBookingUrl = url;
  renderMovieList();
  if (!url) return;
  const chip = movieListEl.querySelector(`.time[data-booking-url="${CSS.escape(url)}"]`);
  if (chip) chip.focus({ preventScroll: true });
  const frame = movieListEl.querySelector(".booking");
  if (frame) frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildBookingFrame(sc) {
  const box = document.createElement("div");
  box.className = "booking";

  const bar = document.createElement("div");
  bar.className = "booking-bar";

  const who = document.createElement("span");
  who.className = "who";
  who.appendChild(makeLogo(sc.icon, sc.providerName));
  const whoText = document.createElement("span");
  whoText.textContent = `${sc.providerName} · ${sc.day} · ${sc.hour}`;
  who.appendChild(whoText);
  bar.appendChild(who);

  const spacer = document.createElement("span");
  spacer.className = "spacer";
  bar.appendChild(spacer);

  // Escape hatch: a ticket page that misbehaves in a frame can still be opened
  // the old way.
  const out = document.createElement("a");
  out.href = sc.bookingUrl;
  out.target = "_blank";
  out.rel = "noopener";
  out.textContent = "פתיחה בלשונית";
  bar.appendChild(out);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "סגירת ההזמנה");
  close.addEventListener("click", () => openBooking(null));
  bar.appendChild(close);

  box.appendChild(bar);

  const frame = document.createElement("iframe");
  frame.src = sc.bookingUrl;
  frame.title = `הזמנת כרטיסים — ${sc.providerName}, ${sc.day} ${sc.hour}`;
  frame.allow = "payment";
  box.appendChild(frame);

  return box;
}

// ---- Live search ------------------------------------------------------------
searchEl.addEventListener("input", () => {
  query = searchEl.value;
  selectedKey = null;
  openBookingUrl = null;
  renderMovieList();
});

// ---- Load -------------------------------------------------------------------
// Read the pre-built JSON (refreshed daily by the GitHub Action). The shows are
// already merged, theater-tagged and sorted by the build script, so there is no
// fetching or merging to do here — just render.
async function load() {
  selectedKey = null;
  activeDay = "";
  openBookingUrl = null;
  daysEl.innerHTML = "";
  movieListEl.innerHTML = "";
  showNote('<span>טוען הקרנות</span><span class="skeleton-dot"></span>');

  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    providers = data.providers || [];
    allShows = data.shows || [];
    renderLegend();
    renderDays();
    renderMovieList();

    const errors = data.errors || [];
    if (errors.length) {
      const names = errors.map((e) => e.provider).join(", ");
      const banner = document.createElement("div");
      banner.className = "note error partial";
      banner.textContent = `חלק מהלוחות לא נטענו (${names}).`;
      movieListEl.before(banner);
    }
    searchEl.focus();
  } catch (err) {
    console.error(err);
    allShows = [];
    movieListEl.innerHTML = "";
    daysEl.innerHTML = "";
    showNote("לא הצלחנו לטעון את הלוח כרגע. רעננו את הדף כדי לנסות שוב.", true);
  }
}

load();
