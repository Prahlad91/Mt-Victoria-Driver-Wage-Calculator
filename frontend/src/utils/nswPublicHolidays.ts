/**
 * NSW Public Holidays — 2025, 2026, 2027
 * Source: https://www.nsw.gov.au/about-nsw/public-holidays
 *
 * Bank Holiday (first Monday of August) is intentionally excluded — it is
 * only observed by banks and financial institutions, not by Sydney Trains.
 *
 * Used to auto-populate the Public Holidays field in the Load Roster Line
 * section based on the fortnight date range.
 */
export interface NswPH {
  date: string   // YYYY-MM-DD
  name: string
}

export const NSW_PUBLIC_HOLIDAYS: NswPH[] = [
  // ── 2025 ──────────────────────────────────────────────────────────────────
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-27', name: 'Australia Day (substitute)' },  // 26 Jan falls on Sun
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-04-19', name: 'Easter Saturday' },
  { date: '2025-04-20', name: 'Easter Sunday' },
  { date: '2025-04-21', name: 'Easter Monday' },
  { date: '2025-04-25', name: 'Anzac Day' },
  { date: '2025-06-09', name: "King's Birthday" },
  { date: '2025-10-06', name: 'Labour Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Boxing Day' },

  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-26', name: 'Australia Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-04', name: 'Easter Saturday' },
  { date: '2026-04-05', name: 'Easter Sunday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-04-25', name: 'Anzac Day' },
  { date: '2026-04-27', name: 'Anzac Day (substitute)' },  // 25 Apr falls on Sat
  { date: '2026-06-08', name: "King's Birthday" },
  { date: '2026-10-05', name: 'Labour Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)' },

  // ── 2027 ──────────────────────────────────────────────────────────────────
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-01-26', name: 'Australia Day' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-03-27', name: 'Easter Saturday' },
  { date: '2027-03-28', name: 'Easter Sunday' },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-04-25', name: 'Anzac Day' },
  { date: '2027-04-26', name: 'Anzac Day (substitute)' },  // 25 Apr falls on Sun
  { date: '2027-06-14', name: "King's Birthday" },
  { date: '2027-10-04', name: 'Labour Day' },
  { date: '2027-12-25', name: 'Christmas Day' },
  { date: '2027-12-26', name: 'Boxing Day' },
  { date: '2027-12-27', name: 'Christmas (substitute)' },
  { date: '2027-12-28', name: 'Boxing Day (substitute)' },
]

/**
 * Returns NSW public holidays that fall within the 14-day fortnight
 * starting on `fnStart` (YYYY-MM-DD).
 */
export function getPhsForFortnight(fnStart: string): NswPH[] {
  if (!fnStart) return []
  const start = new Date(fnStart + 'T00:00:00')
  const end   = new Date(fnStart + 'T00:00:00')
  end.setDate(end.getDate() + 13)
  return NSW_PUBLIC_HOLIDAYS.filter(ph => {
    const d = new Date(ph.date + 'T00:00:00')
    return d >= start && d <= end
  })
}
