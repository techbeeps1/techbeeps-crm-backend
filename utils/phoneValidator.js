/**
 * Shared Phone & Mobile Validation, Normalization, and Dutch Name Parsing (Backend)
 * EXEC-12: Phone Number Normalization & Leading Zero Preservation (06... & Dutch Names)
 *
 * Requirements:
 * 1. Leading Zero Preservation: Dutch mobile (06...) and landlines (010, 020, 030, etc.)
 *    must strictly retain their leading '0'.
 * 2. International E.164 conversion: +31 6 12345678 -> +31612345678, 0031... -> +31...
 * 3. Legacy restoration: 9-digit numbers without leading zero (e.g. 612345678 or 201234567)
 *    are restored with prepended '0'.
 * 4. Dutch Name parsing: Handles particles/tussenvoegsels (van, de, der, den, van der, etc.)
 *    without truncating surnames.
 */

const DUTCH_TUSSENVOEGSELS = [
  'van der', 'van den', 'van de', 'van het', "van 't",
  'in het', "in 't", 'op het', "op 't", 'aan het', 'aan de',
  'bij de', 'bij het', "bij 't",
  'van', 'de', 'der', 'den', 'ter', 'ten', 'te', 'ver', "d'", "’s-"
];

/**
 * Validates whether the given value is a valid phone/mobile number.
 * Empty/blank values return true (fields are optional unless required at schema level).
 */
const validatePhoneNumber = (val) => {
  if (val === undefined || val === null) return true;
  const s = String(val).trim();
  if (s === '') return true;

  if (!/^(?:\+|00)?[0-9\s\-().]{7,25}$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

/**
 * Normalizes phone numbers while strictly preserving the leading zero.
 * Examples:
 * - "06 12345678" -> "0612345678"
 * - "020-1234567" -> "0201234567"
 * - "+31 6 1234 5678" -> "+31612345678"
 * - "0031 6 12345678" -> "+31612345678"
 * - 612345678 (9 digits, missing 0) -> "0612345678"
 */
const normalizePhoneNumber = (val) => {
  if (val === undefined || val === null) return '';
  const raw = String(val).trim();
  if (!raw) return '';

  const isPlus = raw.startsWith('+');
  const is00 = raw.startsWith('00');

  // Strip spaces, dashes, parentheses, dots
  const clean = raw.replace(/[\s\-\(\)\.]+/g, '');

  if (isPlus) {
    return clean; // e.g. "+31612345678"
  }

  if (is00) {
    return '+' + clean.slice(2); // e.g. "0031..." -> "+31..."
  }

  // If already starts with 0 (e.g. 06..., 020...), preserve leading zero!
  if (clean.startsWith('0')) {
    return clean;
  }

  // Restore leading zero if corrupted by previous numeric casting (9 digits)
  // Dutch mobile: 6xxxxxxxx -> 06xxxxxxxx
  // Dutch landlines: 10xxxxxxx to 89xxxxxxx -> 010xxxxxxx to 089xxxxxxx
  if (/^[1-9]\d{8}$/.test(clean)) {
    return '0' + clean;
  }

  return clean;
};

/**
 * Formats normalized phone number for human-readable display.
 * - "0612345678" -> "06 12345678"
 * - "+31612345678" -> "+31 6 12345678"
 * - "0201234567" -> "020 1234567"
 */
const formatPhoneNumber = (val) => {
  const norm = normalizePhoneNumber(val);
  if (!norm) return '';

  if (/^06\d{8}$/.test(norm)) {
    return `${norm.slice(0, 2)} ${norm.slice(2)}`;
  }
  if (/^\+316\d{8}$/.test(norm)) {
    return `+31 6 ${norm.slice(4)}`;
  }
  if (/^0(10|13|15|20|23|24|26|30|33|35|36|38|40|43|45|46|50|53|55|58|70|71|72|73|74|75|76|77|78|79)\d{7}$/.test(norm)) {
    return `${norm.slice(0, 3)} ${norm.slice(3)}`;
  }
  return norm;
};

/**
 * Dutch Name Parser (tussenvoegsel-aware).
 * Correctly splits full names into first name, tussenvoegsel prefix, and last name.
 * Example:
 * - "Jan van den Berg" -> { firstName: "Jan", prefix: "van den", lastName: "Berg", surname: "van den Berg" }
 * - "Peter de Wit"     -> { firstName: "Peter", prefix: "de", lastName: "Wit", surname: "de Wit" }
 * - "John Doe"         -> { firstName: "John", prefix: "", lastName: "Doe", surname: "Doe" }
 */
const parseDutchName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: '', lastName: '', prefix: '', surname: '', fullName: '' };
  }

  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: '', lastName: '', prefix: '', surname: '', fullName: '' };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
      prefix: '',
      surname: '',
      fullName: parts[0]
    };
  }

  const firstName = parts[0];
  const rest = parts.slice(1).join(' ');

  let prefix = '';
  let lastName = rest;

  const restLower = rest.toLowerCase();
  for (const tv of DUTCH_TUSSENVOEGSELS) {
    if (restLower === tv || restLower.startsWith(tv + ' ')) {
      prefix = rest.slice(0, tv.length);
      lastName = rest.slice(tv.length).trim();
      break;
    }
  }

  return {
    firstName,
    prefix,
    lastName,
    surname: rest, // Full surname including prefix (e.g. "van den Berg")
    fullName: trimmed
  };
};

/**
 * Combines Dutch name components into a single clean string.
 */
const formatDutchName = (firstName, lastName, prefix = '') => {
  const parts = [];
  if (firstName && firstName.trim()) parts.push(firstName.trim());
  if (prefix && prefix.trim()) parts.push(prefix.trim());
  if (lastName && lastName.trim()) parts.push(lastName.trim());
  return parts.join(' ');
};

module.exports = {
  DUTCH_TUSSENVOEGSELS,
  validatePhoneNumber,
  normalizePhoneNumber,
  formatPhoneNumber,
  parseDutchName,
  formatDutchName,
};
