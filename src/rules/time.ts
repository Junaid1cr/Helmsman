import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/** Everything is stored UTC; windows and freezes are evaluated in this TZ. */
export const DEFAULT_TZ = 'Asia/Kolkata';

const TZ_ALIASES: Record<string, string> = {
  ist: 'Asia/Kolkata',
  utc: 'UTC',
  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  est: 'America/New_York',
  edt: 'America/New_York',
};

function resolveTz(token: string): string {
  return TZ_ALIASES[token.toLowerCase()] ?? token;
}

// Sun..Sat = 0..6, matching dayjs/Date.getDay().
const DAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Parse "Mon-Thu", "Mon,Wed,Fri", or "Mon-Thu,Sat" into a set of day indices. */
function parseDays(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const p = part.trim().toLowerCase();
    if (p.includes('-')) {
      const [aRaw, bRaw] = p.split('-').map((s) => s.trim());
      const start = DAY_INDEX[aRaw];
      const end = DAY_INDEX[bRaw];
      if (start === undefined || end === undefined) {
        throw new Error(`bad day range in window: "${part}"`);
      }
      // Inclusive, with wrap-around (e.g. Fri-Mon).
      let d = start;
      out.add(d);
      while (d !== end) {
        d = (d + 1) % 7;
        out.add(d);
      }
    } else {
      const d = DAY_INDEX[p];
      if (d === undefined) throw new Error(`bad day in window: "${part}"`);
      out.add(d);
    }
  }
  return out;
}

/** Parse "10:00-17:00" into minutes-of-day [start, end). */
function parseTimeRange(spec: string): { start: number; end: number } {
  const m = spec.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`bad time range in window: "${spec}"`);
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start >= end) throw new Error(`window start must be before end: "${spec}"`);
  return { start, end };
}

interface ParsedWindow {
  days: Set<number>;
  start: number;
  end: number;
  tz: string;
}

/** Parse one window spec, e.g. "Mon-Thu 10:00-17:00 IST" (TZ optional → default). */
export function parseWindow(spec: string): ParsedWindow {
  const tokens = spec.trim().split(/\s+/);
  if (tokens.length < 2) throw new Error(`bad window spec: "${spec}"`);
  const days = parseDays(tokens[0]);
  const { start, end } = parseTimeRange(tokens[1]);
  const tz = tokens[2] ? resolveTz(tokens[2]) : DEFAULT_TZ;
  return { days, start, end, tz };
}

/**
 * Is `at` within the allowed deploy window(s)? Multiple windows may be given
 * separated by ";". End time is exclusive.
 */
export function isWithinWindow(at: Date, windowsSpec: string): boolean {
  const specs = windowsSpec
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  return specs.some((spec) => {
    const w = parseWindow(spec);
    const local = dayjs(at).tz(w.tz);
    if (!w.days.has(local.day())) return false;
    const mins = local.hour() * 60 + local.minute();
    return mins >= w.start && mins < w.end;
  });
}

/**
 * If `at` falls inside any freeze range, return that range string, else null.
 * Ranges are "YYYY-MM-DD..YYYY-MM-DD" (inclusive) or a single "YYYY-MM-DD",
 * interpreted in `tz` from 00:00 of the start day to 24:00 of the end day.
 */
export function activeFreeze(
  at: Date,
  freezes: string[] | undefined,
  tz: string = DEFAULT_TZ,
): string | null {
  if (!freezes || freezes.length === 0) return null;
  const now = dayjs(at);

  for (const f of freezes) {
    const [aRaw, bRaw] = f.split('..').map((s) => s.trim());
    const startDay = dayjs.tz(aRaw, 'YYYY-MM-DD', tz).startOf('day');
    const endBase = bRaw ? dayjs.tz(bRaw, 'YYYY-MM-DD', tz) : dayjs.tz(aRaw, 'YYYY-MM-DD', tz);
    const endExclusive = endBase.startOf('day').add(1, 'day');

    if (!startDay.isValid() || !endBase.isValid()) {
      throw new Error(`bad freeze range: "${f}"`);
    }
    if (!now.isBefore(startDay) && now.isBefore(endExclusive)) {
      return f;
    }
  }
  return null;
}
