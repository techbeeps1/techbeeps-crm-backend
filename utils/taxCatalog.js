/**
 * EXEC-19: Unified Tax Catalogue & Discount Allocation Engine (Backend)
 * 
 * Defines standard Dutch tax codes and treatments:
 * - 21%: Standard rate (Standaard tarief) - General moving, transport & storage
 * - 9%: Reduced rate (Verlaagd tarief) - Specific designated services
 * - 0% (Reverse Charge): BTW verlegd - B2B cross-border within EU
 * - 0% (Exempt): Vrijgesteld van BTW - Statutory exemptions
 * - 0% (Export): Nultarief / Export - Relocations to non-EU destinations
 */

const TAX_CATALOG = {
  standard_21: {
    id: 'standard_21',
    rate: 21,
    code: '21',
    label: '21% - Standaard tarief',
    shortLabel: '21% (Standard)',
    treatment: 'STANDARD',
    description: 'Standard Dutch VAT rate applicable to moving and storage services',
  },
  reduced_9: {
    id: 'reduced_9',
    rate: 9,
    code: '9',
    label: '9% - Verlaagd tarief',
    shortLabel: '9% (Reduced)',
    treatment: 'REDUCED',
    description: 'Reduced Dutch VAT rate applicable to specific designated items',
  },
  reverse_charge_0: {
    id: 'reverse_charge_0',
    rate: 0,
    code: '0_RC',
    label: '0% - BTW verlegd (Reverse charge)',
    shortLabel: '0% (Reverse Charge)',
    treatment: 'REVERSE_CHARGE',
    description: 'VAT shifted to EU business customer with verified VAT identification',
  },
  exempt_0: {
    id: 'exempt_0',
    rate: 0,
    code: '0_EX',
    label: '0% - Vrijgesteld (Exempt)',
    shortLabel: '0% (Exempt)',
    treatment: 'EXEMPT',
    description: 'Statutory VAT exemption under Dutch tax code',
  },
  export_0: {
    id: 'export_0',
    rate: 0,
    code: '0_EXP',
    label: '0% - Nultarief / Export (Outside EU)',
    shortLabel: '0% (Export)',
    treatment: 'ZERO_EXPORT',
    description: '0% export rating for international moves outside the European Union',
  },
  zero_0: {
    id: 'zero_0',
    rate: 0,
    code: '0',
    label: '0% - Geen BTW / Nultarief',
    shortLabel: '0% (Zero)',
    treatment: 'ZERO',
    description: 'Standard 0% zero rate',
  },
};

/**
 * Returns list of tax options for dropdown selectors in invoices and quotes.
 */
function getStandardTaxOptions() {
  return Object.values(TAX_CATALOG);
}

/**
 * Resolves any tax input (percentage number, string, or code) to a numeric percentage (21, 9, 0).
 */
function resolveTaxRate(input) {
  if (input === undefined || input === null || input === '') return 21;

  // Direct match in catalog by key or code
  const clean = String(input).trim().toLowerCase();
  if (TAX_CATALOG[clean]) return TAX_CATALOG[clean].rate;

  for (const item of Object.values(TAX_CATALOG)) {
    if (item.code.toLowerCase() === clean || String(item.rate) === clean) {
      return item.rate;
    }
  }

  // Handle strings like "21%", "9%", "0"
  const parsed = parseFloat(clean.replace('%', ''));
  if (!isNaN(parsed)) {
    if (parsed >= 15) return 21;
    if (parsed >= 5) return 9;
    return 0;
  }

  return 21;
}

/**
 * Resolves human-readable label for invoices, PDFs, and accounting exports.
 */
function resolveTaxLabel(input) {
  const clean = String(input || '').trim().toLowerCase();
  if (TAX_CATALOG[clean]) return TAX_CATALOG[clean].label;

  for (const item of Object.values(TAX_CATALOG)) {
    if (item.code.toLowerCase() === clean || String(item.rate) === clean) {
      return item.label;
    }
  }

  const rate = resolveTaxRate(input);
  if (rate === 21) return '21% - Standaard tarief';
  if (rate === 9) return '9% - Verlaagd tarief';
  return '0% - Geen BTW';
}

/**
 * Resolves standard tax ID ('standard_21', 'reduced_9', 'reverse_charge_0', etc.)
 */
function resolveTaxCode(input) {
  const clean = String(input || '').trim().toLowerCase();
  if (TAX_CATALOG[clean]) return TAX_CATALOG[clean].id;

  for (const item of Object.values(TAX_CATALOG)) {
    if (item.code.toLowerCase() === clean) return item.id;
  }

  const rate = resolveTaxRate(input);
  if (rate === 21) return 'standard_21';
  if (rate === 9) return 'reduced_9';
  return 'reverse_charge_0';
}

module.exports = {
  TAX_CATALOG,
  getStandardTaxOptions,
  resolveTaxRate,
  resolveTaxLabel,
  resolveTaxCode,
};
