// Movie-provider registry.
//
// A provider is any object shaped like:
//
//   {
//     id:   string,                 // stable, used for persistence
//     name: string,                 // display label (provider selector chip)
//     async fetchShows(): Show[]    // see the normalized shape below
//   }
//
// Normalized Show:
//   { key: string, name: string, screenings: Screening[] }
// Normalized Screening:
//   { ts: number, day: string, hour: string, bookingUrl: string }
//
// The UI (app.js) only ever sees this shape, so adding a new cinema means
// dropping a provider into the list below — no UI changes required. Other
// chains (Yes Planet, Lev, Rav-Chen…) just need their own module exposing the
// same interface.

import { createCinemaCityProvider } from "./cinema-city.js";

export const providers = [
  createCinemaCityProvider({
    id: "cc-galilot",
    name: "Cinema City · גלילות",
    theatreId: 1170,
  }),
  // Add more providers here. For other Cinema City branches, reuse the factory
  // with that branch's TheatreId, e.g.:
  //   createCinemaCityProvider({ id: "cc-rishon", name: "Cinema City · ראשון", theatreId: <id> }),
];

export function getProvider(id) {
  return providers.find((p) => p.id === id) || providers[0];
}
