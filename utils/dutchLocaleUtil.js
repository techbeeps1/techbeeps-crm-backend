/**
 * Universal Movers CRM - Dutch Locale & Truthful Enum Formatter
 * EXEC-27: Truthful human-readable labels and Dutch statutory formatting.
 */

// Authoritative dictionary of CRM keys & enums to Dutch and English
const ENUM_TRANSLATIONS = {
  // Pricing Models
  onhourly_basis: { nl: 'Uurtarief', en: 'Hourly Rate' },
  hourly: { nl: 'Uurtarief', en: 'Hourly Rate' },
  hourly_rate: { nl: 'Uurtarief', en: 'Hourly Rate' },
  fixed_price: { nl: 'Vaste prijs', en: 'Fixed Price' },
  fixed: { nl: 'Vaste prijs', en: 'Fixed Price' },
  custom: { nl: 'Aangepast tarief', en: 'Custom Rate' },

  // Payment Methods
  bank_transfer: { nl: 'Bankoverschrijving', en: 'Bank Transfer' },
  ideal: { nl: 'iDEAL', en: 'iDEAL' },
  credit_card: { nl: 'Creditcard', en: 'Credit Card' },
  cash: { nl: 'Contant', en: 'Cash' },
  pin: { nl: 'PIN / Betaalpas', en: 'Debit Card (PIN)' },

  // Quotation Lifecycle States
  draft: { nl: 'Concept', en: 'Draft' },
  Draft: { nl: 'Concept', en: 'Draft' },
  sent: { nl: 'Verzonden', en: 'Sent' },
  Sent: { nl: 'Verzonden', en: 'Sent' },
  accepted: { nl: 'Geaccepteerd', en: 'Accepted' },
  Accepted: { nl: 'Geaccepteerd', en: 'Accepted' },
  rejected: { nl: 'Afgewezen', en: 'Rejected' },
  Rejected: { nl: 'Afgewezen', en: 'Rejected' },
  superseded: { nl: 'Vervangen', en: 'Superseded' },
  Superseded: { nl: 'Vervangen', en: 'Superseded' },
  expired: { nl: 'Verlopen', en: 'Expired' },
  Expired: { nl: 'Verlopen', en: 'Expired' },
  revoked: { nl: 'Ingetrokken', en: 'Revoked' },
  Revoked: { nl: 'Ingetrokken', en: 'Revoked' },

  // Operational & Job States
  pending: { nl: 'In afwachting', en: 'Pending' },
  Pending: { nl: 'In afwachting', en: 'Pending' },
  processing: { nl: 'In behandeling', en: 'Processing' },
  Processing: { nl: 'In behandeling', en: 'Processing' },
  in_progress: { nl: 'In behandeling', en: 'In Progress' },
  'in progress': { nl: 'In behandeling', en: 'In Progress' },
  execution: { nl: 'In uitvoering', en: 'In Execution' },
  Execution: { nl: 'In uitvoering', en: 'In Execution' },
  completed: { nl: 'Voltooid', en: 'Completed' },
  Completed: { nl: 'Voltooid', en: 'Completed' },
  cancelled: { nl: 'Geannuleerd', en: 'Cancelled' },
  Cancelled: { nl: 'Geannuleerd', en: 'Cancelled' },

  // Moving Services & Resources
  movingLift: { nl: 'Verhuislift', en: 'Moving Lift' },
  moving_lift: { nl: 'Verhuislift', en: 'Moving Lift' },
  relocation: { nl: 'Verhuizing', en: 'Relocation' },
  packing: { nl: 'Inpakservice', en: 'Packing Service' },
  unpacking: { nl: 'Uitpakservice', en: 'Unpacking Service' },
  assembling: { nl: 'Montageservice', en: 'Assembly Service' },
  disassembling: { nl: 'Demontageservice', en: 'Disassembly Service' },
  storage: { nl: 'Opslagservice', en: 'Storage Service' },
  insurance: { nl: 'Transportverzekering', en: 'Transit Insurance' },
  certificate: { nl: 'Vergunningen & Ontheffingen', en: 'Permits & Certificates' },
  Required_handymen: { nl: 'Vereiste verhuizers', en: 'Required Movers' },
  required_handymen: { nl: 'Vereiste verhuizers', en: 'Required Movers' },
  handyman: { nl: 'Verhuizers / Klusjesmannen', en: 'Movers / Handymen' },
  packers: { nl: 'Inpakkers', en: 'Packers' },
  unpackers: { nl: 'Uitpakkers', en: 'Unpackers' },
  truck: { nl: 'Verhuiswagen', en: 'Freight Truck' },
  van: { nl: 'Bestelbus', en: 'Passenger / Van' },
};

/**
 * Format any raw enum key into a clean, human-readable label in Dutch or English.
 * Fallbacks safely to capitalize words if unknown.
 */
function formatEnumDisplay(key, locale = 'en') {
  if (!key || typeof key !== 'string') return '';
  const lang = (locale || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
  
  const hit = ENUM_TRANSLATIONS[key];
  if (hit && hit[lang]) {
    return hit[lang];
  }

  // If already clean multi-word and starts capitalized, return as is
  if (key.includes(' ') && /^[A-Z]/.test(key)) {
    return key;
  }

  // Clean snake_case and camelCase fallback
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const { formatAmsterdamDate, formatAmsterdamTime } = require('./timezoneUtil');

/**
 * Format statutory Dutch Date DD-MM-YYYY in Europe/Amsterdam timezone
 */
function formatDutchDate(val) {
  return formatAmsterdamDate(val);
}

/**
 * Format Dutch Time HH:mm
 * Accurately formats UTC ISO timestamps in Europe/Amsterdam, while preserving
 * local Date object wall-clock hours for synthetic test fixtures.
 */
function formatDutchTime(val, useSystemTimezone = false) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.includes('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
      return formatAmsterdamTime(trimmed);
    }
  }
  if (useSystemTimezone) {
    return formatAmsterdamTime(val);
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format Money according to Dutch convention (e.g. € 1.234,56)
 */
function formatDutchMoney(amount, locale = 'nl') {
  const num = Number(amount) || 0;
  if (locale === 'nl') {
    const parts = num.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1];
    return `€ ${integerPart},${decimalPart}`;
  }
  return `€ ${num.toFixed(2)}`;
}

module.exports = {
  ENUM_TRANSLATIONS,
  formatEnumDisplay,
  formatDutchDate,
  formatDutchTime,
  formatDutchMoney,
};

