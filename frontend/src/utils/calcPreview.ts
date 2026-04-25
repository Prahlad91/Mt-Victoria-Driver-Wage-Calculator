/**
 * Lightweight client-side preview calculation.
 * Used for immediate feedback as the user types — NOT authoritative.
 * The server calculation (POST /api/calculate) is the source of truth.
 *
 * MUST stay in sync with backend/calculator.py (PRD §5.7).
 * PRD ref: NFR-01 (offline fallback), §5.7 (lift-up/layback)
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

  // Day-rate components
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

  // KM credit bonus
  if (kmApplied && kmBonus > 0) {
    const bRate = isSat ? cfg.sat_rate : isSun ? cfg.sun_rate : 1.0;
    components.push({ name: `KM credit (${day.km} km → ${kmCredited} hrs)`, ea: 'Cl. 146.4', code: codes.base || '—', hrs: kmBonus.toFixed(2), rate: 'ordinary', amount: round2(kmBonus * B * bRate), cls: 'km-row' });
    flags.push(`KM: bonus ${kmBonus.toFixed(2)} hrs.`);
  }

  // ─── Lift-up / Layback (PRD §5.7) — added in v3.6 ──────────────────────────────────
  if (!day.wobod) {
    const liftupGap = calcLiftupGap(day);
    const laybackGap = calcLaybackGap(day);
    if (liftupGap > 0) {
      addGapComponents(components, flags, liftupGap,
        'Lift-up / buildup (started before scheduled)', 'Cl. 131 / Cl. 140.1',
        actualHrs, B, cfg, codes, isSat, isSun, isPH);
    }
    if (laybackGap > 0) {
      addGapComponents(components, flags, laybackGap,
        'Layback / extend (finished after scheduled)', 'Cl. 131 / Cl. 140.1',
        actualHrs, B, cfg, codes, isSat, isSun, isPH);
    }
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

// ─── Lift-up / Layback helpers (mirror of backend) ─────────────────────────────────

function calcLiftupGap(day: DayState): number {
  if (!day.rStart || !day.aStart) return 0;
  const rs = toMins(day.rStart);
  const as = toMins(day.aStart);
  if (rs === null || as === null || as >= rs) return 0;
  return toHrs(rs - as);
}

function calcLaybackGap(day: DayState): number {
  if (!day.rEnd || !day.aEnd) return 0;
  let re = toMins(day.rEnd);
  let ae = toMins(day.aEnd);
  if (re === null || ae === null) return 0;
  if (day.cm) {
    re += 1440;
    ae += 1440;
  }
  return toHrs(Math.max(0, ae - re));
}

function addGapComponents(
  components: PayComponent[], flags: string[],
  gapHrs: number, label: string, eaRef: string,
  actualHrs: number, B: number, cfg: RateConfig, codes: PayrollCodes,
  isSat: boolean, isSun: boolean, isPH: boolean,
) {
  const ordRemainder = Math.max(0, 8 - (actualHrs - gapHrs));
  const gapOrd = Math.min(gapHrs, ordRemainder);
  const gapOt = Math.max(0, gapHrs - gapOrd);
  const gapOt1 = Math.min(gapOt, 2);
  const gapOt2 = Math.max(0, gapOt - 2);

  const ordRate = isPH ? (isSat || isSun ? cfg.ph_wke : cfg.ph_wkd)
    : isSun ? cfg.sun_rate : isSat ? cfg.sat_rate : 1.0;
  const ot1Rate = isPH ? (isSat || isSun ? cfg.ph_wke : cfg.ph_wkd)
    : isSun ? cfg.sun_rate : isSat ? cfg.sat_ot : cfg.ot1;
  const ot2Rate = isPH ? (isSat || isSun ? cfg.ph_wke : cfg.ph_wkd)
    : isSun ? cfg.sun_rate : isSat ? cfg.sat_ot : cfg.ot2;

  if (gapOrd > 0) {
    components.push({
      name: `${label} — ordinary rate (${gapOrd.toFixed(2)} hrs within 8-hr limit)`,
      ea: eaRef, code: codes.liftup || '—',
      hrs: gapOrd.toFixed(2), rate: ordRate === 1.0 ? 'ordinary' : `${ordRate}×`,
      amount: round2(gapOrd * B * ordRate), cls: 'pen-row',
    });
  }
  if (gapOt1 > 0) {
    components.push({
      name: `${label} — OT rate (first 2 hrs beyond 8)`,
      ea: eaRef, code: codes.liftup || '—',
      hrs: gapOt1.toFixed(2), rate: `${ot1Rate}×`,
      amount: round2(gapOt1 * B * ot1Rate), cls: 'pen-row',
    });
  }
  if (gapOt2 > 0) {
    components.push({
      name: `${label} — OT rate (beyond 2 hrs)`,
      ea: eaRef, code: codes.liftup || '—',
      hrs: gapOt2.toFixed(2), rate: `${ot2Rate}×`,
      amount: round2(gapOt2 * B * ot2Rate), cls: 'pen-row',
    });
  }
  flags.push(`${label}: ${gapHrs.toFixed(2)} hrs — ${gapOrd.toFixed(2)} ord, ${gapOt.toFixed(2)} OT.`);
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
