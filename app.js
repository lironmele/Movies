// Provider-agnostic UI: search, day filter, and the movie accordion.
// Every theater is shown at once: fetchAllShows() merges all providers into one
// movie list and tags each screening with the theater it belongs to, so this
// file only ever works with the normalized Show/Screening shape.

import { providers, fetchAllShows } from "./providers/registry.js";

const $ = (id) => document.getElementById(id);
const searchEl = $("search");
const legendEl = $("legend");
const daysEl = $("days");
const movieListEl = $("movieList");
const noteEl = $("note");

// ---- State ------------------------------------------------------------------
let allShows = [];
let selectedKey = null;
let query = "";
let activeDay = "";

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
      renderDays();
      renderMovieList();
    });
    daysEl.appendChild(b);
  };
  make("", "כל הימים");
  for (const [dayKey, { label }] of ordered) make(dayKey, label);
}

function renderMovieList() {
  const shows = visibleShows();
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
    name.textContent = show.name;
    btn.appendChild(name);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = screenings.length === 1 ? "הקרנה אחת" : `${screenings.length} הקרנות`;
    btn.appendChild(count);

    btn.addEventListener("click", () => {
      selectedKey = isActive ? null : show.key;
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
      const a = document.createElement("a");
      a.className = "time";
      a.href = sc.bookingUrl;
      a.target = "_blank";
      a.rel = "noopener";
      // The theater logo next to the time says which cinema this screening is at.
      a.title = sc.providerName;
      a.appendChild(makeLogo(sc.icon, sc.providerName));
      const hour = document.createElement("span");
      hour.textContent = sc.hour;
      a.appendChild(hour);
      times.appendChild(a);
    }
    group.appendChild(times);
    panel.appendChild(group);
  }
  return panel;
}

// ---- Live search ------------------------------------------------------------
searchEl.addEventListener("input", () => {
  query = searchEl.value;
  selectedKey = null;
  renderMovieList();
});

// ---- Load -------------------------------------------------------------------
async function load() {
  renderLegend();
  selectedKey = null;
  activeDay = "";
  daysEl.innerHTML = "";
  movieListEl.innerHTML = "";
  showNote('<span>טוען הקרנות</span><span class="skeleton-dot"></span>');

  try {
    const { shows, errors } = await fetchAllShows();
    // Only a total wipe-out is a hard failure; otherwise show what we have.
    if (!shows.length && errors.length) throw errors[0].reason;

    for (const s of shows) s.screenings.sort((a, b) => a.ts - b.ts);
    shows.sort((a, b) => a.name.localeCompare(b.name, "he"));
    allShows = shows;
    renderDays();
    renderMovieList();

    if (errors.length) {
      const names = errors.map((e) => e.provider.name).join(", ");
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
