// Movie-provider registry.
//
// A provider is any object shaped like:
//
//   {
//     id:   string,                 // stable id
//     name: string,                 // display label (theater name)
//     short: string,                // branch name alone, e.g. "גלילות" — shown next
//                                   // to the logo so two branches of one chain
//                                   // (same logo) stay distinguishable
//     icon: string,                 // path to the theater's logo (assets/icons)
//     region: string,               // a `regions` id; the UI groups and filters by it
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
import { createPlanetProvider, RAV_HEN_BASE } from "./planet.js";
import { createCinemathequeProvider } from "./cinematheque.js";
import { createHotCinemaProvider } from "./hot-cinema.js";

// Regions, in display order. The theater picker groups by these and offers a
// one-tap "only this region" shortcut; regions with no theater are not shown.
export const regions = [
  { id: "tlv", name: "תל אביב והמרכז" },
  { id: "sharon", name: "השרון" },
  { id: "jlm", name: "ירושלים והסביבה" },
  { id: "north", name: "חיפה והצפון" },
  { id: "south", name: "הדרום" },
];

export const providers = [
  createCinemaCityProvider({
    id: "cc-galilot",
    name: "Cinema City · גלילות",
    short: "גלילות",
    icon: "assets/icons/cinema-city.png",
    region: "sharon",
    theatreId: 1170,
  }),
  createCinemaCityProvider({
    id: "cc-rishon",
    name: "Cinema City · ראשון לציון",
    short: "ראשון לציון",
    icon: "assets/icons/cinema-city.png",
    region: "tlv",
    theatreId: 1173,
  }),
  createCinemaCityProvider({
    id: "cc-jerusalem",
    name: "Cinema City · ירושלים",
    short: "ירושלים",
    icon: "assets/icons/cinema-city.png",
    region: "jlm",
    theatreId: 1174,
  }),
  createCinemaCityProvider({
    id: "cc-kfar-saba",
    name: "Cinema City · כפר סבא",
    short: "כפר סבא",
    icon: "assets/icons/cinema-city.png",
    region: "sharon",
    theatreId: 1175,
  }),
  createCinemaCityProvider({
    id: "cc-netanya",
    name: "Cinema City · נתניה",
    short: "נתניה",
    icon: "assets/icons/cinema-city.png",
    region: "sharon",
    theatreId: 1176,
  }),
  createCinemaCityProvider({
    id: "cc-hadera",
    name: "Cinema City · חדרה",
    short: "חדרה",
    icon: "assets/icons/cinema-city.png",
    region: "sharon",
    theatreId: 1350,
  }),
  createCinemaCityProvider({
    id: "cc-beer-sheva",
    name: "Cinema City · באר שבע",
    short: "באר שבע",
    icon: "assets/icons/cinema-city.png",
    region: "south",
    theatreId: 1178,
  }),
  createCinemaCityProvider({
    id: "cc-ashdod",
    name: "Cinema City · אשדוד",
    short: "אשדוד",
    icon: "assets/icons/cinema-city.png",
    region: "south",
    theatreId: 1181,
  }),
  createLevProvider({
    id: "lev-telaviv",
    name: "לב · תל אביב",
    short: "תל אביב",
    icon: "assets/icons/lev.png",
    region: "tlv",
    locationId: 1150,
  }),
  createLevProvider({
    id: "lev-ramat-hasharon",
    name: "לב · רמת השרון",
    short: "רמת השרון",
    icon: "assets/icons/lev.png",
    region: "sharon",
    locationId: 1162,
  }),
  createLevProvider({
    id: "lev-raanana",
    name: "לב · רעננה",
    short: "רעננה",
    icon: "assets/icons/lev.png",
    region: "sharon",
    locationId: 1161,
  }),
  createLevProvider({
    id: "lev-even-yehuda",
    name: "לב · אבן יהודה",
    short: "אבן יהודה",
    icon: "assets/icons/lev.png",
    region: "sharon",
    locationId: 1151,
  }),
  createLevProvider({
    id: "lev-daniel",
    name: "לב · דניאל",
    short: "דניאל",
    icon: "assets/icons/lev.png",
    region: "sharon",
    locationId: 1154,
  }),
  createLevProvider({
    id: "lev-smadar",
    name: "לב · סמדר",
    short: "סמדר",
    icon: "assets/icons/lev.png",
    region: "jlm",
    locationId: 1158,
  }),
  createLevProvider({
    id: "lev-omer",
    name: "לב · עומר",
    short: "עומר",
    icon: "assets/icons/lev.png",
    region: "south",
    locationId: 1155,
  }),
  createPlanetProvider({
    id: "planet-ayalon",
    name: "פלאנט · אילון",
    short: "אילון",
    icon: "assets/icons/planet-cinema.png",
    region: "tlv",
    cinemaId: 1025,
  }),
  createPlanetProvider({
    id: "planet-rishon",
    name: "פלאנט · ראשון לציון",
    short: "ראשון לציון",
    icon: "assets/icons/planet-cinema.png",
    region: "tlv",
    cinemaId: 1072,
  }),
  createPlanetProvider({
    id: "planet-jerusalem",
    name: "פלאנט · ירושלים",
    short: "ירושלים",
    icon: "assets/icons/planet-cinema.png",
    region: "jlm",
    cinemaId: 1073,
  }),
  createPlanetProvider({
    id: "planet-haifa",
    name: "פלאנט · חיפה",
    short: "חיפה",
    icon: "assets/icons/planet-cinema.png",
    region: "north",
    cinemaId: 1070,
  }),
  createPlanetProvider({
    id: "planet-zichron",
    name: "פלאנט · זכרון יעקב",
    short: "זכרון יעקב",
    icon: "assets/icons/planet-cinema.png",
    region: "north",
    cinemaId: 1075,
  }),
  createPlanetProvider({
    id: "planet-beer-sheva",
    name: "פלאנט · באר שבע",
    short: "באר שבע",
    icon: "assets/icons/planet-cinema.png",
    region: "south",
    cinemaId: 1074,
  }),
  createPlanetProvider({
    id: "rav-hen-givatayim",
    name: "רב חן · גבעתיים",
    short: "גבעתיים",
    icon: "assets/icons/rav-hen.png",
    region: "tlv",
    cinemaId: 1058,
    base: RAV_HEN_BASE,
  }),
  createPlanetProvider({
    id: "rav-hen-dizengoff",
    name: "רב חן · דיזנגוף",
    short: "דיזנגוף",
    icon: "assets/icons/rav-hen.png",
    region: "tlv",
    cinemaId: 1071,
    base: RAV_HEN_BASE,
  }),
  createCinemathequeProvider({
    id: "cinematheque-tlv",
    name: "סינמטק · תל אביב",
    short: "תל אביב",
    icon: "assets/icons/cinematheque-tlv.jpg",
    region: "tlv",
  }),
  createHotCinemaProvider({
    id: "hot-petah-tikva",
    name: "Hot Cinema · פתח תקווה",
    short: "פתח תקווה",
    icon: "assets/icons/hot-cinema.png",
    region: "tlv",
    theaterId: 14,
  }),
  createHotCinemaProvider({
    id: "hot-rehovot",
    name: "Hot Cinema · רחובות",
    short: "רחובות",
    icon: "assets/icons/hot-cinema.png",
    region: "tlv",
    theaterId: 17,
  }),
  createHotCinemaProvider({
    id: "hot-modiin",
    name: "Hot Cinema · מודיעין",
    short: "מודיעין",
    icon: "assets/icons/hot-cinema.png",
    region: "tlv",
    theaterId: 1,
  }),
  createHotCinemaProvider({
    id: "hot-kfar-saba",
    name: "Hot Cinema · כפר סבא",
    short: "כפר סבא",
    icon: "assets/icons/hot-cinema.png",
    region: "sharon",
    theaterId: 16,
  }),
  createHotCinemaProvider({
    id: "hot-haifa",
    name: "Hot Cinema · חיפה",
    short: "חיפה",
    icon: "assets/icons/hot-cinema.png",
    region: "north",
    theaterId: 9,
  }),
  createHotCinemaProvider({
    id: "hot-kiryon",
    name: "Hot Cinema · קריון",
    short: "קריון",
    icon: "assets/icons/hot-cinema.png",
    region: "north",
    theaterId: 2,
  }),
  createHotCinemaProvider({
    id: "hot-karmiel",
    name: "Hot Cinema · כרמיאל",
    short: "כרמיאל",
    icon: "assets/icons/hot-cinema.png",
    region: "north",
    theaterId: 15,
  }),
  createHotCinemaProvider({
    id: "hot-nahariya",
    name: "Hot Cinema · נהריה",
    short: "נהריה",
    icon: "assets/icons/hot-cinema.png",
    region: "north",
    theaterId: 6,
  }),
  createHotCinemaProvider({
    id: "hot-ashdod",
    name: "Hot Cinema · אשדוד",
    short: "אשדוד",
    icon: "assets/icons/hot-cinema.png",
    region: "south",
    theaterId: 5,
  }),
  createHotCinemaProvider({
    id: "hot-ashkelon",
    name: "Hot Cinema · אשקלון",
    short: "אשקלון",
    icon: "assets/icons/hot-cinema.png",
    region: "south",
    theaterId: 8,
  }),
  // Add more providers here. Every chain's factory takes that branch's id, so
  // a new branch is one more entry: Cinema City `theatreId` (the `TixTheatreId`
  // in the site's theater list), Lev `locationId` (../docs/lev-presentations-api.md
  // §7), Planet / Rav-Hen `cinemaId` (../docs/planet-cinema-api.md §2) and Hot
  // Cinema `theaterId` (../docs/hot-cinema-api.md).
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
