// Daily data builder.
//
// Runs once per day in GitHub Actions (see ../.github/workflows/update-data.yml).
// It does exactly what the page used to do at runtime — fetch every provider and
// merge their schedules — but server-side, then writes the result to
// data/showtimes.json which the static page reads. The merge/tag logic lives in
// providers/registry.js and is shared; this script only adds the final sort the
// page expects and serializes the payload.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { providers, fetchAllShows } from "../providers/registry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "data", "showtimes.json");

async function main() {
  const { shows, errors } = await fetchAllShows();

  // Same ordering the page applied on load, done once here so the JSON is
  // render-ready: screenings chronological, movies alphabetical (Hebrew).
  for (const s of shows) s.screenings.sort((a, b) => a.ts - b.ts);
  shows.sort((a, b) => a.name.localeCompare(b.name, "he"));

  for (const e of errors)
    console.error(`provider failed: ${e.provider.name}: ${e.reason}`);

  // Never overwrite a good file with an empty one: if every provider failed,
  // fail the job and leave the previously committed data in place.
  if (!shows.length) {
    console.error("No shows fetched from any provider; refusing to overwrite data.");
    process.exit(1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    providers: providers.map((p) => ({ id: p.id, name: p.name, icon: p.icon })),
    shows,
    errors: errors.map((e) => ({
      provider: e.provider.name,
      reason: String(e.reason?.message ?? e.reason),
    })),
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `Wrote ${shows.length} shows to data/showtimes.json (${errors.length} provider error(s)).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
