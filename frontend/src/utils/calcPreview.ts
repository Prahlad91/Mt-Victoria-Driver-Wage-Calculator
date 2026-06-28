/**
 * Lightweight client-side preview calculation.
 * Used for immediate per-day feedback as the user types — NOT authoritative.
 * The server calculation (POST /api/calculate) is the source of truth.
 *
 * MUST stay in sync with backend/calculator.py.
 * PRD ref: NFR-01 (offline fallback), §5.7 (lift-up/layback)
 *
 * v3.11 — corrected to match real payslip output:
 *   - WOBOD per Cl. 140.4 + 140.7 (preview is approximate per-day; the
 *     fortnight WOBOD-shift counter resolves authoritatively at server)
 *   - Afternoon detection per Cl. 134.1(a): ordinary time spans 18:00
 *   - 2dp hours rounding before multiply
 *   - Auto-detect non-overlap shift swap → suppress claim with warning
 */
import type { DayState, RateConfig, PayrollCodes, PayComponent, DayResult, AssocChart } from '../types';
import { getKmCredit, roundHrsEA } from './eaRules';
import { toMins, toHrs } from './dateUtils';

export const DEFAULT_CONFIG: RateConfig = {
  base_rate: 49.81842,
  ot1: 1.5, ot2: 2.0,
  sat_rate: 1.5, sun_rate: 2.0, sat_ot: 2.0,
  ph_wkd: 1.5, ph_wke: 2.5,
  afternoon_rate: 4.84, night_rate: 5.69, early_rate: 4.84,
  add_loading: 5.69,
  exp_over_10h_rate: 14.55,  // Sch.4B Item 12 / Cl. 143.5
  wobod_rate: 2.0, wobod_min: 0,
};

export const DEFAULT_CODES: PayrollCodes = {
  base: '1001', ot1: '1026', ot2: '1110',
  sat: '1064', sun: '1076', sat_ot: '1027',
  ph_wkd: '5042', ph_wke: '1010',
  afternoon: '1485', night: '1487', early: '1483',
  add_load: '1470',
  exp_over_10h: '1496',  // Sch.4B Item 12 / Cl. 143.5
  wobod: '1059', liftup: '', ado: '1462', unassoc: '',
  km: '1454',   // Assoc Wrk Time (Mileage) — Cl. 157.1(b) / Cl. 146.4
};

function r2(n: number): number { return Math.round(n * 100) / 100; }
function r2Hrs(n: number): number { return Math.round(n * 100) / 100; }

// ─── Window resolution with auto-detect non-overlap ─────────────────────────
function resolveWindow(day: DayState): {
  aS: number; aE: number; effS: number; effE: number;
  workedHrs: number; actualHrs: number;
  liftupHrs: number; laybackHrs: number;
  claimActive: boolean;
} | null {
  const aS = toMins(day.aStart);
  let aE = toMins(day.aEnd);
  if (aS === null || aE === null) return null;
  if (day.cm || aE <= aS) aE += 1440;
  const actualHrs = toHrs(aE - aS);

  const base = {
    aS, aE, effS: aS, effE: aE,
    workedHrs: actualHrs, actualHrs,
    liftupHrs: 0, laybackHrs: 0,
    claimActive: false,
  };

  if (day.wobod) return base;
  if (!day.rStart || !day.rEnd) return base;

  const rS = toMins(day.rStart);
  let rE = toMins(day.rEnd);
  if (rS === null || rE === null) return base;
  if (rE <= rS) rE += 1440;  // cm only describes actual times; scheduled cross-midnight is rE < rS

  if (!day.claimLiftupLayback) return base;

  const effS = Math.min(aS, rS);
  const effE = Math.max(aE, rE);
  return {
    ...base,
    effS, effE,
    workedHrs: toHrs(effE - effS),
    liftupHrs: toHrs(Math.max(0, rS - aS)),
    laybackHrs: toHrs(Math.max(0, aE - rE)),
    claimActive: true,
  };
}

// ─── Shift class (Cl. 134.1) — uses ACTUAL sign-on ──────────────────────
// v3.11 bug fix: was triggering on aE>1080 (actual sign-off after 18:00).
// Correct rule: ordinary time (first 8h) must span 18:00.
function getShiftClass(aS: number): 'night' | 'early' | 'afternoon' | null {
  const s = aS % 1440;
  if (s >= 1080 || s < 240) return 'night';
  if (s >= 240 && s <= 330) return 'early';
  if (s >= 600 && s < 1080) return 'afternoon';
  return null;
}

function addLoadingEligible(aS: number, dow: number, isPh: boolean): boolean {
  const s = aS % 1440;
  return !isPh && dow >= 1 && dow <= 5 && s >= 61 && s <= 239;
}

// ─── Per-day preview ──────────────────────────────────────────────
export function previewDay(
  day: DayState,
  cfg: RateConfig = DEFAULT_CONFIG,
  codes: PayrollCodes = DEFAULT_CODES,
  _unassocAmt = 0,
  assocChart: AssocChart = {},
): DayResult | null {
  const isSat = day.dow === 6;
  const isSun = day.dow === 0;
  const isPH = day.ph;
  const B = cfg.base_rate;

  if (day.diag === 'OFF') return null;
  if (day.diag === 'ADO') {
    return {
      date: day.date, diag: 'ADO', day_type: 'ado',
      hours: 0, paid_hrs: 0, total_pay: 0,
      components: [], flags: ['ADO day — fortnight ±4hr adjustment applied at fortnight level.'],
    };
  }

  if (day.leaveCat && day.leaveCat !== 'none' && day.leaveCat !== 'PDWP') return previewLeave(day, cfg, codes);
  if (!day.aStart || !day.aEnd) return null;

  const win = resolveWindow(day);
  if (!win) return null;

  const components: PayComponent[] = [];
  const flags: string[] = [];
  const actualHrs = r2Hrs(win.actualHrs);
  const workedHrs = r2Hrs(win.workedHrs);

  if (win.claimActive) {
    if (win.liftupHrs > 0) flags.push(`Lift-up: ${win.liftupHrs.toFixed(2)} hrs before scheduled (Cl. 131).`);
    if (win.laybackHrs > 0) flags.push(`Layback: ${win.laybackHrs.toFixed(2)} hrs after scheduled (Cl. 131).`);
  }

  const km = day.km;
  const kmCredited = km > 0 ? getKmCredit(km) : null;

  // ─── WOBOD (Cl. 140.4 + 140.7) ──────────────────────────────────
  if (day.wobod) {
    let primaryPct: number, primaryClause: string, primaryName: string, primaryCode: string;
    if (isSun) { primaryPct = 250; primaryClause = 'Cl. 140.4(d)'; primaryCode = '1110'; primaryName = 'Overtime @ 250%'; }
    else if (isSat) { primaryPct = 200; primaryClause = 'Cl. 140.4(c)'; primaryCode = '1110'; primaryName = 'Overtime @ 200%'; }
    else { primaryPct = 150; primaryClause = 'Cl. 140.4(a)'; primaryCode = '1100'; primaryName = 'Overtime @ 150%* (preview, fortnight counter applies)'; }
    const primaryRate = B * primaryPct / 100;
    const addlRate = B * 0.5;
    const wh = actualHrs;
    components.push({
      name: primaryName, ea: primaryClause, code: primaryCode,
      hrs: `${wh.toFixed(2)} hrs`, rate: `$${primaryRate.toFixed(5)}/hr`,
      amount: r2(wh * primaryRate), cls: '', date: day.date,
    });
    components.push({
      name: 'WOBOD — Loading @ 50%', ea: 'Cl. 140.7', code: codes.wobod || '1059',
      hrs: `${wh.toFixed(2)} hrs`, rate: `$${addlRate.toFixed(5)}/hr`,
      amount: r2(wh * addlRate), cls: '', date: day.date,
    });
    // 1454 build-up applies to WOBOD days too — Cl. 157.1(b) / Cl. 146.4
    const wChartEntry  = assocChart[day.diagNum || ''];
    const wUnAssocHrs  = wChartEntry ? wChartEntry.unAssocMins   / 60 : 0;
    const wAssocPayHrs = wChartEntry ? wChartEntry.assocPaymentMins / 60 : 0;
    const wDistPay     = kmCredited ?? 0;
    const wTotalCredit = wUnAssocHrs + wAssocPayHrs + wDistPay;
    const wSchedHrs    = (day.rHrs && day.rHrs > 0) ? day.rHrs : wh;
    const wBuildUp     = (wChartEntry?.buildUpMins && wChartEntry.buildUpMins > 0)
      ? r2Hrs(wChartEntry.buildUpMins / 60)
      : r2Hrs(Math.max(0, wTotalCredit - wSchedHrs));
    if (wBuildUp > 0) {
      components.push({
        name: `Assoc Wrk Time (Mileage) — ${km.toFixed(0)} km: `
            + `un-assoc ${wUnAssocHrs.toFixed(2)}h + assoc ${wAssocPayHrs.toFixed(2)}h`
            + ` + dist ${wDistPay.toFixed(2)}h = ${wTotalCredit.toFixed(2)}h`,
        ea: 'Cl. 157.1(b) / Cl. 146.4', code: codes.km || '1454',
        hrs: `${wBuildUp.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
        amount: r2(wBuildUp * B), cls: 'km-row', date: day.date,
      });
      flags.push(
        `1454: un-assoc ${wUnAssocHrs.toFixed(2)}h + assoc ${wAssocPayHrs.toFixed(2)}h`
        + ` + dist ${wDistPay.toFixed(2)}h = ${wTotalCredit.toFixed(2)}h`
        + ` vs sched ${wSchedHrs.toFixed(2)}h → build-up +${wBuildUp.toFixed(2)}h.`
      );
    }
    const total = r2(components.reduce((s, c) => s + c.amount, 0));
    flags.push(`WOBOD: ${primaryPct}% primary (Cl. 140.4) + 50% loading (Cl. 140.7) = ${primaryPct + 50}% combined.`);
    return {
      date: day.date, diag: day.diag,
      day_type: isPH ? 'ph' : isSun ? 'sunday' : isSat ? 'saturday' : 'weekday',
      hours: wh, paid_hrs: wh, total_pay: total, components, flags,
    };
  }

  // ─── Non-WOBOD ─────────────────────────────────────────────────
  const ordH = r2Hrs(Math.min(workedHrs, 8));
  const otH = r2Hrs(Math.max(0, workedHrs - 8));
  // Cl. 78.3: first 3 hours of daily OT at 1.5×, beyond that at 2.0×.
  // (Fixed v3.19 — was incorrectly using a 2-hour boundary.)
  const ot1h = r2Hrs(Math.min(otH, 3));
  const ot2h = r2Hrs(Math.max(0, otH - 3));

  if (isPH) {
    const loadingPct = isSat || isSun ? 1.5 : 0.5;
    const loadingRate = B * loadingPct;
    const phH = r2Hrs(Math.max(workedHrs, kmCredited || 0));
    components.push({
      name: 'Ordinary Hours (PH worked, base)', ea: 'Sch. 4A', code: codes.base || '1001',
      hrs: `${phH.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
      amount: r2(phH * B), cls: '', date: day.date, pool_to_ordinary: true,
    });
    components.push({
      name: `PH worked loading (+${(loadingPct * 100).toFixed(0)}%)`,
      ea: 'Cl. 31.5(a)',
      code: isSat || isSun ? (codes.ph_wke || '1010') : (codes.ph_wkd || '5042'),
      hrs: `${phH.toFixed(2)} hrs`, rate: `$${loadingRate.toFixed(5)}/hr`,
      amount: r2(phH * loadingRate), cls: '', date: day.date,
    });
  } else if (isSun) {
    components.push({
      name: 'Ordinary Hours (Sunday, base)', ea: 'Sch. 4A', code: codes.base || '1001',
      hrs: `${ordH.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
      amount: r2(ordH * B), cls: '', date: day.date, pool_to_ordinary: true,
    });
    components.push({
      name: 'Loading @ 100% Sunday', ea: 'Cl. 54.2', code: codes.sun || '',
      hrs: `${ordH.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
      amount: r2(ordH * B), cls: '', date: day.date,
    });
    if (ot1h + ot2h > 0) {
      const ot = r2Hrs(ot1h + ot2h);
      components.push({
        name: 'Sched OT 200%', ea: 'Cl. 140.2(d)', code: codes.sat_ot || '1027',
        hrs: `${ot.toFixed(2)} hrs`, rate: `$${(B * 2).toFixed(5)}/hr (200%)`,
        amount: r2(ot * B * 2), cls: '', date: day.date,
      });
    }
  } else if (isSat) {
    components.push({
      name: 'Ordinary Hours (Saturday, base)', ea: 'Sch. 4A', code: codes.base || '1001',
      hrs: `${ordH.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
      amount: r2(ordH * B), cls: '', date: day.date, pool_to_ordinary: true,
    });
    const satLoading = B * 0.5;
    components.push({
      name: 'Loading @ 50% Saturday', ea: 'Cl. 54.1', code: codes.sat || '1064',
      hrs: `${ordH.toFixed(2)} hrs`, rate: `$${satLoading.toFixed(5)}/hr`,
      amount: r2(ordH * satLoading), cls: '', date: day.date,
    });
    if (ot1h + ot2h > 0) {
      const ot = r2Hrs(ot1h + ot2h);
      components.push({
        name: 'Sched OT 200%', ea: 'Cl. 140.2(b)', code: codes.sat_ot || '1027',
        hrs: `${ot.toFixed(2)} hrs`, rate: `$${(B * 2).toFixed(5)}/hr (200%)`,
        amount: r2(ot * B * 2), cls: '', date: day.date,
      });
    }
  } else {
    components.push({
      name: 'Ordinary Hours', ea: 'Sch. 4A', code: codes.base || '1001',
      hrs: `${ordH.toFixed(2)} hrs`, rate: `$${B.toFixed(5)}/hr`,
      amount: r2(ordH * B), cls: '', date: day.date, pool_to_ordinary: true,
    });
    if (ot1h > 0) {
      const r = B * 1.5;
      components.push({
        name: 'Sched OT 150%', ea: 'Cl. 140.2(a)', code: codes.ot1 || '1026',
        hrs: `${ot1h.toFixed(2)} hrs`, rate: `$${r.toFixed(5)}/hr`,
        amount: r2(ot1h * r), cls: '', date: day.date,
      });
    }
    if (ot2h > 0) {
      const r = B * 2;
      components.push({
        name: 'Sched OT 200%', ea: 'Cl. 140.2(a)', code: codes.ot2 || '1110',
        hrs: `${ot2h.toFixed(2)} hrs`, rate: `$${r.toFixed(5)}/hr`,
        amount: r2(ot2h * r), cls: '', date: day.date,
      });
    }
    const sc = getShiftClass(win.aS);
    if (sc) {
      const penRate = sc === 'night' ? cfg.night_rate : sc === 'early' ? cfg.early_rate : cfg.afternoon_rate;
      const penH = roundHrsEA(ordH);
      const penCode = sc === 'night' ? (codes.night || '1487') : sc === 'early' ? (codes.early || '1483') : (codes.afternoon || '1485');
      const penName = sc === 'night' ? 'Night Shift Dvrs/Grds Hrl' : sc === 'early' ? 'Morning Shift Dvrs/Grds H' : 'Afternoon Shift Dvrs/Grds';
      const penClause = `Item ${sc === 'night' ? 7 : sc === 'early' ? 8 : 6} Sch.4B`;
      components.push({
        name: penName, ea: penClause, code: penCode,
        hrs: `${penH.toFixed(2)} hrs`, rate: `$${penRate.toFixed(5)}/hr`,
        amount: r2(penH * penRate), cls: 'pen-row', date: day.date,
      });
    }
    if (addLoadingEligible(win.aS, day.dow, isPH)) {
      components.push({
        name: 'Special Loading Drvs/Grds', ea: 'Cl. 134.4', code: codes.add_load || '1470',
        hrs: '1.00 hrs', rate: `$${cfg.add_loading.toFixed(5)}/hr`,
        amount: r2(cfg.add_loading), cls: 'pen-row', date: day.date,
      });
    }
  }

  // 1496 Cl. 143.5 / Item 12 Sch.4B — flat $14.55 when actual shift > 10h and ≤ 16h
  if (actualHrs > 10.0 && actualHrs <= 16.0) {
    const exp10Rate = cfg.exp_over_10h_rate ?? 14.55;
    components.push({
      name: 'Exp More Than 10 Hours',
      ea: 'Cl. 143.5 / Item 12 Sch.4B',
      code: codes.exp_over_10h || '1496',
      hrs: '1.00', rate: `$${exp10Rate.toFixed(5)}`,
      amount: r2(exp10Rate), cls: 'pen-row', date: day.date,
    });
  }

  // 1454 "Assoc Wrk Time (Mileage)" — depot chart formula:
  //   Build Up = max(0, Un-Assoc + Assoc Payment + Distance Payment − Shift Length)
  // "Shift Length" = the EFFECTIVE paid window: max(r_hrs, lift-up window).
  // When lift-up is claimed and extends beyond r_hrs, use the effective window
  // so the build-up isn't double-counted on top of the lift-up extra time.
  const chartEntry  = assocChart[day.diagNum || ''];
  const unAssocHrs  = chartEntry ? chartEntry.unAssocMins   / 60 : 0;
  const assocPayHrs = chartEntry ? chartEntry.assocPaymentMins / 60 : 0;
  const distPay     = kmCredited ?? 0;
  const totalCredit = unAssocHrs + assocPayHrs + distPay;
  const baseSchedHrs = (day.rHrs && day.rHrs > 0) ? day.rHrs : workedHrs;
  // Use effective lift-up window when it exceeds scheduled hours
  const liftupExtends = win.claimActive && workedHrs > baseSchedHrs;
  const schedHrs    = liftupExtends ? workedHrs : baseSchedHrs;
  const buildUp1454 = (chartEntry?.buildUpMins && chartEntry.buildUpMins > 0 && !liftupExtends)
    ? r2Hrs(chartEntry.buildUpMins / 60)
    : r2Hrs(Math.max(0, totalCredit - schedHrs));
  if (buildUp1454 > 0) {
    const bRate = B; // Cl. 157.1(b): assoc/un-assoc build-up always at base rate
    components.push({
      name: `Assoc Wrk Time (Mileage) — ${km.toFixed(0)} km: `
          + `un-assoc ${unAssocHrs.toFixed(2)}h + assoc ${assocPayHrs.toFixed(2)}h`
          + ` + dist ${distPay.toFixed(2)}h = ${totalCredit.toFixed(2)}h`,
      ea: 'Cl. 157.1(b) / Cl. 146.4', code: codes.km || '1454',
      hrs: `${buildUp1454.toFixed(2)} hrs`, rate: `$${bRate.toFixed(5)}/hr`,
      amount: r2(buildUp1454 * bRate), cls: 'km-row', date: day.date,
    });
    flags.push(
      `1454: un-assoc ${unAssocHrs.toFixed(2)}h + assoc ${assocPayHrs.toFixed(2)}h`
      + ` + dist ${distPay.toFixed(2)}h = ${totalCredit.toFixed(2)}h`
      + ` vs sched ${schedHrs.toFixed(2)}h → build-up +${buildUp1454.toFixed(2)}h.`
    );
  }

  // PDWP — Picnic Day Worked and Paid: extra 8h ordinary on top of shift pay (Cl. 32.1)
  if (day.leaveCat === 'PDWP' && workedHrs > 0) {
    const extra = r2(8 * B);
    components.push({
      name: 'Picnic Day — additional 8 hrs', ea: 'Cl. 32.1', code: '',
      hrs: '8.00 hrs', rate: `$${B.toFixed(5)}/hr`,
      amount: extra, cls: '', date: day.date,
    });
    flags.push('PDWP: worked shift paid at applicable rates + additional 8-hr ordinary (Cl. 32.1).');
  }

  if (otH > 0) flags.push(`Daily OT: ${otH.toFixed(2)} hrs.`);

  const total   = r2(components.reduce((s, c) => s + c.amount, 0));
  const paidHrs = buildUp1454 > 0 ? r2Hrs(workedHrs + buildUp1454) : workedHrs;

  return {
    date: day.date, diag: day.diag,
    day_type: isPH ? 'ph' : isSun ? 'sunday' : isSat ? 'saturday' : 'weekday',
    hours: workedHrs, paid_hrs: r2(paidHrs),
    total_pay: total, components, flags,
  };
}

function previewLeave(day: DayState, cfg: RateConfig, codes: PayrollCodes): DayResult {
  const B = cfg.base_rate;
  const cat = day.leaveCat;
  const rHrs = day.rHrs || 8;

  if (cat === 'PHNW') {
    const isWeekend = day.dow === 0 || day.dow === 6;
    const code = isWeekend ? (codes.ph_wke || '1010') : (codes.ph_wkd || '5042');
    const name = 'PHNW / TC';
    const amt = r2(8 * B);
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: 0, paid_hrs: 8, total_pay: amt,
      components: [{ name, ea: 'Cl. 31.7', code,
        hrs: '8.00 hrs', rate: `$${B.toFixed(5)}/hr`, amount: amt, cls: '', date: day.date }],
      flags: [`PHNW / TC: 8 hrs ordinary (Cl. 31.7).`],
    };
  }

  // v3.30: Sick leave pays the entire scheduled shift at ordinary rate, with
  // an 8-hour minimum.  No OT split.  See backend mirror in
  // calculator.py::_compute_leave + PRD §5.9.
  // v3.38: Carer's leave uses the same rule as sick leave.
  const slHrs = Math.max(rHrs, 8);
  const map: Record<string, [number, number, string, string]> = {
    SL: [slHrs, B, 'Sick leave', 'Cl. 30.4'],
    CL: [slHrs, B, "Carer's leave", 'Cl. 30.7(b)(ix)'],
    BL: [rHrs,  B, 'Bereavement leave', 'Cl. 30.8(k)(iv)'],
    JD: [rHrs,  B, 'Jury duty', 'Cl. 30.8(g)'],
    LWOP: [0, 0, 'Leave without pay', '—'],
    RDO: [0, 0, 'Roster day off (RDO)', '—'],
  };
  if (cat in map) {
    const [hrs, rate, name, ea] = map[cat];
    const amt = r2(hrs * rate);
    const comps: PayComponent[] = amt > 0
      ? [{ name, ea, code: '', hrs: `${hrs.toFixed(2)} hrs`,
          rate: `$${rate.toFixed(5)}/hr`, amount: amt, cls: '', date: day.date }]
      : [];
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: 0, paid_hrs: hrs, total_pay: amt,
      components: comps, flags: [`${cat}: ${name} (${ea}).`],
    };
  }
  if (cat === 'AL') {
    const base = r2(8 * B);
    const loading = r2(7.92 * B * 0.20);  // EA: loading on 7.92 hrs, ordinary on 8.00 hrs
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: 0, paid_hrs: 8, total_pay: r2(base + loading),
      components: [
        { name: 'Annual leave', ea: 'Cl. 30.1', code: '',
          hrs: '8.00 hrs', rate: `$${B.toFixed(5)}/hr`, amount: base, cls: '', date: day.date },
        { name: 'Annual leave loading 20%', ea: 'Cl. 30.2(a)(ii)', code: '',
          hrs: '7.92 hrs', rate: '20% loading', amount: loading, cls: 'pen-row', date: day.date },
      ],
      flags: ['AL: 8 hrs ordinary + 7.92 hrs × 20% loading (Cl. 30.2(a)(ii)).'],
    };
  }
  if (cat === 'PHW' || cat === 'PHWA') {
    let payHrs = rHrs;
    if (day.aStart && day.aEnd) {
      const aS = toMins(day.aStart); let aE = toMins(day.aEnd);
      if (aS !== null && aE !== null) { if (day.cm || aE <= aS) aE += 1440; payHrs = r2Hrs(toHrs(aE - aS)); }
    }
    // 150% loading on first 8h only; OT beyond 8h at Cl. 78.3 rates
    const ordH = r2Hrs(Math.min(payHrs, 8)); const otH = r2Hrs(Math.max(0, payHrs - 8));
    const ot1H = r2Hrs(Math.min(otH, 3)); const ot2H = r2Hrs(Math.max(0, otH - 3));
    const loading = r2(ordH * B * 1.5);
    const comps: PayComponent[] = [
      { name: 'PHW — 150% loading', ea: 'Cl. 31.5(a)', code: '',
        hrs: `${ordH.toFixed(2)} hrs`, rate: '1.5×', amount: loading, cls: '', date: day.date },
    ];
    let total = loading;
    if (ot1H > 0) {
      const ot1Amt = r2(ot1H * B * (cfg.ot1 ?? 1.5));
      comps.push({ name: 'Sched OT 150%', ea: 'Cl. 78.3', code: codes.ot1 || '1026',
        hrs: `${ot1H.toFixed(2)} hrs`, rate: `$${(B * (cfg.ot1 ?? 1.5)).toFixed(5)}/hr`, amount: ot1Amt, cls: '', date: day.date });
      total = r2(total + ot1Amt);
    }
    if (ot2H > 0) {
      const ot2Amt = r2(ot2H * B * (cfg.ot2 ?? 2.0));
      comps.push({ name: 'Sched OT 200%', ea: 'Cl. 78.3', code: codes.ot2 || '1110',
        hrs: `${ot2H.toFixed(2)} hrs`, rate: `$${(B * (cfg.ot2 ?? 2.0)).toFixed(5)}/hr`, amount: ot2Amt, cls: '', date: day.date });
      total = r2(total + ot2Amt);
    }
    if (cat === 'PHW') {
      const addDay = r2(8 * B);
      comps.push({ name: 'PHW — additional day', ea: 'Cl. 31.5(b)', code: '',
        hrs: '8.00 hrs', rate: `$${B.toFixed(5)}/hr`, amount: addDay, cls: '', date: day.date });
      total = r2(total + addDay);
    }
    const otNote = otH > 0 ? ` + ${otH.toFixed(2)}h OT (Cl. 78.3)` : '';
    const flag = cat === 'PHW'
      ? `PHW: ${ordH.toFixed(2)}h at 150% loading${otNote} + additional day.`
      : `PHW (accrued): ${ordH.toFixed(2)}h at 150% loading${otNote}; additional 8-hr day accrues (Cl. 31.5(b)).`;
    return {
      date: day.date, diag: day.diag, day_type: 'leave',
      hours: payHrs, paid_hrs: payHrs, total_pay: total,
      components: comps, flags: [flag],
    };
  }
  return {
    date: day.date, diag: day.diag, day_type: 'leave',
    hours: 0, paid_hrs: 0, total_pay: 0, components: [], flags: [`Unknown leave: ${cat}`],
  };
}
