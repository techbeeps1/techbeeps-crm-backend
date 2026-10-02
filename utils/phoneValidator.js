/**
 * Shared Phone & Mobile Validation Helper (Backend)
 * UM-009: Reconcile telephone and mobile validation across forms
 */

const validatePhoneNumber = (val) => {
  if (!val || typeof val !== 'string' || val.trim() === '') return true; // optional
  const s = val.trim();
  if (!/^(?:\+|00)?[0-9\s\-().]{7,25}$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

const normalizePhoneNumber = (val) => {
  if (!val || typeof val !== 'string') return '';
  return val.trim();
};

module.exports = {
  validatePhoneNumber,
  normalizePhoneNumber,
};
