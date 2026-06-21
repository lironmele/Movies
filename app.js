// Provider-agnostic UI: search, day filter, and the movie accordion.
// All cinema-specific logic lives behind the provider interface (registry.js);
// this file only ever works with the normalized Show/Screening shape.

import { providers, getProvider } from "./providers/registry.js";

const $ = (id) => document.getElementById(id);
const searchEl = $("search");
const providersEl = $("providers");
const eyebrowEl = $("eyebrow");
const daysEl = $("days");
const movieListEl = $("movieList");
const noteEl = $("note");

// ---- State ------------------------------------------------------------------
let provider = getProvider(localStorage.getItem("provider_id"));
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

// ---- Provider selector ------------------------------------------------------
function renderProviders() {
  // A lone provider needs no selector.
  if (providers.length < 2) { providersEl.style.display = "none"; return; }
  providersEl.style.display = "";
  providersEl.innerHTML = "";
  for (const p of providers) {
    const b = document.createElement("button");
    b.className = "provider-chip" + (p.id === provider.id ? " active" : "");
    b.textContent = p.name;
    b.addEventListener("click", () => {
      if (p.id === provider.id) return;
      provider = p;
      localStorage.setItem("provider_id", p.id);
      load();
    });
    providersEl.appendChild(b);
  }
}

// ---- Filtering --------------------------------------------------------------
function visibleShows() {
  const q = query.trim().toLowerCase();
  return allShows.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false;
    if (activeDay) return s.screenings.some((sc) => sc.day === activeDay);
    return true;
  });
}

function renderDays() {
  const days = new Map();
  for (const s of allShows)
    for (const sc of s.screenings)
      if (!days.has(sc.day) || sc.ts < days.get(sc.day)) days.set(sc.day, sc.ts);
  const ordered = [...days.entries()].sort((a, b) => a[1] - b[1]);

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
  for (const [day] of ordered) make(day, day);
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
      ? show.screenings.filter((sc) => sc.day === activeDay)
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

  const byDay = new Map();
  for (const sc of screenings) {
    if (!byDay.has(sc.day)) byDay.set(sc.day, []);
    byDay.get(sc.day).push(sc);
  }
  for (const [dayLabel, list] of byDay) {
    const group = document.createElement("div");
    group.className = "day-group";

    const dl = document.createElement("div");
    dl.className = "label";
    dl.textContent = dayLabel;
    group.appendChild(dl);

    const times = document.createElement("div");
    times.className = "times";
    for (const sc of list) {
      const a = document.createElement("a");
      a.className = "time";
      a.href = sc.bookingUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = sc.hour;
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
  eyebrowEl.textContent = provider.name;
  renderProviders();

  // Reset per-provider view state; days and movies differ between providers.
  selectedKey = null;
  activeDay = "";
  daysEl.innerHTML = "";
  movieListEl.innerHTML = "";
  showNote('<span>טוען הקרנות</span><span class="skeleton-dot"></span>');

  try {
    const shows = await provider.fetchShows();
    for (const s of shows) s.screenings.sort((a, b) => a.ts - b.ts);
    shows.sort((a, b) => a.name.localeCompare(b.name, "he"));
    allShows = shows;
    renderDays();
    renderMovieList();
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
