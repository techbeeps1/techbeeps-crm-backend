/**
 * Universal Movers CRM - Authoritative Europe/Amsterdam Timezone Standard
 * EXEC-29: Separate timestamp instants from date-only calendar values.
 * 
 * Rules:
 * 1. Authoritative timezone is strictly 'Europe/Amsterdam' (CET UTC+1 in winter, CEST UTC+2 in summer).
 * 2. Date-only fields (e.g., invoice date, quote date, birth dates, leave dates) represent pure
 *    calendar days (YYYY-MM-DD) and MUST NOT undergo timezone conversion or midnight shifting.
 * 3. Timestamp instants (e.g., appointments, task schedules, audit logs) represent moments in time
 *    and format authoritatively in Europe/Amsterdam.
 */

const AMSTERDAM_TIMEZONE = 'Europe/Amsterdam';

/**
 * Checks whether a given string is a pure date-only string (e.g. YYYY-MM-DD or DD-MM-YYYY)
 */
function isDateOnlyString(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{2}-\d{2}-\d{4}$/.test(trimmed);
}

/**
 * Normalizes any date input into a clean YYYY-MM-DD calendar date string.
 * Immune to browser / server timezone offsets.
 */
function normalizeDateOnly(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      const [dd, mm, yyyy] = trimmed.split('-');
      return `${yyyy}-${mm}-${dd}`;
    }
    // If it's an ISO string like "2026-10-29T00:00:00.000Z", extract date part directly
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.split('T')[0];
    }
  }

  // If it's a Date object, format using Amsterdam timezone
  if (val instanceof Date && !isNaN(val.getTime())) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: AMSTERDAM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(val);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  return String(val);
}

/**
 * Formats statutory Dutch date (DD-MM-YYYY) in Europe/Amsterdam timezone.
 * Date-only strings are parsed directly without UTC midnight rollback.
 */
function formatAmsterdamDate(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [yyyy, mm, dd] = trimmed.split('-');
      return `${dd}-${mm}-${yyyy}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z?$/.test(trimmed)) {
      const [yyyy, mm, dd] = trimmed.split('T')[0].split('-');
      return `${dd}-${mm}-${yyyy}`;
    }
  }

  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AMSTERDAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  return `${day}-${month}-${year}`;
}

/**
 * Formats time (HH:mm) in Europe/Amsterdam timezone.
 */
function formatAmsterdamTime(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: AMSTERDAM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Formats date and time (DD-MM-YYYY HH:mm) in Europe/Amsterdam timezone.
 */
function formatAmsterdamDateTime(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);

  const datePart = formatAmsterdamDate(d);
  const timePart = formatAmsterdamTime(d);
  return `${datePart} ${timePart}`;
}

/**
 * Converts local Amsterdam wall-clock date (YYYY-MM-DD) and time (HH:mm)
 * into a UTC Date instant, correctly applying Winter (+01:00) vs Summer (+02:00) DST offsets.
 */
function toAmsterdamUtcInstant(dateStr, timeStr = '00:00') {
  const normDate = normalizeDateOnly(dateStr);
  const [yyyy, mm, dd] = normDate.split('-').map(Number);
  const [hh, min] = timeStr.split(':').map(Number);

  // Approximate UTC instant
  let target = new Date(Date.UTC(yyyy, mm - 1, dd, hh, min, 0));

  // Determine Amsterdam offset at this instant by comparing UTC representation with Amsterdam parts
  const getAmsterdamHour = (date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: AMSTERDAM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    return { hour: h, day: d };
  };

  // Adjust for DST offset (either +1 or +2 hours ahead of UTC)
  for (let i = 0; i < 3; i++) {
    const ams = getAmsterdamHour(target);
    const hourDiff = (ams.day === dd ? ams.hour : ams.hour + (ams.day > dd ? 24 : -24)) - hh;
    if (hourDiff === 0) break;
    target = new Date(target.getTime() - hourDiff * 3600 * 1000);
  }

  return target;
}

/**
 * Validates whether a given ISO date represents an active Europe/Amsterdam offset (either +01:00 or +02:00)
 */
function getAmsterdamOffsetHours(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const utcParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    hour12: false,
  }).format(d);
  const amsParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: AMSTERDAM_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(d);

  const diff = Number(amsParts) - Number(utcParts);
  return (diff + 24) % 24; // Returns 1 (CET) or 2 (CEST)
}

module.exports = {
  AMSTERDAM_TIMEZONE,
  isDateOnlyString,
  normalizeDateOnly,
  formatAmsterdamDate,
  formatAmsterdamTime,
  formatAmsterdamDateTime,
  toAmsterdamUtcInstant,
  getAmsterdamOffsetHours,
};

