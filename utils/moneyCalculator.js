/**
 * Authoritative Commercial Money Calculation Contract (EXEC-15)
 * Standardized arithmetic engine conforming strictly to Dutch statutory commercial invoicing & VAT rules.
 * 
 * Rules:
 * 1. Decimal-safe cents rounding at approved boundaries (Math.round(x * 100) / 100).
 * 2. Strict zero preservation: 0 is a valid quantity or price; never fall back to 1.
 * 3. Supports both 'exclusive' (Net base) and 'inclusive' (Gross base) VAT treatments.
 * 4. Multi-tier VAT support (21% standard, 9% reduced, 0% reverse/exempt).
 * 5. Proportional discount allocation across tax tiers.
 */

const { resolveTaxRate, resolveTaxCode } = require('./taxCatalog');

function roundToCents(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  return Number((Math.round(amount * 100) / 100).toFixed(2));
}

function parseRate(rate) {
  return resolveTaxRate(rate);
}

function calculateCommercialTotals(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const rawVat = String(payload.vat || payload.vatType || '').toLowerCase();
  const isInclusive = rawVat === 'inclusive';
  
  // 1. Calculate raw item amounts and subtotal
  let grossSubtotal = 0;
  const processedItems = items.map(rawItem => {
    const item = (rawItem && typeof rawItem.toObject === 'function')
      ? rawItem.toObject()
      : (rawItem && rawItem._doc ? { ...rawItem._doc } : (rawItem || {}));
    const rawQty = item.quantity;
    const qty = (rawQty !== undefined && rawQty !== null && rawQty !== '') ? Number(rawQty) : 0;
    const rawPrice = item.price;
    const price = (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') ? Number(rawPrice) : 0;
    const lineTotal = roundToCents(qty * price);
    grossSubtotal += lineTotal;
    
    return {
      ...item,
      quantity: isNaN(qty) ? 0 : qty,
      price: isNaN(price) ? 0 : price,
      lineTotal,
      btw: item.btw !== undefined && item.btw !== null ? String(item.btw) : '21',
      description: item.description !== undefined && item.description !== null
        ? String(item.description)
        : (item.salesgroup && typeof item.salesgroup === 'object' && item.salesgroup.name ? item.salesgroup.name : '')
    };
  });
  
  grossSubtotal = roundToCents(grossSubtotal);
  
  // 2. Discount handling
  let discountPct = 0;
  if (payload.discount !== undefined && payload.discount !== null && payload.discount !== '') {
    discountPct = Number(payload.discount);
    if (isNaN(discountPct)) discountPct = 0;
  }
  
  let discountAmount = 0;
  if (discountPct > 0) {
    discountAmount = roundToCents(grossSubtotal * (discountPct / 100));
  } else if (payload.discountedPrice !== undefined && payload.discountedPrice !== null && Number(payload.discountedPrice) > 0) {
    discountAmount = roundToCents(Number(payload.discountedPrice));
    if (grossSubtotal > 0) {
      discountPct = roundToCents((discountAmount / grossSubtotal) * 100);
    }
  }

  // Cap discount at grossSubtotal
  if (discountAmount > grossSubtotal) {
    discountAmount = grossSubtotal;
  }

  const discountFactor = grossSubtotal > 0 ? (1 - (discountAmount / grossSubtotal)) : 1;

  // 3. Tax and Net calculation
  let totalNet = 0;
  let totalVat = 0;
  let totalPayable = 0;

  if (isInclusive) {
    // INCLUSIVE: Items already include VAT
    totalPayable = roundToCents(grossSubtotal - discountAmount);
    let sumNet = 0;
    processedItems.forEach(item => {
      const discountedGross = item.lineTotal * discountFactor;
      const vatRate = parseRate(item.btw);
      const itemNet = discountedGross / (1 + (vatRate / 100));
      sumNet += itemNet;
    });

    totalNet = roundToCents(sumNet);
    totalVat = roundToCents(totalPayable - totalNet);
  } else {
    // EXCLUSIVE: Items are Net, VAT is added on top
    const discountedBase = roundToCents(grossSubtotal - discountAmount);
    totalNet = discountedBase;

    let sumVat = 0;
    processedItems.forEach(item => {
      const discountedNet = item.lineTotal * discountFactor;
      const vatRate = parseRate(item.btw);
      const itemVat = discountedNet * (vatRate / 100);
      sumVat += itemVat;
    });

    totalVat = roundToCents(sumVat);
    totalPayable = roundToCents(totalNet + totalVat);
  }

  return {
    items: processedItems,
    vat: isInclusive ? 'inclusive' : 'exclusive',
    subTotal: grossSubtotal,
    discount: discountPct,
    discountedPrice: discountAmount,
    btw: totalVat.toFixed(2),
    total: totalPayable,
    net: totalNet,
    totalVat,
  };
}

module.exports = {
  roundToCents,
  parseRate,
  calculateCommercialTotals,
};
