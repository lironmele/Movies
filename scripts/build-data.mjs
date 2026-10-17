// Daily data builder.
//
// Runs once per day in GitHub Actions (see ../.github/workflows/update-data.yml).
// It does exactly what the page used to do at runtime — fetch every provider and
// merge their schedules — but server-side, then writes the result to
// data/showtimes.json which the static page reads. The merge/tag logic lives in
// providers/registry.js and is shared; this script only adds the final sort the
// page expects and serializes the payload.

import { writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { providers, regions, fetchAllShows } from "../providers/registry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "data", "showtimes.json");

// In GitHub Actions, provider failures are printed as `::error::`
// annotations so each one shows up on the run summary. The message must have
// %, CR and LF escaped per the workflow-command format.
const inActions = process.env.GITHUB_ACTIONS === "true";
const escapeData = (s) =>
  s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

// Step outputs for the workflow (no-op locally, where GITHUB_OUTPUT is unset).
async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const { shows, errors } = await fetchAllShows();

  // Ordering done once here so the JSON is render-ready: screenings
  // chronological, movies by total number of screenings (most first), with the
  // Hebrew name as a stable tie-breaker.
  for (const s of shows) s.screenings.sort((a, b) => a.ts - b.ts);
  shows.sort(
    (a, b) =>
      b.screenings.length - a.screenings.length ||
      a.name.localeCompare(b.name, "he")
  );

  const errorList = errors.map((e) => ({
    id: e.provider.id,
    provider: e.provider.name,
    reason: String(e.reason?.message ?? e.reason),
  }));
  for (const e of errorList) {
    const msg = `${e.id} (${e.provider}): ${e.reason}`;
    if (inActions)
      console.log(`::error title=Provider failed::${escapeData(msg)}`);
    else console.error(`provider failed: ${msg}`);
  }

  // Never overwrite a good file with an empty one: if every provider failed,
  // fail the job and leave the previously committed data in place.
  if (!shows.length) {
    console.error("No shows fetched from any provider; refusing to overwrite data.");
    process.exit(1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    regions,
    providers: providers.map((p) => ({
      id: p.id, name: p.name, short: p.short, icon: p.icon, region: p.region,
    })),
    shows,
    errors: errorList.map(({ provider, reason }) => ({ provider, reason })),
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `Wrote ${shows.length} shows to data/showtimes.json (${errors.length} provider error(s)).`
  );
  // Tells the workflow the file is safe to commit even though we may exit
  // non-zero below.
  await setOutput("written", "true");

  // Partial data is still published (the working chains stay fresh), but any
  // failing provider fails the job so an outage can't sit unnoticed in CI.
  if (errors.length) {
    console.error(`${errors.length} provider(s) failed; exiting with status 1.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
