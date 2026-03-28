const MONTH_NAMES: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join("|");

function pad2(n: number): string {
  return n >= 10 ? String(n) : `0${n}`;
}

function monthFromToken(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\.$/, "");
  return MONTH_NAMES[key] ?? null;
}

function formatFull(m: number, d: number, y: number): string {
  return `${pad2(m)}/${pad2(d)}/${y}`;
}

function formatMonthYear(m: number, y: number): string {
  return `${pad2(m)}/${y}`;
}

/**
 * Parses a wide variety of date strings and normalizes to:
 * - `mm/dd/yyyy` when day, month, and year are known
 * - `mm/yyyy` when only month and year
 * - `yyyy` when only year
 * - the original trimmed string if nothing could be parsed
 */
export function formatDateString(input: string | null | undefined): string {
  if (input == null) return "";
  const raw = String(input).trim();
  if (!raw) return "";

  // Year only (4 digits)
  if (/^\d{4}$/.test(raw)) {
    return raw;
  }

  // ISO full date yyyy-mm-dd
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1) {
      return formatFull(mo, d, y);
    }
  }

  // yyyy-mm (month + year, no day)
  m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && y >= 1) {
      return formatMonthYear(mo, y);
    }
  }

  // mm/dd/yyyy or m/d/yyyy (US order)
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    const y = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1) {
      return formatFull(mo, d, y);
    }
  }

  // m/yyyy or mm/yyyy (month + year)
  m = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    const y = Number(m[2]);
    if (mo >= 1 && mo <= 12 && y >= 1) {
      return formatMonthYear(mo, y);
    }
  }

  // "January 12, 1924" / "Jan 12 1924" / "January 12 1924"
  const reMonthDayYear = new RegExp(
    `^(${MONTH_PATTERN})\\s+(\\d{1,2}),?\\s+(\\d{4})$`,
    "i"
  );
  m = raw.match(reMonthDayYear);
  if (m) {
    const mo = monthFromToken(m[1]!);
    const d = Number(m[2]);
    const y = Number(m[3]);
    if (mo != null && d >= 1 && d <= 31 && y >= 1) {
      return formatFull(mo, d, y);
    }
  }

  // "12 January 1924" / "12 Jan, 1924"
  const reDayMonthYear = new RegExp(
    `^(\\d{1,2})\\s+(${MONTH_PATTERN}),?\\s+(\\d{4})$`,
    "i"
  );
  m = raw.match(reDayMonthYear);
  if (m) {
    const d = Number(m[1]);
    const mo = monthFromToken(m[2]!);
    const y = Number(m[3]);
    if (mo != null && d >= 1 && d <= 31 && y >= 1) {
      return formatFull(mo, d, y);
    }
  }

  // "January 1924" / "Jan 1924"
  const reMonthYear = new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{4})$`, "i");
  m = raw.match(reMonthYear);
  if (m) {
    const mo = monthFromToken(m[1]!);
    const y = Number(m[2]);
    if (mo != null && y >= 1) {
      return formatMonthYear(mo, y);
    }
  }

  // Fallback: Date.parse (locale-dependent; best-effort for remaining shapes)
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const mo = dt.getMonth() + 1;
      const d = dt.getDate();
      if (y >= 1 && y <= 9999) {
        return formatFull(mo, d, y);
      }
    }
  }

  return raw;
}
