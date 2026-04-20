/**
 * Lightweight client-side preview calculation.
 * Used for immediate feedback as the user types — NOT authoritative.
 * The server calculation (POST /api/calculate) is the source of truth.
 *
 * Keeps in sync with backend/calculator.py.
 * PRD ref: NFR-01 (offline fallback), Solution Design §3.3
 */
import type { DayState, RateConfig, PayrollCodes, PayComponent, DayResult } from '../types';
import { getKmCredit, roundHrsEA, getShiftType } from './eaRules';
import { toMins, toHrs } from './dateUtils';

/** Default EA 2025 rates. PRD §5.1–5.7 */
export const DEFAULT_CONFIG: RateConfig = {
  base_rate: 49.81842,
  ot1: 1.5, ot2: 2.0,
  sat_rate: 1.5, sun_rate: 2.0, sat_ot: 2.0,
  ph_wkd: 1.5, ph_wke: 2.5,
  afternoon_rate: 4.84, night_rate: 5.69, early_rate: 4.84,
  add_loading: 5.69,
  wobod_rate: 2.0, wobod_min: 4,
};

export const DEFAULT_CODES: PayrollCodes = {
  base: '', ot1: '', ot2: '', sat: '', sun: '', sat_ot: '',
  ph_wkd: '', ph_wke: '', afternoon: '', night: '', early: '',
  add_load: '', wobod: '', liftup: '', ado: '', unassoc: '',
};

/**
 * Compute a preview pay result for a single day.
 * Returns null if the day is OFF or has no times entered.
 */
export function previewDay(
  day: DayState,
  cfg: RateConfig = DEFAULT_CONFIG,
  codes: PayrollCodes = DEFAULT_CODES,
  unassocAmt = 0,
): DayResult | null {
  const isSat = day.dow === 6;
  const isSun = day.dow === 0;
  const isPH = day.ph;
  const B = cfg.base_rate;

  if (day.diag === 'OFF') return null;

  if (day.diag === 'ADO') {
    if (day.isShortFortnight) {
      const adoPay = 8 * B;
      return {
        date: day.date, diag: 'ADO', day_type: 'ado',
        hours: 8, paid_hrs: 8, total_pay: round2(adoPay),
        components: [{ name: 'ADO — 8 hrs ordinary', ea: 'Cl. 120', code: codes.ado || '—', hrs: '8.00', rate: `$${B.toFixed(4)}/hr`, amount: round2(adoPay), cls: 'km-row' }],
        flags: ['ADO paid out — short fortnight.'],
      };
    }
    return {
      date: day.date, diag: 'ADO', day_type: 'ado',
      hours: 0, paid_hrs: 0, total_pay: 0,
      components: [],
      flags: ['ADO accruing — long fortnight.'],
    };
  }

  if (!day.aStart || !day.aEnd) return null;

  const components: PayComponent[] = [];
  const flags: string[] = [];

  let sMin = toMins(day.aStart)!;
  let eMin = toMins(day.aEnd)!;
  if (day.cm || eMin <= sMin) eMin += 1440;
  const actualHrs = toHrs(eMin - sMin);
  const ordHrs = Math.min(actualHrs, 8);
  const otHrs = Math.max(0, actualHrs - 8);
  const ot1h = Math.min(otHrs, 2);
  const ot2h = Math.max(0, otHrs - 2);

  // KM credit
  let kmCredited: number | null = null;
  let kmBonus = 0;
  let kmApplied = false;
  if (day.km > 0) {
    kmCredited = getKmCredit(day.km);
    if (kmCredited !== null && kmCredited > actualHrs) {
      kmBonus = kmCredited - actualHrs;
      kmApplied = true;
    }
  }

  const shiftType = getShiftType(sMin, eMin);
  const penHrs = shiftType && !isSat && !isSun && !isPH ? roundHrsEA(ordHrs) : 0;
  const penRate = shiftType === 'night' ? cfg.night_rate : shiftType === 'early' ? cfg.early_rate : cfg.afternoon_rate;
  const penAmt = penHrs * penRate;

  // Build components (simplified mirror of Python logic)
  if (day.wobod) {
    const wh = Math.max(actualHrs, cfg.wobod_min);
    components.push({ name: 'WOBOD', ea: 'Cl. 136', code: codes.wobod || '—', hrs: wh.toFixed(2), rate: `${cfg.wobod_rate}×`, amount: round2(wh * B * cfg.wobod_rate), cls: '' });
  } else if (isPH) {
    const r = (isSat || isSun) ? cfg.ph_wke : cfg.ph_wkd;
    const ph_hrs = Math.max(actualHrs, kmCredited ?? 0);
    components.push({ name: `PH (${r}×)`, ea: 'Cl. 31', code: codes.ph_wkd || '—', hrs: ph_hrs.toFixed(2), rate: `${r}×`, amount: round2(ph_hrs * B * r), cls: '' });
  } else if (isSun) {
    components.push({ name: 'Sunday', ea: 'Cl. 133/54', code: codes.sun || '—', hrs: ordHrs.toFixed(2), rate: `${cfg.sun_rate}×`, amount: round2(ordHrs * B * cfg.sun_rate), cls: '' });
    if (ot1h + ot2h > 0) components.push({ name: 'Sunday OT', ea: 'Cl. 140', code: codes.sun || '—', hrs: (ot1h + ot2h).toFixed(2), rate: `${cfg.sun_rate}×`, amount: round2((ot1h + ot2h) * B * cfg.sun_rate), cls: '' });
  } else if (isSat) {
    components.push({ name: 'Saturday', ea: 'Cl. 54/134', code: codes.sat || '—', hrs: ordHrs.toFixed(2), rate: `${cfg.sat_rate}×`, amount: round2(ordHrs * B * cfg.sat_rate), cls: '' });
    if (ot1h + ot2h > 0) components.push({ name: 'Saturday OT', ea: 'Cl. 140+Sch.4A', code: codes.sat_ot || '—', hrs: (ot1h + ot2h).toFixed(2), rate: `${cfg.sat_ot}×`, amount: round2((ot1h + ot2h) * B * cfg.sat_ot), cls: '' });
  } else {
    components.push({ name: 'Ordinary time', ea: 'Sch. 4A', code: codes.base || '—', hrs: ordHrs.toFixed(2), rate: `$${B.toFixed(4)}/hr`, amount: round2(ordHrs * B), cls: '' });
    if (ot1h > 0) components.push({ name: 'OT first 2 hrs', ea: 'Cl. 140.1', code: codes.ot1 || '—', hrs: ot1h.toFixed(2), rate: `${cfg.ot1}×`, amount: round2(ot1h * B * cfg.ot1), cls: '' });
    if (ot2h > 0) components.push({ name: 'OT beyond 2 hrs', ea: 'Cl. 140.1', code: codes.ot2 || '—', hrs: ot2h.toFixed(2), rate: `${cfg.ot2}×`, amount: round2(ot2h * B * cfg.ot2), cls: '' });
    if (penAmt > 0) components.push({ name: `${shiftType} shift penalty`, ea: 'Sch.4B / Cl. 134.3', code: '—', hrs: penHrs.toString(), rate: `$${penRate}/hr`, amount: round2(penAmt), cls: 'pen-row' });
  }

  if (kmApplied && kmBonus > 0) {
    const bRate = isSat ? cfg.sat_rate : isSun ? cfg.sun_rate : 1.0;
    components.push({ name: `KM credit (${day.km} km → ${kmCredited} hrs)`, ea: 'Cl. 146.4', code: codes.base || '—', hrs: kmBonus.toFixed(2), rate: 'ordinary', amount: round2(kmBonus * B * bRate), cls: 'km-row' });
    flags.push(`KM: bonus ${kmBonus.toFixed(2)} hrs.`);
  }

  if (otHrs > 0) flags.push(`Daily OT: ${otHrs.toFixed(2)} hrs.`);

  const total = round2(components.reduce((s, c) => s + c.amount, 0));
  const paidHrs = kmApplied ? Math.max(actualHrs, kmCredited ?? 0) : actualHrs;

  return {
    date: day.date, diag: day.diag,
    day_type: isPH ? 'ph' : isSun ? 'sunday' : isSat ? 'saturday' : 'weekday',
    hours: round2(actualHrs), paid_hrs: round2(paidHrs),
    total_pay: total, components, flags,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
