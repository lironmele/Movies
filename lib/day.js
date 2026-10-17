// Shared day formatting.
//
// Every provider stamps each screening with a canonical machine `dayKey`
// ("YYYY-MM-DD", the cinema's business date) and a display `day` derived from
// it via `dayLabel`. Because the label comes from this single function, the
// same date from two different theaters produces the *identical* string — so it
// groups into one day instead of splitting into near-duplicate groups.

const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const pad = (n) => String(n).padStart(2, "0");

// Numeric Y/M/D -> canonical "YYYY-MM-DD" (zero-padded so keys always match).
export function toDayKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "YYYY-MM-DD" -> "שבת 20/06/2026" (Hebrew weekday + DD/MM/YYYY).
export function dayLabel(dayKey) {
  const [yyyy, mm, dd] = dayKey.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd); // local midnight; getDay() is stable
  return `${HE_WEEKDAYS[d.getDay()]} ${pad(dd)}/${pad(mm)}/${yyyy}`;
}

// Israel wall-clock -> epoch millis, independent of the runner's time zone.
//
// Providers publish showtimes as local Israel times with no offset
// ("YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM:SS"). `new Date(str)` would read
// those in the *process's* zone — UTC on GitHub Actions — shifting every ts by
// Israel's offset (2–3h). Instead, treat the fields as UTC, then subtract
// Asia/Jerusalem's offset at that moment (looked up via Intl, so DST follows
// the tz database).
const IL_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem",
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// Asia/Jerusalem's UTC offset (millis) at epoch `ts`.
function israelOffset(ts) {
  const p = Object.fromEntries(IL_FMT.formatToParts(ts).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

export function israelTs(wallClock) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wallClock);
  if (!m) throw new Error(`Unrecognized Israel wall-clock time: ${wallClock}`);
  const [, y, mo, d, h, mi, s = "0"] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Two passes settle the offset when the wall-clock sits near a DST switch.
  const guess = asUtc - israelOffset(asUtc);
  return asUtc - israelOffset(guess);
}
