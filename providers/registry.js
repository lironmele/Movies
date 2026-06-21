// Movie-provider registry.
//
// A provider is any object shaped like:
//
//   {
//     id:   string,                 // stable id
//     name: string,                 // display label (theater name)
//     icon: string,                 // path to the theater's logo (assets/icons)
//     async fetchShows(): Show[]    // see the normalized shape below
//   }
//
// Normalized Show:
//   { key: string, name: string, screenings: Screening[] }
// Normalized Screening:
//   { ts: number, dayKey: string, day: string, hour: string, bookingUrl: string }
//   dayKey is the canonical "YYYY-MM-DD" used to group dates across theaters;
//   day is the display label both providers derive from it (see lib/day.js).
//
// The UI (app.js) never sees a single provider — it shows every theater at once
// via fetchAllShows(), which merges all providers' schedules into one list and
// tags each screening with the theater it belongs to. Adding a new cinema means
// dropping a provider into the list below; no UI changes required.

import { createCinemaCityProvider } from "./cinema-city.js";
import { createLevProvider } from "./lev.js";
import { createPlanetProvider } from "./planet.js";

export const providers = [
  createCinemaCityProvider({
    id: "cc-galilot",
    name: "Cinema City · גלילות",
    icon: "assets/icons/cinema-city.png",
    theatreId: 1170,
  }),
  createLevProvider({
    id: "lev-ramat-hasharon",
    name: "לב · רמת השרון",
    icon: "assets/icons/lev.png",
    locationId: 1162,
  }),
  createPlanetProvider({
    id: "planet-ayalon",
    name: "פלאנט · אילון",
    icon: "assets/icons/planet-cinema.png",
    cinemaId: 1025,
  }),
  // Add more providers here. For other Cinema City branches, reuse the factory
  // with that branch's TheatreId, e.g.:
  //   createCinemaCityProvider({ id: "cc-rishon", name: "Cinema City · ראשון", icon: "assets/icons/cinema-city.png", theatreId: <id> }),
  // For other Lev branches, reuse createLevProvider with that branch's locationId
  // (see ../docs/lev-presentations-api.md §7), e.g.:
  //   createLevProvider({ id: "lev-telaviv", name: "לב · תל אביב", icon: "assets/icons/lev.png", locationId: 1150 }),
  // For other Planet Cinema branches, reuse createPlanetProvider with that
  // branch's cinemaId (see ../docs/planet-cinema-api.md §2), e.g.:
  //   createPlanetProvider({ id: "planet-haifa", name: "פלאנט · חיפה", icon: "assets/icons/planet-cinema.png", cinemaId: 1070 }),
];

// Collapse near-identical titles so the same movie from two theaters merges into
// one row: trim, lowercase, drop punctuation/whitespace. Conservative on
// purpose — distinct titles never collide, near-misses simply stay separate.
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[\s–—\-_,.:'"!?()]+/g, "")
    .trim();
}

// Fetch every provider in parallel and merge them into a single movie list.
// Each screening is tagged with { providerId, providerName, icon } so the UI can
// show which theater it belongs to. Returns { shows, errors }; a provider that
// fails is reported in `errors` but never blocks the others.
export async function fetchAllShows() {
  const settled = await Promise.allSettled(
    providers.map(async (p) => ({ provider: p, shows: await p.fetchShows() }))
  );

  const merged = new Map();
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "rejected") {
      errors.push({ provider: providers[i], reason: r.reason });
      continue;
    }
    const { provider, shows } = r.value;
    for (const show of shows) {
      const key = normalizeName(show.name);
      if (!merged.has(key))
        merged.set(key, { key, name: show.name, screenings: [] });
      const target = merged.get(key);
      for (const sc of show.screenings) {
        target.screenings.push({
          ...sc,
          providerId: provider.id,
          providerName: provider.name,
          icon: provider.icon,
        });
      }
    }
  }

  return { shows: [...merged.values()], errors };
}
