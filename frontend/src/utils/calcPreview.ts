/**
 * Lightweight client-side preview calculation.
 * Used for immediate feedback as the user types — NOT authoritative.
 * The server calculation (POST /api/calculate) is the source of truth.
 *
 * MUST stay in sync with backend/calculator.py (PRD §5.7).
 * PRD ref: NFR-01 (offline fallback), §5.7 (lift-up/layback)
 *
 * v3.10 — effective-window pay calculation per PRD §5.7 / FR-02-F.
 *   When day.claimLiftupLayback is true (default) AND scheduled times exist:
 *     effective_start = min(actual_start, scheduled_start)
 *     effective_end   = max(actual_end,   scheduled_end)
 *     workedHrs       = (effective_end - effective_start) / 60
 *   When false: workedHrs = (actual_end - actual_start) / 60.
 *   Lift-up/layback are emitted as INFORMATIONAL FLAGS only — they're
 *   already baked into workedHrs. Replaces the v3.6-v3.9 gap-component
 *   approach which double-counted lift-up minutes.
 */
import type { DayState, RateConfig, PayrollCodes, PayComponent, DayResult } from '../types';
import { getKmCredit, roundHrsEA, getShiftType } from './eaRules';
import { toMins, toHrs } from './dateUtils';

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
 * Resolve the effective window for hours/OT calc per PRD §5.7.
 * Returns: { aS, aE, effS, effE, liftupHrs, laybackHrs, claimActive }
 *   aS/aE  - actual sign-on/off in minutes (used for shift penalty class)
 *   effS/effE - effective window in minutes (used for hours/OT)
 *   liftup/layback - informational flag durations
 *   claimActive - true iff the effective window expanded beyond actual
 */
function resolveWindow(day: DayState): {
  aS: number; aE: number; effS: number; effE: number;
  liftupHrs: number; laybackHrs: number; claimActive: boolean;
} | null {
  const aS = toMins(day.aStart);
  let aE = toMins(day.aEnd);
  if (aS === null || aE === null) return null;
  if (day.cm || aE <= aS) aE += 1440;

  // WOBOD ignores the toggle (no scheduled time on a book-off day)
  if (day.wobod) return { aS, aE, effS: aS, effE: aE, liftupHrs: 0, laybackHrs: 0, claimActive: false };

  // claim disabled OR no scheduled times → use actual
  if (!day.claimLiftupLayback || !day.rStart || !day.rEnd) {
    return { aS, aE, effS: aS, effE: aE, liftupHrs: 0, laybackHrs: 0, claimActive: false };
  }

  const rS = toMins(day.rStart);
  let rE = toMins(day.rEnd);
  if (rS === null || rE === null) {
    return { aS, aE, effS: aS, effE: aE, liftupHrs: 0, laybackHrs: 0, claimActive: false };
  }
  if (day.cm || rE <= rS) rE += 1440;

  const effS = Math.min(aS, rS);
  const effE = Math.max(aE, rE);
  const liftupHrs = toHrs(Math.max(0, rS - aS));
  const laybackHrs = toHrs(Math.max(0, aE - rE));
  return { aS, aE, effS, effE, liftupHrs, laybackHrs, claimActive: true };
}

/** Compute a preview pay result for a single day. */
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

  // ─── Leave (PRD §5.9) ─────────────────────────────────────────────────────
  if (day.leaveCat && day.leaveCat !== 'none') {
    return previewLeave(day, cfg);
  }

  if (!day.aStart || !day.aEnd) return null;

  const win = resolveWindow(day);
  if (!win) return null;

  const components: PayComponent[] = [];
  const flags: string[] = [];

  const actualHrs = toHrs(win.aE - win.aS);          // physical on-duty time
  const workedHrs = toHrs(win.effE - win.effS);      // pays at this duration
  const ordHrs = Math.min(workedHrs, 8);
  const otHrs = Math.max(0, workedHrs - 8);
  const ot1h = Math.min(otHrs, 2);
  const ot2h = Math.max(0, otHrs - 2);

  // KM credit
  let kmCredited: number | null = null;
  let kmBonus = 0;
  let kmApplied = false;
  if (day.km > 0) {
    kmCredited = getKmCredit(day.km);
    if (kmCredited !== null && kmCredited > workedHrs) {
      kmBonus = kmCredited - workedHrs;
      kmApplied = true;
    }
  }

  // Shift penalty class — uses ACTUAL sign-on (win.aS, win.aE), not effective
  // window. Penalty hours apply to ordHrs (which is from the effective window).
  const shiftType = getShiftType(win.aS, win.aE);
  const penHrs = shiftType && !isSat && !isSun && !isPH ? roundHrsEA(ordHrs) : 0;
  const penRate = shiftType === 'night' ? cfg.night_rate : shiftType === 'early' ? cfg.early_rate : cfg.afternoon_rate;
  const penAmt = penHrs * penRate;

  // Day-rate components
  if (day.wobod) {
    const wh = Math.max(actualHrs, cfg.wobod_min);
    components.push({ name: 'WOBOD', ea: 'Cl. 136', code: codes.wobod || '—', hrs: wh.toFixed(2), rate: `${cfg.wobod_rate}×`, amount: round2(wh * B * cfg.wobod_rate), cls: '' });
  } else if (isPH) {
    const r = (isSat || isSun) ? cfg.ph_wke : cfg.ph_wkd;
    const phHrs = Math.max(workedHrs, kmCredited ?? 0);
    components.push({ name: `PH (${r}×)`, ea: 'Cl. 31', code: codes.ph_wkd || '—', hrs: phHrs.toFixed(2), rate: `${r}×`, amount: round2(phHrs * B * r), cls: '' });
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

  // KM credit bonus
  if (kmApplied && kmBonus > 0) {
    const bRate = isSat ? cfg.sat_rate : isSun ? cfg.sun_rate : 1.0;
    components.push({ name: `KM credit (${day.km} km → ${kmCredited} hrs)`, ea: 'Cl. 146.4', code: codes.base || '—', hrs: kmBonus.toFixed(2), rate: 'ordinary', amount: round2(kmBonus * B * bRate), cls: 'km-row' });
    flags.push(`KM: bonus ${kmBonus.toFixed(2)} hrs.`);
  }

  // ─── Lift-up / Layback informational flags (v3.10) ──────────────────────────
  // The effective-window approach means lift-up/layback are ALREADY part of
  // workedHrs. We emit them as flags only, never as separate pay components.
  if (win.claimActive) {
    if (win.liftupHrs > 0) {
      flags.push(`Lift-up: ${win.liftupHrs.toFixed(2)} hrs before scheduled (${day.rStart} ← ${day.aStart}) — included in window.`);
    }
    if (win.laybackHrs > 0) {
      flags.push(`Layback: ${win.laybackHrs.toFixed(2)} hrs after scheduled (${day.rEnd} → ${day.aEnd}) — included in window.`);
    }
    if (win.liftupHrs === 0 && win.laybackHrs === 0 && day.rStart && day.aStart !== day.rStart) {
      flags.push('Scheduled-hours guarantee applied (actual narrower than scheduled).');
    }
  } else if (day.rStart && day.aStart && (day.aStart !== day.rStart || day.aEnd !== day.rEnd) && !day.wobod) {
    flags.push('Lift-up/layback claim disabled — paid on actual times only.');
  }

  if (otHrs > 0) flags.push(`Daily OT: ${otHrs.toFixed(2)} hrs.`);

  const total = round2(components.reduce((s, c) => s + c.amount, 0));
  const paidHrs = kmApplied ? Math.max(workedHrs, kmCredited ?? 0) : workedHrs;

  return {
    date: day.date, diag: day.diag,
    day_type: isPH ? 'ph' : isSun ? 'sunday' : isSat ? 'saturday' : 'weekday',
    hours: round2(workedHrs), paid_hrs: round2(paidHrs),
    total_pay: total, components, flags,
  };
}

// ─── Leave preview (mirror of backend _compute_leave) ──────────────────────────────

function previewLeave(day: DayState, cfg: RateConfig): DayResult {
  const B = cfg.base_rate;
  const cat = day.leaveCat;
  const rHrs = day.rHrs || 8.0;

  const leaveMap: Record<string, [number, number, string, string]> = {
    SL:   [rHrs, B, 'Sick leave — ordinary rate',          'Cl. 30.4'],
    CL:   [rHrs, B, "Carer's leave — base rate",          'Cl. 30.7(b)(ix)'],
    BL:   [rHrs, B, 'Bereavement leave — base rate',       'Cl. 30.8(k)(iv)'],
    JD:   [rHrs, B, 'Jury duty — ordinary pay',            'Cl. 30.8(g)'],
    LWOP: [0,    0, 'Leave without pay',                    '—'],
    RDO:  [0,    0, 'Roster day off (RDO)',                 '—'],
    PHNW: [8,    B, 'Public holiday not worked — 8 hrs',    'Cl. 31.7'],
    PD:   [8,    B, 'Picnic day — 8 hrs ordinary',          'Cl. 32.1'],
  };

  if (cat in leaveMap) {
    const [hrs, rate, name, ea] = leaveMap[cat];
    const amount = round2(hrs * rate);
    const comps: PayComponent[] = amount > 0
      ? [{ name, ea, code: '—', hrs: hrs.toFixed(2), rate: `$${rate.toFixed(4)}/hr`, amount, cls: '' }]
      : [];
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: hrs, paid_hrs: hrs, total_pay: amount,
      components: comps, flags: [`${cat}: ${name} (${ea}).`],
    };
  }

  if (cat === 'AL') {
    const base = 8 * B;
    const loading = base * 0.20;
    const comps: PayComponent[] = [
      { name: 'Annual leave — 8 hrs ordinary',                 ea: 'Cl. 30.1',         code: '—', hrs: '8.00', rate: `$${B.toFixed(4)}/hr`,  amount: round2(base),    cls: '' },
      { name: 'Annual leave loading — 20% (shiftworker)',     ea: 'Cl. 30.2(a)(ii)',  code: '—', hrs: '8.00', rate: '20% of ordinary',     amount: round2(loading), cls: 'pen-row' },
    ];
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: 8, paid_hrs: 8, total_pay: round2(base + loading),
      components: comps, flags: ['AL: 8 hrs ordinary + 20% loading.'],
    };
  }

  if (cat === 'PHW') {
    const loading = rHrs * B * 1.5;
    const addDay = 8 * B;
    const comps: PayComponent[] = [
      { name: 'PHW — 150% loading on hrs worked',     ea: 'Cl. 31.5(a)', code: '—', hrs: rHrs.toFixed(2), rate: '1.5× ordinary',           amount: round2(loading), cls: '' },
      { name: 'PHW — additional day pay (ordinary)',   ea: 'Cl. 31.5(b)', code: '—', hrs: '8.00',          rate: `$${B.toFixed(4)}/hr`,    amount: round2(addDay),  cls: '' },
    ];
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: rHrs, paid_hrs: rHrs, total_pay: round2(loading + addDay),
      components: comps, flags: ['PHW: 150% loading + additional 8 hr day pay.'],
    };
  }

  return {
    date: day.date, diag: day.diag, day_type: 'leave',
    hours: 0, paid_hrs: 0, total_pay: 0, components: [], flags: [`Unknown leave: ${cat}`],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
