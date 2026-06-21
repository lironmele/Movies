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
