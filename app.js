// Provider-agnostic UI: the "my cinemas" picker, search, day filter, the movie
// accordion, and the inline booking frame.
// The merge + theater-tagging happens server-side once a day
// (scripts/build-data.mjs); this page just reads the pre-built
// data/showtimes.json, so it only ever works with the normalized Show/Screening
// shape plus the per-screening theater tag.
//
// Built to stay usable with many theaters: the viewer picks "my cinemas" once
// (by region, or theater by theater), the list shows one day at a time starting
// today, collapsed rows cap their logos, and an opened movie groups by region,
// folds long theater lists and can switch to a chronological view.

const DATA_URL = "data/showtimes.json";

const $ = (id) => document.getElementById(id);
const searchEl = $("search");
const eyebrowEl = $("eyebrow");
const pickerEl = $("picker");
const onboardEl = $("onboard");
const daysEl = $("days");
const movieListEl = $("movieList");
const noteEl = $("note");
const toastEl = $("toast");

// ---- State ------------------------------------------------------------------
let allShows = [];
let providers = []; // { id, name, short, icon, region } list, read from the data file
let providerOrder = new Map(); // providerId -> index, so theaters always list in registry order
let regions = []; // { id, name } that have at least one theater, in display order

// The viewer's theaters, remembered per browser. An empty set means "all
// theaters"; `chose` records whether they ever picked, which decides whether
// the first-visit region prompt is shown.
const MINE_KEY = "myTheaters";
const CHOSE_KEY = "choseTheaters";
let mine = new Set(readJSON(MINE_KEY, []));
let chose = readJSON(CHOSE_KEY, false);

let selectedKey = null;
let query = "";
let activeDay = "";
let view = "theater"; // expanded movie layout: "theater" | "time"
let pickerOpen = false;
let pickerQuery = "";
let openRegions = new Set(); // regions unfolded in the picker
let unfolded = new Set(); // movie keys whose long theater list was unfolded
let flashPicker = false;
// bookingUrl of the screening whose ticket page is open inline (one at a time).
let openBookingUrl = null;

// A movie's theater list folds after this many lines.
const FOLD_AFTER = 6;

function showNote(html, isError) {
  noteEl.innerHTML = html;
  noteEl.className = "note" + (isError ? " error" : "");
  noteEl.hidden = false;
}
function hideNote() { noteEl.hidden = true; }

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (toastEl.hidden = true), 2400);
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveMine() {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...mine]));
    localStorage.setItem(CHOSE_KEY, JSON.stringify(chose));
  } catch {}
}

// Earlier versions stored the theaters switched *off*; carry that choice over.
function migrateHidden() {
  let old;
  try { old = JSON.parse(localStorage.getItem("hiddenTheaters")); } catch {}
  if (!Array.isArray(old)) return;
  try { localStorage.removeItem("hiddenTheaters"); } catch {}
  if (!old.length || chose) return;
  const hidden = new Set(old);
  mine = new Set(providers.map((p) => p.id).filter((id) => !hidden.has(id)));
  chose = true;
  saveMine();
}

// ---- Theaters ---------------------------------------------------------------
const isOn = (id) => !mine.size || mine.has(id);
const onIds = () => new Set(providers.map((p) => p.id).filter(isOn));
const byOrder = (a, b) => providerOrder.get(a) - providerOrder.get(b);
const providerOf = (id) => providers[providerOrder.get(id)];
const regionName = (id) => regions.find((r) => r.id === id)?.name ?? "";

// Apply a new selection. Every theater is stored as "all" (so new theaters show
// up by default); an empty selection is refused rather than showing nothing.
function setMine(ids, message) {
  if (!ids.size) {
    toast("צריך להשאיר לפחות קולנוע אחד");
    return renderAll();
  }
  mine = ids.size === providers.length ? new Set() : ids;
  chose = true;
  saveMine();
  selectedKey = null;
  openBookingUrl = null;
  if (message) {
    toast(message);
    flashPicker = true;
  }
  renderAll();
}

function showAll() {
  pickerOpen = false;
  setMine(new Set(providers.map((p) => p.id)), `מציגים עכשיו את כל ${providers.length} בתי הקולנוע`);
}

function chooseRegion(regionId) {
  const ids = new Set(providers.filter((p) => p.region === regionId).map((p) => p.id));
  pickerOpen = false;
  // "ב" absorbs a leading definite article: השרון -> בשרון.
  const where = "ב" + regionName(regionId).replace(/^ה/, "");
  setMine(ids, `מציגים ${ids.size === 1 ? "קולנוע אחד" : `${ids.size} בתי קולנוע`} ${where}`);
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

// Overlapping logos, one per chain (branches share a logo), capped at `max`.
function logoStack(ids, max) {
  const icons = new Map();
  for (const id of ids) {
    const p = providerOf(id);
    if (!icons.has(p.icon)) icons.set(p.icon, []);
    icons.get(p.icon).push(p.name);
  }
  const stack = document.createElement("span");
  stack.className = "stack";
  const all = [...icons];
  for (const [icon, names] of all.slice(0, max)) stack.appendChild(makeLogo(icon, names.join(", ")));
  if (all.length > max) {
    const more = document.createElement("span");
    more.className = "more";
    more.textContent = `+${all.length - max}`;
    stack.appendChild(more);
  }
  return stack;
}

// ---- "My cinemas" picker ----------------------------------------------------
function renderPicker() {
  pickerEl.innerHTML = "";
  const on = [...onIds()].sort(byOrder);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "picker-btn" + (flashPicker ? " flash" : "");
  flashPicker = false;
  btn.setAttribute("aria-expanded", String(pickerOpen));
  btn.appendChild(logoStack(on, 4));
  const text = document.createElement("span");
  const title = document.createElement("span");
  const sub = document.createElement("span");
  sub.className = "sub";
  if (!mine.size) {
    title.textContent = "כל בתי הקולנוע ";
    sub.textContent = providers.length === 1 ? "" : `${providers.length} בתי קולנוע`;
  } else {
    title.textContent = (on.length === 1 ? providerOf(on[0]).name : `${on.length} בתי קולנוע`) + " ";
    const regs = regions.filter((r) => on.some((id) => providerOf(id).region === r.id));
    sub.textContent = regs.length > 2 ? `${regs.length} אזורים` : regs.map((r) => r.name).join(" · ");
  }
  text.append(title, sub);
  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = pickerOpen ? "▲" : "▼";
  btn.append(text, chev);
  btn.addEventListener("click", () => {
    if (pickerOpen) pickerOpen = false;
    else {
      // Unfold the regions the viewer already picked from; with "all", start folded.
      openRegions = new Set(mine.size ? on.map((id) => providerOf(id).region) : []);
      pickerOpen = true;
    }
    renderAll();
  });
  pickerEl.appendChild(btn);

  eyebrowEl.textContent = mine.size ? "הקולנועים שלי" : "כל בתי הקולנוע";
  if (pickerOpen) pickerEl.appendChild(buildPickerSheet());
}

function buildPickerSheet() {
  const sheet = document.createElement("div");
  sheet.className = "picker-sheet";

  const head = document.createElement("div");
  head.className = "picker-head";
  const input = document.createElement("input");
  input.id = "pickerSearch";
  input.type = "text";
  input.placeholder = "חיפוש לפי עיר או רשת…";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "חיפוש קולנוע");
  input.value = pickerQuery;
  input.addEventListener("input", () => {
    pickerQuery = input.value;
    const next = buildPickerList();
    list.replaceWith(next);
    list = next;
    watchScroll(list);
  });
  head.appendChild(input);
  if (regions.length > 1) {
    const quick = document.createElement("div");
    quick.className = "quick";
    for (const r of regions) quick.appendChild(regionButton(r, "רק " + r.name));
    head.appendChild(quick);
  }

  let list = buildPickerList();

  const foot = document.createElement("div");
  foot.className = "picker-foot";
  const left = document.createElement("div");
  left.className = "left";
  const tally = document.createElement("span");
  tally.className = "tally";
  const n = onIds().size;
  tally.textContent = n === providers.length
    ? `כל ${n} בתי הקולנוע מוצגים`
    : `נבחרו ${n} מתוך ${providers.length}`;
  left.appendChild(tally);
  if (mine.size) {
    const all = document.createElement("button");
    all.type = "button";
    all.className = "link";
    all.textContent = "הצגת כל בתי הקולנוע";
    all.addEventListener("click", showAll);
    left.appendChild(all);
  }
  const done = document.createElement("button");
  done.type = "button";
  done.className = "done";
  done.textContent = "סיום";
  done.addEventListener("click", () => {
    pickerOpen = false;
    pickerQuery = "";
    renderAll();
  });
  foot.append(left, done);

  sheet.append(head, list, foot);
  requestAnimationFrame(() => watchScroll(list));
  return sheet;
}

// Regions are folded rows, so every region fits without scrolling; a region
// unfolds to its theaters. While searching, every matching region is unfolded.
function buildPickerList() {
  const wrap = document.createElement("div");
  wrap.className = "picker-scroll";
  const body = document.createElement("div");
  body.className = "picker-body";
  const q = pickerQuery.trim().toLowerCase();
  const grouped = regions.length > 1;

  for (const r of regions) {
    const theaters = providers.filter(
      (p) => p.region === r.id && (!q || p.name.toLowerCase().includes(q))
    );
    if (!theaters.length) continue;
    const open = !grouped || !!q || openRegions.has(r.id);
    const onCount = theaters.filter((p) => isOn(p.id)).length;

    const sec = document.createElement("div");
    sec.className = "p-region" + (open ? " open" : "");
    if (grouped) {
      const head = document.createElement("div");
      head.className = "p-region-head";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "p-region-toggle";
      toggle.setAttribute("aria-expanded", String(open));
      const caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = "◀";
      const name = document.createElement("span");
      name.textContent = r.name;
      const count = document.createElement("span");
      count.className = "cnt" + (mine.size && onCount ? " some" : "");
      count.textContent = `${onCount}/${theaters.length}`;
      toggle.append(caret, name, count);
      toggle.addEventListener("click", () => {
        if (open) openRegions.delete(r.id); else openRegions.add(r.id);
        renderAll();
      });
      const all = document.createElement("button");
      all.type = "button";
      all.className = "p-region-all";
      all.textContent = onCount === theaters.length ? "ניקוי" : "בחירת כולם";
      all.addEventListener("click", () => {
        const ids = onIds();
        for (const p of theaters) {
          if (onCount === theaters.length) ids.delete(p.id); else ids.add(p.id);
        }
        openRegions.add(r.id);
        setMine(ids);
      });
      head.append(toggle, all);
      sec.appendChild(head);
    }

    if (open) {
      const grid = document.createElement("div");
      grid.className = "p-grid";
      for (const p of theaters) {
        const on = isOn(p.id);
        const label = document.createElement("label");
        label.className = "p-item" + (on ? " on" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "theater-" + p.id;
        cb.checked = on;
        cb.addEventListener("change", () => {
          const ids = onIds();
          if (cb.checked) ids.add(p.id); else ids.delete(p.id);
          setMine(ids);
        });
        const nm = document.createElement("span");
        nm.className = "nm";
        nm.textContent = p.name;
        label.append(cb, makeLogo(p.icon, p.name), nm);
        grid.appendChild(label);
      }
      sec.appendChild(grid);
    }
    body.appendChild(sec);
  }
  if (!body.children.length) {
    const none = document.createElement("div");
    none.className = "note";
    none.textContent = `אין קולנוע שתואם ל“${pickerQuery.trim()}”.`;
    body.appendChild(none);
  }
  wrap.appendChild(body);
  return wrap;
}

// Show a "more below" fade only while the list overflows and isn't scrolled to
// the end.
function watchScroll(wrap) {
  const body = wrap.querySelector(".picker-body");
  if (!body) return;
  let cue = wrap.querySelector(".scroll-cue");
  const update = () => {
    const more = body.scrollHeight - body.scrollTop - body.clientHeight > 8;
    if (more && !cue) {
      cue = document.createElement("div");
      cue.className = "scroll-cue";
      cue.textContent = "גללו לעוד ▼";
      wrap.appendChild(cue);
    } else if (!more && cue) {
      cue.remove();
      cue = null;
    }
  };
  body.onscroll = update;
  update();
}

function regionButton(r, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => chooseRegion(r.id));
  return b;
}

// First visit: one tap to a region instead of switching theaters one by one.
function renderOnboard() {
  onboardEl.innerHTML = "";
  if (chose || pickerOpen || regions.length < 2) return;
  const card = document.createElement("section");
  card.className = "onboard";
  card.setAttribute("aria-label", "בחירת אזור");
  const h = document.createElement("h2");
  h.textContent = "איפה אתם רואים סרטים?";
  const p = document.createElement("p");
  p.textContent = "בחרו אזור ונציג רק את הקולנועים שם. אפשר לשנות בכל רגע.";
  const quick = document.createElement("div");
  quick.className = "quick";
  for (const r of regions) quick.appendChild(regionButton(r, r.name));
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "link";
  skip.textContent = `לא עכשיו, הציגו את כל ${providers.length} בתי הקולנוע`;
  skip.addEventListener("click", showAll);
  card.append(h, p, quick, skip);
  onboardEl.appendChild(card);
}

// ---- Filtering --------------------------------------------------------------
// A movie's screenings at the viewer's theaters on the active day.
function shownScreenings(show) {
  return show.screenings.filter((sc) => isOn(sc.providerId) && sc.dayKey === activeDay);
}

function visibleShows() {
  const q = query.trim().toLowerCase();
  return allShows
    .filter((s) => (!q || s.name.toLowerCase().includes(q)) && shownScreenings(s).length > 0)
    .sort((a, b) =>
      shownScreenings(b).length - shownScreenings(a).length || a.name.localeCompare(b.name, "he")
    );
}

// "YYYY-MM-DD" for the viewer's today (+ offset days), to match the
// screenings' dayKey.
function dayKeyFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const todayKey = () => dayKeyFromToday(0);

// Days with at least one screening at the viewer's theaters, from today on.
function availableDays() {
  const today = todayKey();
  const days = new Map();
  for (const s of allShows)
    for (const sc of s.screenings) {
      if (!isOn(sc.providerId) || sc.dayKey < today) continue;
      const cur = days.get(sc.dayKey);
      if (!cur || sc.ts < cur.ts) days.set(sc.dayKey, { ts: sc.ts, label: sc.day });
    }
  return [...days.entries()].sort((a, b) => a[1].ts - b[1].ts);
}

function renderDays() {
  const days = availableDays();
  // Start on the first day with screenings (normally today), and fall back to it
  // when the chosen day has nothing at the viewer's theaters.
  if (!days.some(([k]) => k === activeDay)) activeDay = days[0]?.[0] ?? "";

  const today = todayKey();
  const tomorrow = dayKeyFromToday(1);

  daysEl.innerHTML = "";
  for (const [dayKey, { label }] of days) {
    // label is "שבת 20/06/2026": show "היום"/"מחר"/the weekday, then DD/MM.
    const [weekday, date] = label.split(" ");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day-chip" + (activeDay === dayKey ? " active" : "");
    b.textContent = dayKey === today ? "היום" : dayKey === tomorrow ? "מחר" : weekday;
    const small = document.createElement("small");
    small.textContent = date.slice(0, 5);
    b.appendChild(small);
    b.addEventListener("click", () => {
      activeDay = dayKey;
      openBookingUrl = null;
      renderDays();
      renderMovieList();
    });
    daysEl.appendChild(b);
  }
}

// ---- Movie list -------------------------------------------------------------
function renderMovieList() {
  const shows = visibleShows();
  movieListEl.innerHTML = "";

  if (!shows.length) {
    showNote(query.trim()
      ? `אין סרט שתואם ל“${query.trim()}”. נסו שם אחר.`
      : activeDay
      ? "אין הקרנות ביום הזה בקולנועים שבחרתם."
      : "אין הקרנות קרובות בקולנועים שבחרתם.");
    return;
  }
  hideNote();

  const now = Date.now();
  for (const show of shows) {
    const isActive = show.key === selectedKey;
    const screenings = shownScreenings(show);
    const ids = [...new Set(screenings.map((sc) => sc.providerId))].sort(byOrder);

    const row = document.createElement("div");
    row.className = "movie-row" + (isActive ? " active" : "");

    const btn = document.createElement("button");
    btn.className = "movie-item";
    btn.setAttribute("aria-expanded", String(isActive));

    const name = document.createElement("span");
    name.className = "title";
    name.textContent = show.name;
    btn.appendChild(name);

    // Right-hand meta: the next showing, a capped stack of chain logos, and how
    // many of the viewer's theaters show it.
    const meta = document.createElement("span");
    meta.className = "meta";
    const upcoming = screenings.find((sc) => sc.ts >= now);
    if (upcoming) {
      const next = document.createElement("span");
      next.className = "next";
      next.textContent = "הבאה ";
      const b = document.createElement("b");
      b.textContent = upcoming.hour;
      next.appendChild(b);
      meta.appendChild(next);
    }
    meta.appendChild(logoStack(ids, 3));
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = ids.length === 1 ? "קולנוע אחד" : `${ids.length} קולנועים`;
    count.title = ids.map((id) => providerOf(id).name).join("\n");
    meta.appendChild(count);
    btn.appendChild(meta);

    btn.addEventListener("click", () => {
      selectedKey = isActive ? null : show.key;
      openBookingUrl = null;
      renderMovieList();
    });
    row.appendChild(btn);

    if (isActive) row.appendChild(buildShowtimesPanel(show, screenings));
    movieListEl.appendChild(row);
  }
}

function buildShowtimesPanel(show, screenings) {
  const panel = document.createElement("div");
  panel.className = "movie-panel";

  // Toolbar: the day, and a switch between "by theater" and "by time".
  const bar = document.createElement("div");
  bar.className = "panel-bar";
  const day = document.createElement("span");
  day.className = "hint";
  day.textContent = screenings[0].day;
  const seg = document.createElement("div");
  seg.className = "seg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "סידור ההקרנות");
  for (const [value, label] of [["theater", "לפי קולנוע"], ["time", "לפי שעה"]]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = view === value ? "on" : "";
    b.setAttribute("aria-pressed", String(view === value));
    b.textContent = label;
    b.addEventListener("click", () => {
      view = value;
      renderMovieList();
    });
    seg.appendChild(b);
  }
  bar.append(day, seg);
  panel.appendChild(bar);

  if (view === "time") {
    // Chronological, split by part of day; each time carries its theater.
    const slots = [["בוקר", 0, 12], ["צהריים", 12, 17], ["ערב", 17, 21], ["לילה", 21, 24]];
    for (const [label, from, to] of slots) {
      const list = screenings.filter((sc) => {
        const h = Number(sc.hour.slice(0, 2));
        return h >= from && h < to;
      });
      if (!list.length) continue;
      const group = document.createElement("div");
      group.className = "slot";
      const l = document.createElement("div");
      l.className = "label";
      l.textContent = label;
      const times = document.createElement("div");
      times.className = "times";
      for (const sc of list) times.appendChild(timeChip(sc, true));
      group.append(l, times);
      appendBookingIfOpen(group, list);
      panel.appendChild(group);
    }
    return panel;
  }

  // By theater: one line per theater, headed by its logo and branch name, under
  // region headers when there is more than one region. Long lists fold.
  const byTheater = new Map();
  for (const sc of screenings) {
    if (!byTheater.has(sc.providerId)) byTheater.set(sc.providerId, []);
    byTheater.get(sc.providerId).push(sc);
  }
  const regionOrder = (id) => regions.findIndex((r) => r.id === providerOf(id)?.region);
  const lines = [...byTheater.entries()]
    .sort((a, b) => regionOrder(a[0]) - regionOrder(b[0]) || byOrder(a[0], b[0]));
  // Keep the theater whose ticket page is open visible even when folded.
  const openIdx = lines.findIndex(([, list]) => list.some((sc) => sc.bookingUrl === openBookingUrl));
  const isUnfolded = unfolded.has(show.key) || openIdx >= FOLD_AFTER;
  const shown = isUnfolded ? lines : lines.slice(0, FOLD_AFTER);
  const multiRegion = new Set(lines.map(([id]) => providerOf(id)?.region)).size > 1;

  let lastRegion, block;
  for (const [providerId, list] of shown) {
    const region = providerOf(providerId)?.region;
    if (!block || region !== lastRegion) {
      block = document.createElement("div");
      block.className = "region-block";
      if (multiRegion && region) {
        const label = document.createElement("div");
        label.className = "region-label";
        label.textContent = regionName(region);
        block.appendChild(label);
      }
      panel.appendChild(block);
      lastRegion = region;
    }
    block.appendChild(theaterLine(providerId, list));
    appendBookingIfOpen(block, list);
  }

  if (lines.length > FOLD_AFTER) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "show-more";
    more.textContent = isUnfolded ? "הצגת פחות" : `הצגת עוד ${lines.length - FOLD_AFTER} בתי קולנוע`;
    more.addEventListener("click", () => {
      if (isUnfolded) {
        unfolded.delete(show.key);
        openBookingUrl = null;
      } else unfolded.add(show.key);
      renderMovieList();
    });
    panel.appendChild(more);
  }
  return panel;
}

function theaterLine(providerId, list) {
  const p = providerOf(providerId);
  const line = document.createElement("div");
  line.className = "theater-line";
  const head = document.createElement("div");
  head.className = "theater";
  head.title = list[0].providerName;
  head.appendChild(makeLogo(list[0].icon, list[0].providerName));
  const branch = document.createElement("span");
  branch.textContent = p?.short || list[0].providerName;
  head.appendChild(branch);
  const times = document.createElement("div");
  times.className = "times";
  for (const sc of list) times.appendChild(timeChip(sc, false));
  line.append(head, times);
  return line;
}

function timeChip(sc, withTheater) {
  const isOpen = sc.bookingUrl === openBookingUrl;
  const past = sc.ts < Date.now();
  const a = document.createElement("a");
  a.className = "time" + (isOpen ? " open" : "") + (past ? " past" : "");
  a.href = sc.bookingUrl;
  a.rel = "noopener";
  a.dataset.bookingUrl = sc.bookingUrl;
  a.setAttribute("aria-expanded", String(isOpen));
  a.title = past ? `${sc.providerName} · ההקרנה כבר התחילה` : sc.providerName;
  a.textContent = sc.hour;
  if (withTheater) {
    a.appendChild(makeLogo(sc.icon, sc.providerName));
    const where = document.createElement("span");
    where.className = "where";
    where.textContent = providerOf(sc.providerId)?.short || sc.providerName;
    a.appendChild(where);
  }
  // A plain click opens the ticket page inline, right under this time's line.
  // Modified/middle clicks are left alone so the browser's own "open in a new
  // tab" still works, and the href keeps the link shareable.
  a.addEventListener("click", (ev) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    openBooking(isOpen ? null : sc.bookingUrl);
  });
  return a;
}

// The frame belongs to the line (or part of day) it was opened from, so the
// ticket page shows up in context instead of taking over the page.
function appendBookingIfOpen(container, list) {
  const open = list.find((sc) => sc.bookingUrl === openBookingUrl);
  if (open) container.appendChild(buildBookingFrame(open));
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

// ---- Render -----------------------------------------------------------------
function renderAll() {
  // Keep the picker list's scroll position across a re-render (e.g. a checkbox).
  const scroll = pickerEl.querySelector(".picker-body")?.scrollTop;
  renderPicker();
  renderOnboard();
  renderDays();
  renderMovieList();
  const list = pickerEl.querySelector(".picker-scroll");
  if (list) {
    if (scroll) list.querySelector(".picker-body").scrollTop = scroll;
    watchScroll(list);
  }
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
    providerOrder = new Map(providers.map((p, i) => [p.id, i]));
    // Only regions that have a theater. A theater without a known region lands
    // in a catch-all group so it can still be picked.
    const known = data.regions || [];
    regions = known.filter((r) => providers.some((p) => p.region === r.id));
    if (providers.some((p) => !known.some((r) => r.id === p.region))) {
      regions.push({ id: "other", name: "אזורים נוספים" });
      for (const p of providers) if (!known.some((r) => r.id === p.region)) p.region = "other";
    }
    migrateHidden();
    // Forget saved ids of theaters that no longer exist.
    mine = new Set([...mine].filter((id) => providerOrder.has(id)));
    allShows = data.shows || [];
    renderAll();

    const errors = data.errors || [];
    if (errors.length) {
      const names = errors.map((e) => e.provider).join(", ");
      const banner = document.createElement("div");
      banner.className = "note error partial";
      banner.textContent = `חלק מהלוחות לא נטענו (${names}).`;
      movieListEl.before(banner);
    }
    if (chose) searchEl.focus();
  } catch (err) {
    console.error(err);
    allShows = [];
    movieListEl.innerHTML = "";
    daysEl.innerHTML = "";
    showNote("לא הצלחנו לטעון את הלוח כרגע. רעננו את הדף כדי לנסות שוב.", true);
  }
}

load();
