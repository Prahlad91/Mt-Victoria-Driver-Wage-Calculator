/**
 * EA 2025 rule helpers — used by calcPreview.ts and the KM table UI.
 * These are read-only lookups / rounding rules, not full calculation logic.
 * The authoritative calculation lives in backend/calculator.py.
 * PRD ref: Section 5
 */

/** KM credit bands — Cl. 146.4(a). PRD §5.5 / §10 */
const KM_BANDS: Array<{ min: number; max: number | null; credited: number | null; base?: number; inc?: number }> = [
  { min: 0,   max: 161,  credited: null },
  { min: 161, max: 193,  credited: 5.0  },
  { min: 193, max: 225,  credited: 6.0  },
  { min: 225, max: 257,  credited: 7.0  },
  { min: 257, max: 290,  credited: 8.0  },
  { min: 290, max: 322,  credited: 9.0  },
  { min: 322, max: 338,  credited: 10.0 },
  { min: 338, max: 354,  credited: 10.5 },
  { min: 354, max: 370,  credited: 11.0 },
  { min: 370, max: 386,  credited: 11.5 },
  { min: 386, max: 402,  credited: 12.0 },
  { min: 402, max: 418,  credited: 12.5 },
  { min: 418, max: 435,  credited: 13.0 },
  { min: 435, max: 451,  credited: 13.5 },
  { min: 451, max: 467,  credited: 14.0 },
  { min: 467, max: 483,  credited: 14.5 },
  { min: 483, max: 499,  credited: 15.0 },
  { min: 499, max: 515,  credited: 15.5 },
  { min: 515, max: 531,  credited: 16.0 },
  { min: 531, max: 547,  credited: 16.5 },
  { min: 547, max: 563,  credited: 17.0 },
  { min: 563, max: 579,  credited: 17.5 },
  { min: 579, max: 595,  credited: 18.0 },
  { min: 595, max: 612,  credited: 18.5 },
  { min: 612, max: 628,  credited: 19.0 },
  { min: 628, max: 644,  credited: 19.5 },
  { min: 644, max: null, credited: null, base: 19.5, inc: 0.5 },
];

/** Return KM-credited hours for a given distance. null = actual time (<161 km). */
export function getKmCredit(km: number): number | null {
  if (km <= 0) return null;
  for (const band of KM_BANDS) {
    if (band.max === null) {
      const extra = km - 644;
      const steps = Math.ceil(extra / 16);
      return (band.base ?? 19.5) + steps * (band.inc ?? 0.5);
    }
    if (km >= band.min && km < band.max) return band.credited;
  }
  return null;
}

/**
 * EA Cl. 134.3(b) rounding.
 * <30 min fraction → disregard. 30–59 min → round up to 1 full hour.
 */
export function roundHrsEA(hrs: number): number {
  const whole = Math.floor(hrs);
  const fracMins = (hrs - whole) * 60;
  return fracMins < 30 ? whole : whole + 1;
}

/** Return shift type based on sign-on time. PRD §5.4 */
export function getShiftType(sMin: number, eMin: number): 'night' | 'early' | 'afternoon' | null {
  if (sMin >= 1080 || sMin < 240) return 'night';      // 18:00–03:59
  if (sMin >= 240 && sMin <= 330) return 'early';       // 04:00–05:30
  if (sMin < 1080 && eMin > 1080) return 'afternoon';   // before 18:00 → after 18:00
  return null;
}

/** Leave categories as defined in PRD §5.9 */
export const LEAVE_CATS: Array<{ code: string; label: string; eaRef: string }> = [
  { code: 'none', label: '— Work shift (no leave) —',                       eaRef: '' },
  { code: 'SL',   label: 'Sick leave',                                       eaRef: 'Cl. 30.4' },
  { code: 'CL',   label: "Carer's leave",                                   eaRef: 'Cl. 30.7(b)(ix)' },
  { code: 'AL',   label: 'Annual leave',                                     eaRef: 'Cl. 30.1/30.2' },
  { code: 'PHNW', label: 'PH not worked',                                    eaRef: 'Cl. 31.7' },
  { code: 'PHW',  label: 'PH worked',                                        eaRef: 'Cl. 31.5' },
  { code: 'BL',   label: 'Bereavement/compassionate leave',                  eaRef: 'Cl. 30.8(k)(iv)' },
  { code: 'JD',   label: 'Jury duty',                                        eaRef: 'Cl. 30.8(g)' },
  { code: 'PD',   label: 'Picnic day',                                       eaRef: 'Cl. 32.1' },
  { code: 'LWOP', label: 'Leave without pay',                                eaRef: '—' },
];
