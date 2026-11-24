/*
 * Universal Movers - price engine, version 3 (reference implementation)
 * ---------------------------------------------------------------------
 * Plain JavaScript, no dependencies. Same engine as the Universal Movers Price Calculator (English).
 * Purpose: reference for the CRM backend pricing service. Port the logic to the backend;
 * every number must come from the settings (see settings-v3.json), never from code.
 *
 * Main functions:
 *   calc(settings, job)    -> fixed price, hourly-rate indication, cost price, margins, hours, days, warnings
 *   advies(settings, job)  -> advice: best truck type, number of trucks and crew size
 *
 * Settings and job keys are in Dutch (e.g. ploeg = crew, wagen = truck, klus = job, vast = fixed,
 * afgeleid = derived, verkoop = selling price, kosten = cost). The specification lists every key
 * with its English meaning. Keep the keys as they are, so settings JSON stays compatible.
 *
 * Run the tests: node run-tests.js
 */
const DEFAULTS = {
  arbeid: { loon: 16.5, wgl: 30, factor_nd: 1.15, overhead_maand: 2500, decl_uren: 500, kost_modus: 'vast', kost_vast: 30,
    dag_norm: 8, overwerk_pct: 30, overwerk_doorberekenen: true, max_werkdag: 12,
    kost_toeslag: { doordeweeks: 0, zaterdag: 0, zondag: 0, feestdag: 0, avond: 0 } },
  ploeg: { min: 2, max: 6, special_tekort: 'hulp', hulp_uren: 2 },
  tarief: { verhuizer_modus: 'afgeleid', verhuizer_vast: 37.5 },
  prod: { m3_per_manuur: 1.2 },
  adres: { trap_pct: 10, inpandig_pct: 5, verhuislift_pct: 0, loop_drempel: 20, loop_pct: 10, parkeer_pct: 0, smal_pct: 0 },
  extra: { inpak_min: 6, uitpak_min: 5, doos_m3: 0.1 },
  meubels: [
    { id: 'std', naam: 'Standard item', dem: 15, mon: 15 },
    { id: 'bed', naam: 'Double bed', dem: 20, mon: 25 },
    { id: 'kast', naam: 'Large wardrobe', dem: 30, mon: 45 },
    { id: 'bureau', naam: 'Desk', dem: 15, mon: 15 }
  ],
  reis: { per_man: true, voorrij: 0, gratis_km: 0, stop_min: 20, spits_pct: 20,
    max_rijtijd_min: 540, pauze_na_min: 270, pauze_min: 45, pauze_betaald: false,
    hotel: 90, dagvergoeding: 35, marge_op_doorbelast: false },
  internationaal: { douane_kost: 0, douane_verkoop_modus: 'afgeleid', douane_vast: 0, grens_wacht_min: 60 },
  wagens: [
    { id: 'bak', naam: 'Box truck 22 m³', m3: 22, kost_dag: 0, kost_uur: 14, kost_km: 0.30, verkoop_modus: 'afgeleid', verkoop_uur: 25, verkoop_km: 0.5, verkoop_inzet: 103.31, km_incl: 50 },
    { id: 'bak40', naam: 'Box truck 40 m³', m3: 40, kost_dag: 0, kost_uur: 18, kost_km: 0.35, verkoop_modus: 'per_inzet', verkoop_uur: 30, verkoop_km: 0.5, verkoop_inzet: 206.61, km_incl: 50 },
    { id: 'bak60', naam: 'Box truck 60 m³', m3: 60, kost_dag: 0, kost_uur: 22, kost_km: 0.40, verkoop_modus: 'per_inzet', verkoop_uur: 35, verkoop_km: 0.5, verkoop_inzet: 309.92, km_incl: 50 },
    { id: 'bus', naam: 'Van 12 m³', m3: 12, kost_dag: 0, kost_uur: 9, kost_km: 0.20, verkoop_modus: 'afgeleid', verkoop_uur: 15, verkoop_km: 0.35, verkoop_inzet: 60, km_incl: 30 }
  ],
  lift: { kost_uur: 50, verkoop_modus: 'afgeleid', eerste_uur: 139, per_halfuur: 60 },
  materiaal: [ { id: 'autolock', naam: 'Autolock moving box', kost: 2.5, verkoop_modus: 'afgeleid', verkoop: 2.5 } ],
  dozen: { rit_min: 60, rit_km: 30, mannen: 1, wagen: 'bus', verkoop_modus: 'afgeleid', vast_rit: 45 },
  specials: [
    { id: 'piano', naam: 'Upright piano', manuren: 2, mat: 15, min_ploeg: 3, verkoop_modus: 'afgeleid', vast: 150 },
    { id: 'vleugel', naam: 'Grand piano', manuren: 6, mat: 40, min_ploeg: 4, verkoop_modus: 'afgeleid', vast: 450 },
    { id: 'kluis', naam: 'Safe up to 200 kg', manuren: 2, mat: 10, min_ploeg: 3, verkoop_modus: 'afgeleid', vast: 125 },
    { id: 'koelkast', naam: 'American fridge', manuren: 1, mat: 0, min_ploeg: 2, verkoop_modus: 'afgeleid', vast: 60 },
    { id: 'aquarium', naam: 'Large aquarium', manuren: 1.5, mat: 20, min_ploeg: 2, verkoop_modus: 'afgeleid', vast: 95 }
  ],
  diensten: [
    { id: 'lamp', naam: 'Hang a lamp', min: 20, mat: 0, verkoop_modus: 'afgeleid', vast: 25 },
    { id: 'tv', naam: 'Mount a TV on the wall', min: 45, mat: 0, verkoop_modus: 'afgeleid', vast: 60 },
    { id: 'rail', naam: 'Hang a curtain rail', min: 30, mat: 0, verkoop_modus: 'afgeleid', vast: 35 },
    { id: 'afval', naam: 'Waste disposal, per m³', min: 15, mat: 35, verkoop_modus: 'afgeleid', vast: 60 }
  ],
  verzekering: { reserve_pct: 1, premie_pct: 0, certificaat_prijs: 0 },
  taxatie: { meerekenen: true, min_fysiek: 75, min_video: 30, min_foto: 15, km_fysiek: 25, km_kost: 0.25, conversie_pct: 50 },
  toeslag: { doordeweeks: 0, zaterdag: 25, zondag: 75, feestdag: 75, avond: 0, spoed: 0 },
  opslag: { per_m3_maand: 10, handling_m3: 0, min_maanden: 1 },
  comm: { marge: 15, marge_drempel: 10, buffer_fysiek: 5, buffer_video: 10, buffer_foto: 15, min_prijs: 0, min_uren: 3, afronding: 5, btw: 21 },
  profielen: [ { id: 'part', naam: 'Private', incl: true, marge: '' }, { id: 'zak', naam: 'Business', incl: false, marge: '' } ],
  meerwerk: { tolerantie: 10, extra_m3_modus: 'afgeleid', extra_m3_vast: 35, wacht_gratis: 15, wacht_modus: 'afgeleid', wacht_vast: 10, extra_stop: 0 }
};

// Fields every job has, even when not filled in.
// stops: [{ naam (name), soort (type): 'laad' (load) | 'los' (unload), m3, trap (floors via stairs), lift, loop (walking distance m), parkeer (no parking), smal (narrow stairs), omrij_min / omrij_km (detour), kosten (costs €) }]
// venster (time windows): times as 'HH:MM'; empty = no window. land_van / land_naar (origin / destination): 'nl' | 'eu' | 'buiten' (outside the EU).
const KLUS_EXTRA = { extra_stops: 0, stops: [], spits: false, wacht_min: 0, tol: 0, nachten: 0, overnachten: 'auto',
  dozen_leveren: false, dozen_ophalen: false, specials: [], diensten: [], verz_waarde: 0, certificaat: false,
  venster: { laden: { van: '', tot: '' }, lossen: { van: '', tot: '' }, dag: { van: '', tot: '' } },
  land_van: 'nl', land_naar: 'nl', btw_regime: 'auto', btw_buitenland: 21 };

function maakKlus(basis, extra) { return Object.assign(clone(KLUS_EXTRA), basis, extra ? clone(extra) : {}); }
const LEEG_ADRES = { trap: 0, lift: 'geen', loop: 0, parkeer: false, smal: false };

const PRESETS = {
  A: maakKlus({ naam: 'A. Studio, 12 m³', profiel: 'part', taxatie: 'video', tijdstip: 'doordeweeks', spoed: false, m3: 12, ploeg: 2, wagen: 'bak', wagens: 1,
    laad: { trap: 0, lift: 'geen', loop: 0, parkeer: false, smal: false }, los: { trap: 0, lift: 'inpandig', loop: 0, parkeer: false, smal: false },
    meubels: [{ type: 'std', dem: 2, mon: 2 }], inpak: 0, uitpak: 0, route_min: 50, route_km: 30, lift_inzet: false, lift_uren: 2,
    materiaal: [{ id: 'autolock', n: 0 }], derden: 0, opslag_m3: 0, opslag_maanden: 0 }),
  B: maakKlus({ naam: 'B. 3-room apartment, 30 m³', profiel: 'part', taxatie: 'video', tijdstip: 'doordeweeks', spoed: false, m3: 30, ploeg: 3, wagen: 'bak', wagens: 1,
    laad: { trap: 0, lift: 'verhuislift', loop: 0, parkeer: false, smal: false }, los: { trap: 1, lift: 'geen', loop: 0, parkeer: false, smal: false },
    meubels: [{ type: 'std', dem: 4, mon: 4 }], inpak: 0, uitpak: 0, route_min: 60, route_km: 40, lift_inzet: true, lift_uren: 2,
    materiaal: [{ id: 'autolock', n: 0 }], derden: 0, opslag_m3: 0, opslag_maanden: 0 }),
  C: maakKlus({ naam: 'C. Family house, 50 m³', profiel: 'part', taxatie: 'video', tijdstip: 'doordeweeks', spoed: false, m3: 50, ploeg: 4, wagen: 'bak', wagens: 1,
    laad: { trap: 1, lift: 'geen', loop: 0, parkeer: false, smal: false }, los: { trap: 1, lift: 'geen', loop: 25, parkeer: false, smal: false },
    meubels: [{ type: 'std', dem: 6, mon: 6 }], inpak: 20, uitpak: 20, route_min: 75, route_km: 50, lift_inzet: false, lift_uren: 2,
    materiaal: [{ id: 'autolock', n: 20 }], derden: 0, opslag_m3: 0, opslag_maanden: 0 }),
  D: maakKlus({ naam: 'D. Amsterdam → London, 25 m³, with storage', profiel: 'part', taxatie: 'video', tijdstip: 'doordeweeks', spoed: false, m3: 25, ploeg: 3, wagen: 'bak40', wagens: 1,
    laad: { trap: 2, lift: 'geen', loop: 0, parkeer: false, smal: false }, los: { trap: 0, lift: 'geen', loop: 15, parkeer: false, smal: false },
    meubels: [{ type: 'std', dem: 4, mon: 4 }], inpak: 0, uitpak: 0, route_min: 840, route_km: 1080, lift_inzet: false, lift_uren: 2,
    materiaal: [{ id: 'autolock', n: 0 }], derden: 0, opslag_m3: 0, opslag_maanden: 0 },
    { stops: [Object.assign({ naam: 'Storage unit Amstelveen', soort: 'laad', m3: 5, omrij_min: 30, omrij_km: 20, kosten: 0 }, LEEG_ADRES, { loop: 30 })],
      land_van: 'nl', land_naar: 'buiten', tol: 400, venster: { laden: { van: '', tot: '' }, lossen: { van: '09:00', tot: '17:00' }, dag: { van: '', tot: '' } } })
};

const FASE = { laden: 'Loading', lossen: 'Unloading', dag: 'Working day' };
const MSG = {
  marge: (m, d) => `Fixed-price margin ${m}% is below the threshold of ${d}%.`,
  tarief: 'The hourly rate per mover is below the cost price per man-hour.',
  wagen: 'The selling rate of the truck is below its cost price.',
  min: 'The calculated price was below the minimum price; the minimum price has been applied.',
  past: (m3, n, naam, cap) => `The volume (${m3} m³) does not fit in ${n} × ${naam} (${cap} m³). Choose a larger truck, more trucks or charge an extra trip.`,
  dag: (u, max, dagen) => `The job takes ${u} hours, longer than the working day of ${max} hours: plan for ${dagen} days or a larger crew.`,
  rij: (min, max) => `The driving time (${min} min) is longer than the maximum driving time per day (${max} min): choose an overnight stay or plan a second driver.`,
  lokaal: 'Driving there and back every day does not fit within the driving time or the working day. Set Overnight stay to "Automatic" or "Yes".',
  lang: (dagen, nachten, rij) => `Long trip: ${dagen} days and ${nachten} ${nachten === 1 ? 'night' : 'nights'} based on ${rij} ${rij === '1' ? 'hour' : 'hours'} of driving, the maximum driving time per day and the breaks. Hotel and daily allowance are included.`,
  overwerk: (u) => `${u} overtime hours in this job; the overtime rate is included in the cost price.`,
  stopsM3: (s, t, soort) => `The volume at extra ${soort === 'los' ? 'unloading addresses' : 'loading addresses'} (${s} m³) is larger than the total volume (${t} m³).`,
  special: (naam, n, p, hulp, uren) => hulp
    ? `${naam} needs at least ${n} people; the crew is ${p}. ${n - p} ${n - p === 1 ? 'helper' : 'helpers'} × ${uren} ${uren === '1' ? 'hour' : 'hours'} ${n - p === 1 ? 'is' : 'are'} included.`
    : `${naam} needs at least ${n} people; the crew is ${p}. Choose a crew of at least ${n}.`,
  venster: (fase, van, tot, nodig, h, pn, max) => `${fase} does not fit in the time window ${van}–${tot}: ${nodig} ${nodig === '1' ? 'hour' : 'hours'} needed, ${h} ${h === '1' ? 'hour' : 'hours'} available. ` +
    (pn <= max ? `Use a crew of at least ${pn}.` : `Even the largest crew (${max} people) cannot make it: plan a second crew or agree a wider time window.`),
  douane0: 'Customs clearance is needed, but customs costs are set to €0. Enter your customs agent\'s costs under International and customs.',
  tacho: 'International trip: since 1 July 2026 the tachograph and the driving and rest time rules also apply to vans from 2.5 tonnes when transporting for customers.',
  btw: {
    nul: 'VAT 0%: transport from or to a country outside the EU. Keep proof that the goods crossed the border and have your accountant confirm this.',
    verlegd: 'VAT reverse charge: business customer in another EU country. Put the customer\'s VAT number and "VAT reverse charge" on the invoice.',
    buitenland: (p) => `VAT of the country of departure (${p}%), declared through OSS (One-Stop Shop). Have your accountant confirm this.`
  }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? clone(over) : clone(base);
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = deepMerge(base[k], over && typeof over === 'object' ? over[k] : undefined);
    return out;
  }
  return over === undefined ? base : over;
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt1 = v => (Math.round(v * 10) / 10).toString();

class PricingValidationError extends Error {
  constructor(message, { code = 'VALIDATION_ERROR', field = null, probe = null } = {}) {
    super(message);
    this.name = 'PricingValidationError';
    this.isValidationError = true;
    this.code = code;
    this.field = field;
    this.probe = probe;
  }
}

function isValidClockTime(t) {
  if (t === '' || t === null || t === undefined) return true;
  if (typeof t !== 'string') return false;
  const match = t.match(/^([01]\d|2[0-3]):[0-5]\d$/);
  return !!match;
}

// 'HH:MM' -> hours as a number; empty or invalid -> null
function tijdU(t) { if (t === '' || t === null || t === undefined) return null; if (typeof t === 'number') return t; const m = String(t).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) + Number(m[2]) / 60 : null; }
function vensterU(v) { if (!v) return null; const a = tijdU(v.van), b = tijdU(v.tot); if (a === null || b === null || a === b) return null; return b > a ? b - a : b + 24 - a; }

/**
 * Validates a job configuration against the active pricing settings.
 * Enforces all 12 validation probe rules (N16-01 to N16-12) to prevent silent fallbacks or corruption.
 */
function validateJobInput(job, settings, options = {}) {
  if (!job || typeof job !== 'object') {
    throw new PricingValidationError('Job configuration must be a non-null object', {
      code: 'INVALID_JOB_PAYLOAD',
    });
  }

  const S = settings || DEFAULTS;

  // Probe N16-01 & N16-05: Volume (m3) validation
  if (job.m3 === undefined || job.m3 === null || (typeof job.m3 === 'string' && isNaN(Number(job.m3)))) {
    throw new PricingValidationError(
      `Volume (m3) must be a valid number, received: ${JSON.stringify(job.m3)}`,
      { code: 'INVALID_VOLUME', field: 'm3', probe: 'N16-01' }
    );
  }
  const m3Num = Number(job.m3);
  if (!Number.isFinite(m3Num) || isNaN(m3Num)) {
    throw new PricingValidationError(
      `Volume (m3) must be a finite number, received: ${job.m3}`,
      { code: 'INVALID_VOLUME', field: 'm3', probe: 'N16-01' }
    );
  }
  if (m3Num < 0) {
    throw new PricingValidationError(
      `Volume (m3) cannot be negative, received: ${m3Num}`,
      { code: 'INVALID_VOLUME', field: 'm3', probe: 'N16-05' }
    );
  }

  // Probe N16-02 & N16-06: Crew (ploeg) validation
  const checkCrew = !options.skipTruckAndCrew || job.ploeg !== undefined;
  if (checkCrew) {
    if (job.ploeg === undefined || job.ploeg === null || isNaN(Number(job.ploeg))) {
      throw new PricingValidationError(
        `Crew size (ploeg) must be a valid number, received: ${JSON.stringify(job.ploeg)}`,
        { code: 'INVALID_CREW', field: 'ploeg', probe: 'N16-02' }
      );
    }
    const ploegNum = Number(job.ploeg);
    if (!Number.isInteger(ploegNum)) {
      throw new PricingValidationError(
        `Crew size (ploeg) must be an integer, received fractional: ${ploegNum}`,
        { code: 'INVALID_CREW_INTEGER', field: 'ploeg', probe: 'N16-06' }
      );
    }
    if (ploegNum < 1) {
      throw new PricingValidationError(
        `Crew size (ploeg) must be at least 1, received: ${ploegNum}`,
        { code: 'INVALID_CREW', field: 'ploeg', probe: 'N16-02' }
      );
    }
  }

  // Probe N16-03: Truck (wagen) validation
  const checkTruck = !options.skipTruckAndCrew || job.wagen !== undefined;
  if (checkTruck) {
    if (!job.wagen || typeof job.wagen !== 'string') {
      throw new PricingValidationError(
        `Truck ID (wagen) is required and must be a string`,
        { code: 'INVALID_TRUCK', field: 'wagen', probe: 'N16-03' }
      );
    }
    const truckList = Array.isArray(S.wagens) ? S.wagens : [];
    const matchedTruck = truckList.find(w => w.id === job.wagen);
    if (!matchedTruck) {
      throw new PricingValidationError(
        `Unknown truck id: "${job.wagen}". Available trucks: ${truckList.map(w => w.id).join(', ')}`,
        { code: 'UNKNOWN_TRUCK', field: 'wagen', probe: 'N16-03' }
      );
    }
  }

  // Probe N16-04: VAT Regime (btw_regime) validation
  if (job.btw_regime !== undefined && job.btw_regime !== null) {
    const allowedRegimes = ['auto', 'nl', 'nul', 'verlegd', 'buitenland'];
    if (!allowedRegimes.includes(job.btw_regime)) {
      throw new PricingValidationError(
        `Unknown VAT regime: "${job.btw_regime}". Allowed regimes: ${allowedRegimes.join(', ')}`,
        { code: 'UNKNOWN_VAT_REGIME', field: 'btw_regime', probe: 'N16-04' }
      );
    }
  }

  // Probe N16-07: Clock format validation in time windows (HH:MM 00:00 - 23:59)
  if (job.venster && typeof job.venster === 'object') {
    for (const key of ['laden', 'lossen', 'dag']) {
      const win = job.venster[key];
      if (win && typeof win === 'object') {
        if (!isValidClockTime(win.van)) {
          throw new PricingValidationError(
            `Invalid clock time for window "${key}.van": "${win.van}". Expected valid 24h format HH:MM (00:00 to 23:59).`,
            { code: 'INVALID_TIME_WINDOW', field: `venster.${key}.van`, probe: 'N16-07' }
          );
        }
        if (!isValidClockTime(win.tot)) {
          throw new PricingValidationError(
            `Invalid clock time for window "${key}.tot": "${win.tot}". Expected valid 24h format HH:MM (00:00 to 23:59).`,
            { code: 'INVALID_TIME_WINDOW', field: `venster.${key}.tot`, probe: 'N16-07' }
          );
        }
      }
    }
  }

  // Probe N16-08: Same-day booking chronological window feasibility
  if (job.venster && job.venster.laden && job.venster.lossen) {
    const lVan = tijdU(job.venster.laden.van);
    const lTot = tijdU(job.venster.laden.tot);
    const uVan = tijdU(job.venster.lossen.van);
    const uTot = tijdU(job.venster.lossen.tot);
    const isExplicitMultiDay = job.overnachten === 'ja' || (Number(job.nachten) > 0);
    if (!isExplicitMultiDay && lVan !== null && uVan !== null) {
      if (uVan < lVan || (lTot !== null && uVan < lTot)) {
        throw new PricingValidationError(
          `Same-day booking requires chronological feasibility: unloading window (${job.venster.lossen.van || ''}-${job.venster.lossen.tot || ''}) cannot precede loading window (${job.venster.laden.van || ''}-${job.venster.laden.tot || ''}).`,
          { code: 'CHRONOLOGICAL_WINDOW_CONFLICT', field: 'venster', probe: 'N16-08' }
        );
      }
    }
  }

  // Probe N16-11: Catalogue material ID validation
  if (Array.isArray(job.materiaal)) {
    const matList = Array.isArray(S.materiaal) ? S.materiaal : [];
    for (let i = 0; i < job.materiaal.length; i++) {
      const item = job.materiaal[i];
      if (item && item.id && (item.n === undefined || Number(item.n) > 0)) {
        const found = matList.find(m => m.id === item.id);
        if (!found) {
          throw new PricingValidationError(
            `Unknown material item ID: "${item.id}" at index ${i}. Available materials: ${matList.map(m => m.id).join(', ')}`,
            { code: 'UNKNOWN_MATERIAL', field: `materiaal[${i}].id`, probe: 'N16-11' }
          );
        }
      }
    }
  }

  // Probe N16-12: Commercial profile validation
  if (job.profiel !== undefined && job.profiel !== null) {
    const profList = Array.isArray(S.profielen) ? S.profielen : [];
    const foundProf = profList.find(p => p.id === job.profiel);
    if (!foundProf) {
      throw new PricingValidationError(
        `Unknown commercial profile id: "${job.profiel}". Available profiles: ${profList.map(p => p.id).join(', ')}`,
        { code: 'UNKNOWN_PROFILE', field: 'profiel', probe: 'N16-12' }
      );
    }
  }

  return true;
}

function kostManuur(S) {
  const a = S.arbeid;
  const afg = num(a.loon) * (1 + num(a.wgl) / 100) * num(a.factor_nd) + (num(a.decl_uren) > 0 ? num(a.overhead_maand) / num(a.decl_uren) : 0);
  return { afgeleid: afg, waarde: a.kost_modus === 'vast' ? num(a.kost_vast) : afg };
}
function loonkostUur(S) { return num(S.arbeid.loon) * (1 + num(S.arbeid.wgl) / 100); }
function margeVan(S, profielId) {
  const p = S.profielen.find(x => x.id === profielId) || S.profielen[0];
  const m = (p && p.marge !== '' && p.marge !== null && p.marge !== undefined) ? num(p.marge) : num(S.comm.marge);
  return Math.min(m, 95) / 100;
}
function tariefVerhuizer(S, profielId) {
  const m = margeVan(S, profielId);
  return S.tarief.verhuizer_modus === 'vast' ? num(S.tarief.verhuizer_vast) : kostManuur(S).waarde / (1 - m);
}
function adresFactor(ad, S) {
  const f = S.adres; ad = ad || {}; let x = 1 + num(f.trap_pct) / 100 * num(ad.trap);
  if (ad.lift === 'inpandig') x += num(f.inpandig_pct) / 100;
  if (ad.lift === 'verhuislift') x += num(f.verhuislift_pct) / 100;
  if (num(ad.loop) > num(f.loop_drempel)) x += num(f.loop_pct) / 100;
  if (ad.parkeer) x += num(f.parkeer_pct) / 100;
  if (ad.smal) x += num(f.smal_pct) / 100;
  return x;
}
function wagenModus(w) { return w.verkoop_modus === 'vast' ? 'uur_km' : (w.verkoop_modus || 'afgeleid'); }
// truck cost and selling price: hours = deployed hours per truck, km per truck, days = deployment days
function wagenPrijs(w, n, uren, urenB, km, kmVerkoop, dagen, m) {
  const kost = n * (num(w.kost_dag) * dagen + num(w.kost_uur) * uren + num(w.kost_km) * km);
  const mod = wagenModus(w);
  let verkoopVast, verkoopUur;
  if (mod === 'uur_km') {
    verkoopVast = n * (num(w.verkoop_uur) * uren + num(w.verkoop_km) * kmVerkoop);
    verkoopUur = n * (num(w.verkoop_uur) * urenB + num(w.verkoop_km) * kmVerkoop);
  } else if (mod === 'per_inzet') {
    verkoopVast = verkoopUur = n * (num(w.verkoop_inzet) * dagen + Math.max(0, km - num(w.km_incl)) * num(w.verkoop_km));
  } else {
    verkoopVast = kost / (1 - m);
    verkoopUur = n * (num(w.kost_dag) * dagen + num(w.kost_uur) * urenB + num(w.kost_km) * kmVerkoop) / (1 - m);
  }
  return { kost, verkoopVast, verkoopUur, modus: mod };
}
// largest minimum crew required by the special items in this job
function minPloegSpecials(S, K) {
  let n = 0, naam = '';
  for (const x of (K.specials || [])) { const t = (S.specials || []).find(y => y.id === x.id); if (!t || !num(x.n)) continue; if (num(t.min_ploeg) > n) { n = num(t.min_ploeg); naam = t.naam; } }
  return { n, naam };
}
// VAT treatment: 'nl' (Dutch rate) | 'nul' (0%) | 'verlegd' (reverse charge) | 'buitenland' (country of departure, OSS)
function btwRegime(K, prof) {
  if (K.btw_regime && K.btw_regime !== 'auto') return K.btw_regime;
  if (K.land_van === 'buiten' || K.land_naar === 'buiten') return 'nul';
  if (K.land_van === 'eu' && prof.incl) return 'buitenland';
  return 'nl';
}

// modus: 'nee' = return every day, 'ja' = drive the route once with overnight stays
function calcCore(S, K, f, modus) {
  modus = modus === 'ja' ? 'ja' : 'nee';
  const prof = S.profielen.find(p => p.id === K.profiel) || S.profielen[0];
  const m = margeVan(S, prof.id);
  const regime = btwRegime(K, prof);
  const btw = regime === 'nl' ? num(S.comm.btw) / 100 : regime === 'buitenland' ? num(K.btw_buitenland) / 100 : 0;
  const incl = !!prof.incl;
  const P = Math.max(num(S.prod.m3_per_manuur), 0.01);
  const ploeg = Math.max(1, Math.round(num(K.ploeg)));
  const fA = adresFactor(K.laad, S), fB = adresFactor(K.los, S);
  // loading and unloading, per address in proportion to the volume loaded or unloaded there
  const m3 = num(K.m3);
  let stopLaadM3 = 0, stopLosM3 = 0, stopLaadW = 0, stopLosW = 0, omrijMin = 0, omrijKm = 0, stopKosten = 0;
  const stops = (K.stops || []).filter(Boolean);
  for (const s of stops) {
    const fs = adresFactor(s, S), v = Math.max(0, num(s.m3));
    if (s.soort === 'los') { stopLosM3 += v; stopLosW += v * fs; } else { stopLaadM3 += v; stopLaadW += v * fs; }
    omrijMin += num(s.omrij_min); omrijKm += num(s.omrij_km); stopKosten += num(s.kosten);
  }
  const hoofdLaad = Math.max(0, m3 - stopLaadM3), hoofdLos = Math.max(0, m3 - stopLosM3);
  const laadW = hoofdLaad * fA + stopLaadW, losW = hoofdLos * fB + stopLosW;
  const ll = (laadW + losW) / 2 / P * f;
  const nStops = stops.length + num(K.extra_stops);
  let demMin = 0, monMin = 0;
  for (const x of (K.meubels || [])) { const t = S.meubels.find(y => y.id === x.type); if (!t) continue; demMin += num(x.dem) * num(t.dem); monMin += num(x.mon) * num(t.mon); }
  const inpakMin = num(K.inpak) * num(S.extra.inpak_min), uitpakMin = num(K.uitpak) * num(S.extra.uitpak_min);
  const extra = (demMin + monMin + inpakMin + uitpakMin) / 60;
  const kM = kostManuur(S).waarde, loonK = loonkostUur(S);
  // special items and services: own time and own price
  let spU = 0, spKost = 0, spVerkoop = 0; const spLijst = [];
  for (const x of (K.specials || [])) { const t = (S.specials || []).find(y => y.id === x.id); if (!t || !num(x.n)) continue;
    const u = num(x.n) * num(t.manuren); spU += u;
    const kost = u * kM + num(x.n) * num(t.mat); const vk = t.verkoop_modus === 'vast' ? num(x.n) * num(t.vast) : kost / (1 - m);
    spKost += kost; spVerkoop += vk; spLijst.push({ naam: t.naam, n: num(x.n), kost, verkoop: vk }); }
  let dnU = 0, dnKost = 0, dnVerkoop = 0; const dnLijst = [];
  for (const x of (K.diensten || [])) { const t = (S.diensten || []).find(y => y.id === x.id); if (!t || !num(x.n)) continue;
    const u = num(x.n) * num(t.min) / 60; dnU += u;
    const kost = u * kM + num(x.n) * num(t.mat); const vk = t.verkoop_modus === 'vast' ? num(x.n) * num(t.vast) : kost / (1 - m);
    dnKost += kost; dnVerkoop += vk; dnLijst.push({ naam: t.naam, n: num(x.n), kost, verkoop: vk }); }
  // minimum crew for special items: helpers or only a warning
  const minSp = minPloegSpecials(S, K);
  const tekort = Math.max(0, minSp.n - ploeg);
  const hulpU = tekort > 0 && S.ploeg.special_tekort !== 'waarschuw' ? tekort * num(S.ploeg.hulp_uren) : 0;
  const hulpKost = hulpU * kM, hulpVerkoop = hulpKost / (1 - m);
  // international: customs and waiting at the border
  const intl = S.internationaal || {};
  const douaneN = (K.land_van === 'buiten' ? 1 : 0) + (K.land_naar === 'buiten' ? 1 : 0);
  const douaneKost = douaneN * num(intl.douane_kost);
  const douaneVerkoop = intl.douane_verkoop_modus === 'vast' ? douaneN * num(intl.douane_vast) : douaneKost / (1 - m);
  const grensU = douaneN * num(intl.grens_wacht_min) / 60;
  // time on site (crew elapsed time, without driving)
  const wachtU = num(K.wacht_min) / 60 + nStops * num(S.reis.stop_min) / 60 + grensU;
  const werk = ll + extra;
  const werkU = (werk + spU + dnU) / ploeg + wachtU;
  // driving, breaks and days
  const spitsF = K.spits ? 1 + num(S.reis.spits_pct) / 100 : 1;
  const rijMin = (num(K.route_min) + omrijMin) * spitsF, rijU = rijMin / 60;
  const routeKm = num(K.route_km) + omrijKm;
  const pauzeNa = Math.max(30, num(S.reis.pauze_na_min)), pauzeDuur = num(S.reis.pauze_min) / 60;
  const pauzesPerDag = minDag => Math.max(0, Math.ceil(minDag / pauzeNa - 1e-9) - 1);
  const maxRij = Math.max(60, num(S.reis.max_rijtijd_min));
  const V = K.venster || {};
  const hDag = vensterU(V.dag);
  const maxDag = Math.max(1, Math.min(num(S.arbeid.max_werkdag) || 24, hDag || Infinity));
  let dagen, doorloop, reisU, pauzeU, km, lokaalOnhaalbaar = false;
  if (modus === 'ja') {
    let d = Math.max(1, Math.ceil(rijMin / maxRij - 1e-9), Math.ceil((werkU + rijU) / maxDag - 1e-9));
    for (let i = 0; i < 5; i++) { const pz = d * pauzesPerDag(rijMin / d) * pauzeDuur; const d2 = Math.max(d, Math.ceil((werkU + rijU + pz) / maxDag - 1e-9)); if (d2 === d) break; d = d2; }
    dagen = d; pauzeU = dagen * pauzesPerDag(rijMin / dagen) * pauzeDuur;
    reisU = rijU; doorloop = werkU + rijU + pauzeU; km = routeKm;
  } else {
    const pzDag = pauzesPerDag(rijMin) * pauzeDuur;
    const cap = maxDag - rijU - pzDag;
    lokaalOnhaalbaar = rijMin > maxRij || cap < 1;
    dagen = Math.max(1, Math.ceil(werkU / Math.max(cap, 1) - 1e-9));
    pauzeU = dagen * pzDag; reisU = rijU * dagen; doorloop = werkU + dagen * (rijU + pzDag); km = routeKm * dagen;
  }
  const reis = reisU * (S.reis.per_man ? ploeg : 1);
  const pauzeMan = S.reis.pauze_betaald ? pauzeU * ploeg : 0;
  const betaald = doorloop - (S.reis.pauze_betaald ? 0 : pauzeU);
  const overPerManDag = Math.max(0, betaald / dagen - num(S.arbeid.dag_norm));
  const overU = overPerManDag * ploeg * dagen;
  const manBasis = werk + wachtU * ploeg + reis + pauzeMan;
  const man = manBasis + spU + dnU + hulpU;
  // time windows: loading and unloading at the main address must fit in their window
  const laadManU = hoofdLaad * fA / 2 / P * f + demMin / 60 + inpakMin / 60 + spU / 2;
  const losManU = hoofdLos * fB / 2 / P * f + monMin / 60 + uitpakMin / 60 + spU / 2 + dnU;
  const vensters = [];
  for (const [key, manU] of [['laden', laadManU], ['lossen', losManU]]) {
    const h = vensterU(V[key]); if (h === null) continue;
    const nodig = manU / ploeg;
    vensters.push({ key, van: V[key].van, tot: V[key].tot, h, nodig, ok: nodig <= h + 1e-9, ploegNodig: Math.max(1, Math.ceil(manU / h - 1e-9)) });
  }
  if (hDag !== null) vensters.push({ key: 'dag', van: V.dag.van, tot: V.dag.tot, h: hDag, nodig: doorloop / dagen, ok: true, ploegNodig: 0 });
  // labour (base, without special items, services and helpers)
  const tKost = num((S.arbeid.kost_toeslag || {})[K.tijdstip]) / 100;
  const kArbeid = manBasis * kM;
  const kOverwerk = overU * loonK * num(S.arbeid.overwerk_pct) / 100;
  const kTijdToeslag = man * loonK * tKost;
  // trucks
  const w = S.wagens.find(x => x.id === K.wagen) || S.wagens[0];
  const nW = Math.max(1, Math.round(num(K.wagens || 1)));
  const kmVerkoop = Math.max(0, km - num(S.reis.gratis_km));
  const wagUren = doorloop;
  const wagUrenB = Math.max(wagUren, num(S.comm.min_uren));
  const wg = wagenPrijs(w, nW, wagUren, wagUrenB, km, kmVerkoop, dagen, m);
  // furniture lift
  const liftU = K.lift_inzet ? num(K.lift_uren) : 0;
  const liftKost = liftU * num(S.lift.kost_uur);
  const halfHours = Math.ceil(Math.max(0, liftU - 1) * 2 - 1e-9);
  const liftVerkoop = !K.lift_inzet ? 0 : (S.lift.verkoop_modus === 'vast' ? num(S.lift.eerste_uur) + halfHours * num(S.lift.per_halfuur) : liftKost / (1 - m));
  // materials
  let matKost = 0, matVerkoop = 0;
  for (const x of (K.materiaal || [])) { const it = S.materiaal.find(y => y.id === x.id); if (!it) continue; matKost += num(x.n) * num(it.kost); matVerkoop += num(x.n) * (it.verkoop_modus === 'vast' ? num(it.verkoop) : num(it.kost) / (1 - m)); }
  // box delivery and collection
  const ritten = (K.dozen_leveren ? 1 : 0) + (K.dozen_ophalen ? 1 : 0);
  const dz = S.dozen || {}; const bus = S.wagens.find(x => x.id === dz.wagen) || w;
  const dozenKost = ritten * (num(dz.mannen) * num(dz.rit_min) / 60 * kM + num(bus.kost_uur) * num(dz.rit_min) / 60 + num(bus.kost_km) * num(dz.rit_km));
  const dozenVerkoop = dz.verkoop_modus === 'vast' ? ritten * num(dz.vast_rit) : dozenKost / (1 - m);
  // pass-through costs: third parties, costs per stop, tolls and ferry, accommodation, insurance premium
  const nachten = num(K.nachten) > 0 ? num(K.nachten) : (modus === 'ja' ? dagen - 1 : 0);
  const verblijf = nachten * ploeg * num(S.reis.hotel) + (nachten > 0 ? (nachten + 1) * ploeg * num(S.reis.dagvergoeding) : 0);
  const premie = num(K.verz_waarde) * num(S.verzekering.premie_pct) / 100;
  const doorbelast = num(K.derden) + stopKosten + num(K.tol) + verblijf + premie;
  const doorbelastVerkoop = S.reis.marge_op_doorbelast ? doorbelast / (1 - m) : doorbelast;
  const certificaat = K.certificaat ? num(S.verzekering.certificaat_prijs) : 0;
  // survey: acquisition cost per won job
  const tx = S.taxatie || {};
  const txMin = num(tx['min_' + K.taxatie]);
  const txKost = tx.meerekenen ? (txMin / 60 * kM + (K.taxatie === 'fysiek' ? num(tx.km_fysiek) * num(tx.km_kost) : 0)) / Math.max(0.05, num(tx.conversie_pct) / 100) : 0;
  // cost price
  const kostZonderReserve = kArbeid + kOverwerk + kTijdToeslag + hulpKost + wg.kost + liftKost + matKost + dozenKost + spKost + dnKost + douaneKost + doorbelast + txKost;
  const reserve = kostZonderReserve * num(S.verzekering.reserve_pct) / 100;
  const kost = kostZonderReserve + reserve;
  // risk buffer on the uncertain working hours
  const kWerk = werk * kM + werk / ploeg * num(w.kost_uur) * nW;
  const bufPct = num(S.comm['buffer_' + K.taxatie]);
  const buffer = bufPct / 100 * kWerk;
  // timing surcharge (selling price)
  const tPct = num(S.toeslag[K.tijdstip]) + (K.spoed ? num(S.toeslag.spoed) : 0), t = tPct / 100;
  const voorrij = num(S.reis.voorrij);
  // fixed price: labour with buffer and margin + every component at its own selling price
  const arbeidVast = (kArbeid + kOverwerk + kTijdToeslag + buffer) / (1 - m);
  const toeslagVast = t * kArbeid / (1 - m);
  const overigVast = (txKost + reserve) / (1 - m);
  const onderdelen = wg.verkoopVast + liftVerkoop + matVerkoop + dozenVerkoop + spVerkoop + dnVerkoop + hulpVerkoop + douaneVerkoop + doorbelastVerkoop + certificaat + voorrij;
  const vastExRaw = arbeidVast + toeslagVast + overigVast + onderdelen;
  // hourly rate
  const tm = tariefVerhuizer(S, prof.id);
  const manB = Math.max(manBasis, num(S.comm.min_uren) * ploeg);
  const overVerkoop = S.arbeid.overwerk_doorberekenen ? overU * tm * num(S.arbeid.overwerk_pct) / 100 : 0;
  const uurArbeid = manB * tm * (1 + t) + overVerkoop + hulpU * tm;
  const uurEx = uurArbeid + wg.verkoopUur + liftVerkoop + matVerkoop + dozenVerkoop + spVerkoop + dnVerkoop + douaneVerkoop + doorbelastVerkoop + certificaat + voorrij;
  return { prof, m, regime, btw, incl, P, ploeg, fA, fB, ll, extra, werk, spU, dnU, wachtU, werkU, rijMin, rijU, routeKm, reis, man, manBasis, doorloop, dagen, overU, kM, loonK,
    modus, overnacht: modus === 'ja', lokaalOnhaalbaar, pauzeU, maxDag, stops, nStops, stopLaadM3, stopLosM3, stopKosten, omrijMin, omrijKm, vensters,
    minSp, tekort, hulpU, hulpKost, hulpVerkoop, douaneN, douaneKost, douaneVerkoop, grensU,
    kArbeid, kOverwerk, kTijdToeslag, w, nW, km, kmVerkoop, wg, wagUren, liftU, liftKost, liftVerkoop, matKost, matVerkoop,
    ritten, dozenKost, dozenVerkoop, spKost, spVerkoop, spLijst, dnKost, dnVerkoop, dnLijst, nachten, verblijf, premie, doorbelast, doorbelastVerkoop, certificaat,
    txKost, reserve, kost, kWerk, bufPct, buffer, tPct, t, voorrij, arbeidVast, toeslagVast, overigVast, vastExRaw, tm, manB, overVerkoop, uurArbeid, uurEx };
}

// overnachten 'auto': return every day if the job fits in one day or that is cheaper, otherwise drive through with overnight stays
function kiesModus(S, K) {
  if (K.overnachten === 'ja' || K.overnachten === 'nee') return K.overnachten;
  const a = calcCore(S, K, 1, 'nee');
  if (a.dagen === 1 && !a.lokaalOnhaalbaar) return 'nee';
  const b = calcCore(S, K, 1, 'ja');
  if (a.lokaalOnhaalbaar) return 'ja';
  return b.kost < a.kost - 0.005 ? 'ja' : 'nee';
}

function afronden(S, b) {
  const afr = Math.max(num(S.comm.afronding), 0.01);
  const show = ex => b.incl ? ex * (1 + b.btw) : ex;
  let vastShow = Math.ceil(show(b.vastExRaw) / afr - 1e-9) * afr;
  const minShow = show(num(S.comm.min_prijs)); let minToegepast = false;
  if (vastShow < minShow) { vastShow = Math.ceil(minShow / afr - 1e-9) * afr; minToegepast = true; }
  const vastEx = b.incl ? vastShow / (1 + b.btw) : vastShow;
  return { vastShow, vastEx, minToegepast, show };
}

function advies(S, K) {
  // best combination of truck(s) and crew: feasible first (time windows, minimum crew), then fewest days, then lowest fixed price
  validateJobInput(K, S, { skipTruckAndCrew: true });
  K = Object.assign(clone(KLUS_EXTRA), K);
  const strikt = S.ploeg.special_tekort === 'waarschuw';
  const minSp = minPloegSpecials(S, K);
  const lo = Math.max(1, Math.round(num(S.ploeg.min))), hi = Math.max(lo, Math.round(num(S.ploeg.max)));
  let best = null;
  for (const w of S.wagens) {
    const cap = num(w.m3); if (cap <= 0) continue;
    const n = Math.max(1, Math.ceil(num(K.m3) / cap - 1e-9));
    for (let p = lo; p <= hi; p++) {
      const KK = Object.assign({}, K, { wagen: w.id, wagens: n, ploeg: p });
      const modus = kiesModus(S, KK);
      const b = calcCore(S, KK, 1, modus); const r = afronden(S, b);
      // shortfall: hours by which the time windows are exceeded, plus a penalty for a crew that is too small or an impossible day trip
      const tekort = b.vensters.reduce((s, v) => s + Math.max(0, v.nodig - v.h), 0) + (strikt && p < minSp.n ? (minSp.n - p) * 10 : 0) + (modus === 'nee' && b.lokaalOnhaalbaar ? 100 : 0);
      const c = { wagen: w.id, naam: w.naam, n, ploeg: p, prijs: r.vastShow, uren: b.doorloop, dagen: b.dagen, overnacht: b.overnacht, ok: tekort < 1e-9, tekort };
      const beter = !best || (c.ok && !best.ok) || (!c.ok && !best.ok && c.tekort < best.tekort - 1e-9) ||
        ((c.ok === best.ok && (c.ok || Math.abs(c.tekort - best.tekort) < 1e-9)) && (c.dagen < best.dagen || (c.dagen === best.dagen && c.prijs < best.prijs)));
      if (beter) best = c;
    }
  }
  return best;
}

function calc(S, K) {
  validateJobInput(K, S);
  K = Object.assign(clone(KLUS_EXTRA), K);
  const modus = kiesModus(S, K);
  const b = calcCore(S, K, 1, modus), up = calcCore(S, K, 1.2, modus), dn = calcCore(S, K, 0.8, modus);
  const r = afronden(S, b);
  const mV = x => r.vastEx > 0 ? (r.vastEx - x.kost) / r.vastEx : 0;
  const mU = x => x.uurEx > 0 ? (x.uurEx - x.kost) / x.uurEx : 0;
  const extraM3 = S.meerwerk.extra_m3_modus === 'vast' ? num(S.meerwerk.extra_m3_vast) : b.tm / b.P;
  const wachtKw = S.meerwerk.wacht_modus === 'vast' ? num(S.meerwerk.wacht_vast) : b.tm / 4;
  const opslagMnd = num(K.opslag_m3) * num(S.opslag.per_m3_maand);
  const opslagMaanden = num(K.opslag_m3) > 0 ? Math.max(num(K.opslag_maanden), num(S.opslag.min_maanden)) : 0;
  const opslagHandling = num(K.opslag_m3) * num(S.opslag.handling_m3) * 2;
  const warnings = [];
  if (mV(b) < num(S.comm.marge_drempel) / 100) warnings.push(MSG.marge(fmt1(mV(b) * 100), num(S.comm.marge_drempel)));
  if (b.tm < b.kM) warnings.push(MSG.tarief);
  if (b.wg.modus !== 'afgeleid' && b.wg.verkoopVast < b.wg.kost) warnings.push(MSG.wagen);
  if (r.minToegepast) warnings.push(MSG.min);
  if (num(b.w.m3) > 0 && num(K.m3) > num(b.w.m3) * b.nW) warnings.push(MSG.past(num(K.m3), b.nW, b.w.naam, num(b.w.m3) * b.nW));
  if (b.stopLaadM3 > num(K.m3) + 1e-9) warnings.push(MSG.stopsM3(b.stopLaadM3, num(K.m3), 'laad'));
  if (b.stopLosM3 > num(K.m3) + 1e-9) warnings.push(MSG.stopsM3(b.stopLosM3, num(K.m3), 'los'));
  if (b.tekort > 0) warnings.push(MSG.special(b.minSp.naam, b.minSp.n, b.ploeg, b.hulpU > 0, fmt1(num(S.ploeg.hulp_uren))));
  for (const v of b.vensters) if (!v.ok) warnings.push(MSG.venster(FASE[v.key], v.van, v.tot, fmt1(v.nodig), fmt1(v.h), v.ploegNodig, Math.round(num(S.ploeg.max))));
  if (b.overnacht && b.dagen > 1) warnings.push(MSG.lang(b.dagen, b.nachten, fmt1(b.rijU)));
  else if (b.dagen > 1) warnings.push(MSG.dag(fmt1(b.doorloop), fmt1(b.maxDag), b.dagen));
  if (!b.overnacht && b.lokaalOnhaalbaar) warnings.push(b.rijMin > num(S.reis.max_rijtijd_min) ? MSG.rij(Math.round(b.rijMin), num(S.reis.max_rijtijd_min)) : MSG.lokaal);
  if (b.overU > 0.05) warnings.push(MSG.overwerk(fmt1(b.overU)));
  const douaneOntbreekt = (S.internationaal || {}).douane_verkoop_modus === 'vast'
    ? (!num((S.internationaal || {}).douane_vast) || !num((S.internationaal || {}).douane_kost))
    : !num((S.internationaal || {}).douane_kost);
  if (b.douaneN > 0 && douaneOntbreekt) warnings.push(MSG.douane0);
  if (K.land_van !== 'nl' || K.land_naar !== 'nl') warnings.push(MSG.tacho);
  if (b.regime === 'nul') warnings.push(MSG.btw.nul);
  if (b.regime === 'verlegd') warnings.push(MSG.btw.verlegd);
  if (b.regime === 'buitenland') warnings.push(MSG.btw.buitenland(fmt1(num(K.btw_buitenland))));
  return Object.assign({}, b, {
    base: b, up, dn, vastShow: r.vastShow, vastEx: r.vastEx, minToegepast: r.minToegepast, show: r.show,
    margeVast: mV(b), margeVastUp: mV(up), margeVastDn: mV(dn), margeUur: mU(b),
    uurShow: r.show(b.uurEx), uurShowUp: r.show(up.uurEx), uurShowDn: r.show(dn.uurEx),
    kostShow: b.kost, extraM3, wachtKw, opslagMnd, opslagMaanden, opslagHandling, warnings, marge: b.m,
    modusAuto: !(K.overnachten === 'ja' || K.overnachten === 'nee')
  });
}
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let cachedDefaultSettings = null;

function getDefaultSettings() {
  if (!cachedDefaultSettings) {
    try {
      const settingsPath = path.join(__dirname, '../data/settings-v3.json');
      if (fs.existsSync(settingsPath)) {
        cachedDefaultSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } else {
        cachedDefaultSettings = clone(DEFAULTS);
      }
    } catch (e) {
      cachedDefaultSettings = clone(DEFAULTS);
    }
  }
  return clone(cachedDefaultSettings);
}

async function getActiveSettingsAsync() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const PricingSettings = mongoose.model('PricingSettings');
      const activeDoc = await PricingSettings.findOne({ isActive: true }).sort({ version: -1 }).lean();
      if (activeDoc && activeDoc.settings) {
        return clone(activeDoc.settings);
      }
    } catch (e) {
      // Fall through to file fallback
    }
  }
  return getDefaultSettings();
}

async function seedDefaultSettingsIfEmpty() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const PricingSettings = mongoose.model('PricingSettings');
      const count = await PricingSettings.countDocuments();
      if (count === 0) {
        const fileSettings = getDefaultSettings();
        await PricingSettings.create({
          version: 3,
          name: 'Official Pricing Engine v3 (Universal Movers)',
          description: 'Initial seeding of version 3 configurable settings',
          startDate: new Date('2026-01-01'),
          isActive: true,
          settings: fileSettings,
        });
        console.log('[PricingEngineV3] Seeded default version 3 settings into MongoDB.');
      }
    } catch (e) {
      console.warn('[PricingEngineV3 Seed Warning]:', e.message);
    }
  }
}

function resolveSettings(overrides = null) {
  const base = getDefaultSettings();
  if (!overrides || typeof overrides !== 'object') return base;
  const merged = deepMerge(base, overrides);
  for (const k of Object.keys(overrides)) {
    if (typeof overrides[k] === 'object' && overrides[k] !== null && !Array.isArray(overrides[k])) {
      merged[k] = Object.assign({}, base[k], overrides[k]);
    } else {
      merged[k] = overrides[k];
    }
  }
  return merged;
}

async function resolveSettingsAsync(overrides = null) {
  const base = await getActiveSettingsAsync();
  if (!overrides || typeof overrides !== 'object') return base;
  const merged = deepMerge(base, overrides);
  for (const k of Object.keys(overrides)) {
    if (typeof overrides[k] === 'object' && overrides[k] !== null && !Array.isArray(overrides[k])) {
      merged[k] = Object.assign({}, base[k], overrides[k]);
    } else {
      merged[k] = overrides[k];
    }
  }
  return merged;
}

function calculatePrice(job, settingsOverrides = null) {
  const S = resolveSettings(settingsOverrides);
  return calc(S, job);
}

function calculateAdvice(job, settingsOverrides = null) {
  const S = resolveSettings(settingsOverrides);
  return advies(S, job);
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULTS,
    PRESETS,
    KLUS_EXTRA,
    LEEG_ADRES,
    calc,
    calcCore,
    advies,
    kiesModus,
    kostManuur,
    deepMerge,
    clone,
    tariefVerhuizer,
    vensterU,
    getDefaultSettings,
    getActiveSettingsAsync,
    seedDefaultSettingsIfEmpty,
    resolveSettings,
    resolveSettingsAsync,
    calculatePrice,
    calculateAdvice,
    validateJobInput,
    PricingValidationError,
    isValidClockTime,
  };
}
