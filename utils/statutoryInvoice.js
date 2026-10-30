const { roundToCents, calculateCommercialTotals } = require('./moneyCalculator');
const { resolveTaxRate } = require('./taxCatalog');

const APPROVED_COMPANY_DETAILS = {
  companyName: 'Universal Movers B.V.',
  companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
  companyState: 'Noord-Holland, Amsterdam',
  companyPostalCode: '1096 AK',
  companyCountry: 'Netherlands',
  companyEmail: 'info@universalmovers.nl',
  companyPhone: '+31 20 123 4567',
  companyWebsite: 'https://universalmovers.nl',
  companyRegNumber: '81234567',
  companyVatNumber: 'NL861234567B01',
  companyTaxNumber: 'NL861234567B01',
  kvkNumber: '81234567',
  btwNumber: 'NL861234567B01',
  bankName: 'ABN AMRO Bank',
  iban: 'NL91 ABNA 0417 1643 00',
  bic: 'ABNANL2A',
  logoUrl: 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png',
};

const { formatAmsterdamDate } = require('./timezoneUtil');

function formatDutchDate(val) {
  return formatAmsterdamDate(val);
}

function formatCustomerAddress(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (Array.isArray(addr)) {
    if (addr.length === 0) return '';
    addr = addr[0];
  }
  if (typeof addr === 'object' && addr !== null) {
    const street = [addr.street, addr.houseNumber, addr.addition].filter(Boolean).join(' ');
    const zip = addr.postcode || addr.postalCode || '';
    const postCity = [zip, addr.city].filter(Boolean).join(' ');
    const parts = [
      street,
      postCity,
      addr.country || 'Netherlands'
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  }
  return String(addr);
}

function computeStatutoryTaxBreakdown(items = [], subTotal = 0, discountAmount = 0) {
  const breakdownMap = {};

  (items || []).forEach(item => {
    const rate = resolveTaxRate ? resolveTaxRate(item.btw) : (Number(item.btw) || 0);
    const rawQty = item.quantity;
    const qty = (rawQty !== undefined && rawQty !== null && rawQty !== '') ? Number(rawQty) : 0;
    const rawPrice = item.price;
    const price = (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') ? Number(rawPrice) : 0;
    const lineTotal = roundToCents(qty * price);

    if (!breakdownMap[rate]) {
      breakdownMap[rate] = {
        rate,
        grossBase: 0,
      };
    }
    breakdownMap[rate].grossBase = roundToCents(breakdownMap[rate].grossBase + lineTotal);
  });

  const rates = Object.keys(breakdownMap).sort((a, b) => Number(b) - Number(a));
  const subTotalNum = Number(subTotal) || 0;
  const discNum = Number(discountAmount) || 0;

  return rates.map(rateStr => {
    const rate = Number(rateStr);
    const gross = breakdownMap[rateStr].grossBase;
    const proportion = subTotalNum > 0 ? (gross / subTotalNum) : 0;
    const netBase = roundToCents(gross - (discNum * proportion));
    const vatAmount = roundToCents(netBase * (rate / 100));
    const grossAmount = roundToCents(netBase + vatAmount);

    let rateLabel = `${rate}% Btw`;
    if (rate === 21) {
      rateLabel = '21% (Standaard tarief)';
    } else if (rate === 9) {
      rateLabel = '9% (Verlaagd tarief)';
    } else if (rate === 0) {
      rateLabel = '0% (Vrijgesteld / Btw verlegd)';
    }

    return {
      rate,
      rateLabel,
      grossBase: gross,
      netBase,
      vatAmount,
      grossAmount,
    };
  });
}

function generateBtwSpecificationHtml(breakdown = [], sym = '€', fmtFn) {
  if (!breakdown || breakdown.length === 0) return '';
  const fmt = fmtFn || ((n) => `${sym} ${Number(n || 0).toFixed(2)}`);

  const rows = breakdown.map(b => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 6px 8px;">${b.rateLabel}</td>
      <td style="padding: 6px 8px; text-align: right;">${fmt(b.netBase)}</td>
      <td style="padding: 6px 8px; text-align: right;">${fmt(b.vatAmount)}</td>
      <td style="padding: 6px 8px; text-align: right;">${fmt(b.grossAmount)}</td>
    </tr>
  `).join('');

  return `
    <div style="margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #fafafa;">
      <div style="padding: 6px 10px; background: #f1f5f9; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #334155;">
        Btw-Specificatie (Belastingdienst Statutory Breakdown)
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #64748b;">
            <th style="padding: 6px 8px; text-align: left;">Btw-Tarief</th>
            <th style="padding: 6px 8px; text-align: right;">Grondslag (Netto)</th>
            <th style="padding: 6px 8px; text-align: right;">Btw-Bedrag</th>
            <th style="padding: 6px 8px; text-align: right;">Totaal incl. Btw</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function generatePaymentInstructionsHtml(company = {}, sym = '€') {
  const c = { ...APPROVED_COMPANY_DETAILS, ...company };
  return `
    <div style="margin-top: 15px; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; font-size: 11px; line-height: 1.5; color: #334155;">
      <strong>Betalingsinstructies (Payment Details):</strong><br/>
      Bank: <strong>${c.bankName}</strong> &bull; IBAN: <strong>${c.iban}</strong> &bull; BIC/SWIFT: <strong>${c.bic}</strong><br/>
      KVK-nummer: <strong>${c.kvkNumber || c.companyRegNumber}</strong> &bull; Btw-identificatienummer: <strong>${c.btwNumber || c.companyVatNumber}</strong>
    </div>
  `;
}

function generateTotalsBreakdownHtml(invoice = {}, sym = '€', fmtFn) {
  const fmt = fmtFn || ((n) => `${sym} ${Number(n || 0).toFixed(2)}`);
  const subTotal = Number(invoice.subTotal !== undefined ? invoice.subTotal : (invoice.subtotal || 0));
  const discountPct = Number(invoice.discount || 0);
  const discountedPrice = Number(invoice.discountedPrice !== undefined ? invoice.discountedPrice : (discountPct > 0 ? (subTotal * discountPct / 100) : 0));
  const net = Number(invoice.net !== undefined ? invoice.net : (subTotal - discountedPrice));
  const btw = Number(invoice.btw !== undefined ? invoice.btw : (invoice.totalVat || 0));
  const total = Number(invoice.total !== undefined ? invoice.total : (net + btw));

  const hasDiscount = discountPct > 0 || discountedPrice > 0;

  return `
    <div class="totals-card" style="margin-left: auto; width: 300px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 25px; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
        <span>Subtotal (Excl. BTW):</span>
        <span style="font-weight: 600; color: #1e293b;">${fmt(subTotal)}</span>
      </div>
      ${hasDiscount ? `
      <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: #dc2626;">
        <span>Discount (${discountPct}%):</span>
        <span style="font-weight: 600;">-${fmt(discountedPrice)}</span>
      </div>
      <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569; border-top: 1px dashed #cbd5e1; margin-top: 2px; padding-top: 4px;">
        <span>Net Taxable Base:</span>
        <span style="font-weight: 600; color: #1e293b;">${fmt(net)}</span>
      </div>
      ` : ''}
      <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
        <span>BTW (Tax):</span>
        <span style="font-weight: 600; color: #1e293b;">+${fmt(btw)}</span>
      </div>
      <div class="total-row grand" style="display: flex; justify-content: space-between; border-top: 2px solid #3c50e0; margin-top: 8px; padding-top: 8px; font-size: 15px; font-weight: 800; color: #0f172a;">
        <span>Total Amount:</span>
        <span>${fmt(total)}</span>
      </div>
    </div>
  `;
}

module.exports = {
  APPROVED_COMPANY_DETAILS,
  formatDutchDate,
  formatCustomerAddress,
  computeStatutoryTaxBreakdown,
  generateBtwSpecificationHtml,
  generatePaymentInstructionsHtml,
  generateTotalsBreakdownHtml,
};
