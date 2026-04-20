/**
 * Date utility functions — ported from the original index.html JS.
 * PRD ref: Section 9.1 (DayState.date handling)
 */

export const DW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(d: Date): string {
  return `${DW[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateShort(d: Date): string {
  return `${DW[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
}

/** Snap a date to the nearest preceding Sunday. */
export function toSunday(s: string): string {
  const d = parseDate(s);
  const dow = d.getDay();
  if (dow === 0) return s;
  d.setDate(d.getDate() - dow);
  return dateStr(d);
}

/** Generate an array of 14 ISO date strings starting from the given Sunday. */
export function makeFortnight(start: string): string[] {
  const dates: string[] = [];
  const base = parseDate(start);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    dates.push(dateStr(d));
  }
  return dates;
}

export function toMins(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function toHrs(mins: number): number {
  return mins / 60;
}
