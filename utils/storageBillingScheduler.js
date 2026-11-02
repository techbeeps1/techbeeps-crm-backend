const Storage = require('../models/Resources/storageModel');
const Invoice = require('../models/invoice');
const mongoose = require('mongoose');

/**
 * Returns formatted month label: e.g. "2026-11" -> "November 2026"
 */
function getPeriodLabel(periodKey) {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const date = new Date(year, month, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Generates an array of monthly period keys (YYYY-MM) between startDate and endDate
 */
function generateMonthlyPeriodKeys(startDate, endDate) {
  const keys = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return keys;
  }

  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  return keys;
}

/**
 * Computes billing line amounts for a storage unit
 */
function computeStoragePeriodAmount(storage) {
  const basePrice = Number(storage.price) || 0;
  const isPerVolume = Boolean(storage.invoicePerVolume);
  const volume = Number(storage.totalVolume) || Number(storage.cubicMeter) || 1;
  const effectiveBase = isPerVolume ? Math.round(basePrice * volume * 100) / 100 : basePrice;

  const vatRate = storage.vatPercentage !== null && storage.vatPercentage !== undefined 
    ? Number(storage.vatPercentage) 
    : 21;

  let subtotal = 0;
  let vatAmount = 0;
  let total = 0;

  if (storage.includingVat === 'Including VAT') {
    total = effectiveBase;
    subtotal = Math.round((total / (1 + vatRate / 100)) * 100) / 100;
    vatAmount = Math.round((total - subtotal) * 100) / 100;
  } else {
    subtotal = effectiveBase;
    vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    total = Math.round((subtotal + vatAmount) * 100) / 100;
  }

  return {
    unitPrice: basePrice,
    quantity: isPerVolume ? volume : 1,
    isPerVolume,
    subtotal,
    vatRate,
    vatAmount,
    total
  };
}

/**
 * Scans active storage units and discovers pending/unbilled periods up to asOfDate
 * @param {Date|string} asOfDate
 * @param {string|ObjectId|null} filterStorageId
 * @returns {Promise<Array<object>>}
 */
async function findPendingStorageBillings(asOfDate = new Date(), filterStorageId = null) {
  const targetDate = new Date(asOfDate);
  const query = {
    deleted: { $ne: true },
    storageStatus: { $in: ['In use', 'occupied'] },
    customer: { $ne: null },
    price: { $gt: 0 },
    invoicingStartDate: { $ne: null, $lte: targetDate }
  };

  if (filterStorageId && mongoose.Types.ObjectId.isValid(filterStorageId)) {
    query._id = new mongoose.Types.ObjectId(filterStorageId);
  }

  const storages = await Storage.find(query)
    .populate('customer', 'firstName lastName name email contactNumber companyName')
    .populate('warehouse', 'name')
    .lean();

  const pendingList = [];

  for (const st of storages) {
    const billedPeriods = Array.isArray(st.invoicedPeriods) ? st.invoicedPeriods : [];
    const allEligibleKeys = generateMonthlyPeriodKeys(st.invoicingStartDate, targetDate);

    const unbilledKeys = allEligibleKeys.filter(k => !billedPeriods.includes(k));

    if (unbilledKeys.length > 0) {
      const financialDetails = computeStoragePeriodAmount(st);
      for (const pKey of unbilledKeys) {
        pendingList.push({
          storageId: st._id,
          storageCode: st.storageCode,
          storageType: st.storageType,
          cubicMeter: st.cubicMeter,
          warehouseName: st.warehouse?.name || 'Unassigned',
          customer: st.customer,
          customerId: st.customer?._id,
          storedForProject: st.storedForProject,
          invoiceReference: st.invoiceReference || `Rent - ${st.storageCode}`,
          periodKey: pKey,
          periodLabel: getPeriodLabel(pKey),
          invoicingPeriod: st.invoicingPeriod || 'monthly',
          financials: financialDetails
        });
      }
    }
  }

  return pendingList;
}

/**
 * Processes pending storage billings idempotently and creates Draft invoices
 * @param {Date|string} asOfDate
 * @param {Array<string|ObjectId>|null} targetStorageIds
 * @returns {Promise<{ success: boolean, processedCount: number, totalBilledAmount: number, generatedInvoices: Array<object> }>}
 */
async function processRecurringStorageBilling(asOfDate = new Date(), targetStorageIds = null) {
  const targetDate = new Date(asOfDate);
  const pendingItems = await findPendingStorageBillings(targetDate);

  const eligibleItems = Array.isArray(targetStorageIds) && targetStorageIds.length > 0
    ? pendingItems.filter(item => targetStorageIds.map(String).includes(String(item.storageId)))
    : pendingItems;

  if (eligibleItems.length === 0) {
    return {
      success: true,
      processedCount: 0,
      totalBilledAmount: 0,
      generatedInvoices: [],
      message: 'No storage billings pending for the specified cycle.'
    };
  }

  const generatedInvoices = [];
  let totalBilled = 0;

  // Group by storageId to batch-update storage documents atomically
  const itemsByStorage = {};
  for (const item of eligibleItems) {
    const sId = String(item.storageId);
    if (!itemsByStorage[sId]) {
      itemsByStorage[sId] = [];
    }
    itemsByStorage[sId].push(item);
  }

  for (const [sId, items] of Object.entries(itemsByStorage)) {
    const storageDoc = await Storage.findById(sId);
    if (!storageDoc) continue;

    const currentBilled = Array.isArray(storageDoc.invoicedPeriods) ? storageDoc.invoicedPeriods : [];
    const newlyBilledKeys = [];

    for (const item of items) {
      if (currentBilled.includes(item.periodKey) || newlyBilledKeys.includes(item.periodKey)) {
        continue; // Idempotency guard against race conditions
      }

      const invData = {
        Type: 'invoice',
        customer: item.customerId,
        job: item.storedForProject || null,
        reference: item.invoiceReference,
        Status: 'Draft',
        year: parseInt(item.periodKey.split('-')[0], 10),
        items: [
          {
            description: `Storage Rental - Unit ${item.storageCode} (${item.periodLabel})`,
            quantity: item.financials.quantity,
            price: item.financials.unitPrice,
            btw: String(item.financials.vatRate)
          }
        ],
        paid: 0,
        credited: 0,
        balanceDue: item.financials.total,
        note: `Recurring monthly billing for ${item.periodLabel}`
      };

      const createdInvoice = new Invoice(invData);
      await createdInvoice.save();

      newlyBilledKeys.push(item.periodKey);
      totalBilled += item.financials.total;

      generatedInvoices.push({
        invoiceId: createdInvoice._id,
        storageId: item.storageId,
        storageCode: item.storageCode,
        periodKey: item.periodKey,
        periodLabel: item.periodLabel,
        total: item.financials.total
      });
    }

    if (newlyBilledKeys.length > 0) {
      storageDoc.invoicedPeriods = [...currentBilled, ...newlyBilledKeys];
      storageDoc.lastInvoicedDate = targetDate;
      await storageDoc.save();
    }
  }

  return {
    success: true,
    processedCount: generatedInvoices.length,
    totalBilledAmount: Math.round(totalBilled * 100) / 100,
    generatedInvoices,
    message: `Successfully processed ${generatedInvoices.length} recurring billing cycle(s).`
  };
}

module.exports = {
  getPeriodLabel,
  generateMonthlyPeriodKeys,
  computeStoragePeriodAmount,
  findPendingStorageBillings,
  processRecurringStorageBilling
};

