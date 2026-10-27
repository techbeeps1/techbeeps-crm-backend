/**
 * EXEC-16: Authoritative Package & Estimate Line Rebuilder
 * 
 * Enforces stable commercial component identity (componentId).
 * Solves:
 * 1. Zero duplicate blocks on package switch.
 * 2. In-place quantity and price updates without stale lines.
 * 3. Complete F-09 component fixture (€914.46) preventing €157.50 omission.
 * 4. Preservation of manual line items and deliberate manual overrides.
 * 5. Strict zero-to-one avoidance (quantity: 0 or price: 0 never generates a charge).
 */

const { calculateCommercialTotals, roundToCents } = require('./moneyCalculator');

/**
 * Derives a deterministic stable componentId from line description or known tags.
 */
function deriveComponentId(item) {
  if (item.componentId) return String(item.componentId);
  const desc = (item.description || item.desc || '').toLowerCase().trim();

  if (desc.startsWith('moving service (hourly') || desc.includes('(hourly:')) return 'relocation_hourly';
  if (desc.startsWith('moving service (volume') || desc.includes('(volume:')) return 'relocation_volume';
  if (desc.includes('total travel time') || desc === 'travel time') return 'relocation_travel_time';
  if (desc.includes('travel distance') || desc.includes('kilometer')) return 'relocation_distance';
  if (desc.includes('property location surcharge') || desc.includes('property surcharge')) return 'relocation_property_surcharge';
  if (desc.startsWith('moving item:') || desc.includes('euro box')) {
    const clean = desc.replace(/[^a-z0-9]/g, '_');
    return `inventory_box_${clean}`;
  }
  if (desc.includes('packing service') || desc === 'packing hours') return 'service_packing';
  if (desc.includes('unpacking service')) return 'service_unpacking';
  if (desc.includes('furniture assembly') || desc === 'assembling hours') return 'service_assembling';
  if (desc.includes('furniture disassembly') || desc === 'disassembling hours') return 'service_disassembling';
  if (desc.includes('moving lift')) return 'service_moving_lift';
  if (desc.includes('storage')) return 'service_storage';
  if (desc.includes('insurance')) return 'service_insurance';
  if (desc.includes('certificate')) return 'service_certificate';
  if (desc.includes('moving packages service')) return 'service_moving_package';
  if (desc.startsWith('packing material:')) {
    const clean = desc.replace(/[^a-z0-9]/g, '_');
    return `material_${clean}`;
  }

  // Fallback for unidentified custom items
  return item.isManual ? `manual_${desc.replace(/[^a-z0-9]/g, '_')}` : `calc_${desc.replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Parses time format 'HH:MM' or numeric hours into decimal hours.
 */
function parseTimeToHours(timeInput) {
  if (!timeInput) return 0;
  if (typeof timeInput === 'number') return isNaN(timeInput) ? 0 : timeInput;
  if (typeof timeInput === 'string') {
    if (timeInput.includes(':')) {
      const [h, m] = timeInput.split(':').map(v => parseInt(v, 10));
      return (h || 0) + (m || 0) / 60;
    }
    const parsed = parseFloat(timeInput);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Generates the authoritative target list of commercial component lines from estimate/package data.
 */
function generateTargetLines(options = {}) {
  const {
    packageData,
    priceAgree = '',
    relocation = {},
    movingLift = {},
    packing = {},
    unpacking = {},
    assembling = {},
    disassembling = {},
    storage = {},
    insurance = {},
    certificate = {},
    movingPackages = {},
    rooms = [],
    materials = [],
    selectedServices = null,
    defaultSalesGroup = '',
  } = options;

  const isServiceActive = (typeName) => {
    if (!Array.isArray(selectedServices)) return true;
    return selectedServices.some(s => {
      const st = s?.serviceTypeName || s?.serviceName || '';
      return st.toLowerCase() === typeName.toLowerCase();
    });
  };

  const isHourlyAgreement = String(priceAgree).toLowerCase().includes('hour');
  const targetLines = [];

  const isFixedPackage = packageData && (
    packageData.priceAgree === 'fixed' ||
    packageData.priceAgree === 'fixed_price' ||
    (packageData.offers?.rules && Array.isArray(packageData.offers.rules) && packageData.offers.rules.length > 0 && !isHourlyAgreement)
  );

  // If a fixed package with rules is selected, generate package rules
  if (isFixedPackage && Array.isArray(packageData?.offers?.rules) && packageData.offers.rules.length > 0) {
    packageData.offers.rules.forEach((rule, idx) => {
      const desc = rule.description?.trim() || `Package Rule #${idx + 1}`;
      const qty = Number(rule.number) || (rule.number === 0 || rule.number === '0' ? 0 : 1);
      const price = Number(rule.unitPrice || rule.price) || 0;
      const btw = rule.btw !== undefined ? String(rule.btw) : '21';
      const sg = rule.salesGroup || rule.salesgroup || defaultSalesGroup;

      if (qty > 0 && price > 0) {
        targetLines.push({
          componentId: `pkg_rule_${packageData._id || 'pkg'}_${idx}`,
          description: desc,
          quantity: qty,
          price: price,
          btw: btw,
          salesgroup: sg,
          isCalculated: true,
        });
      }
    });

    return targetLines;
  }

  // Otherwise, generate calculated estimate components directly:
  // 1. Moving Service (Volume or Hourly)
  if (relocation && (Number(relocation.totalVolume) > 0 || Number(relocation.appliedPrice) > 0 || Number(relocation.pricePerMeterCubic) > 0)) {
    if (isHourlyAgreement) {
      const hourlyRate = Number(relocation.pricePerMeterCubic) || Number(relocation.appliedPrice) || 0;
      const reqHours = parseTimeToHours(relocation.requiredHours);
      const fallbackHours = (Number(relocation.totalVolume) || 0) / 3;
      const finalHours = reqHours > 0 ? reqHours : fallbackHours;

      if (finalHours > 0 && hourlyRate > 0) {
        targetLines.push({
          componentId: 'relocation_hourly',
          description: `Moving Service (Hourly: ${relocation.requiredHours || finalHours.toFixed(2)} hrs)`,
          quantity: finalHours,
          price: hourlyRate,
          btw: '21',
          salesgroup: defaultSalesGroup,
          isCalculated: true,
        });
      }
    } else {
      const vol = Number(relocation.totalVolume) || 0;
      const rate = Number(relocation.pricePerMeterCubic) || Number(relocation.appliedPrice) || 0;
      if (vol > 0 && rate > 0) {
        targetLines.push({
          componentId: 'relocation_volume',
          description: `Moving Service (Volume: ${vol.toFixed(2)} m³)`,
          quantity: vol,
          price: rate,
          btw: '21',
          salesgroup: defaultSalesGroup,
          isCalculated: true,
        });
      }
    }
  }

  // 2. Travel Time
  const travelHrs = parseTimeToHours(relocation?.travelTime);
  const travelRate = Number(relocation?.pricePerHour) || 0;
  if (travelHrs > 0 && travelRate > 0) {
    targetLines.push({
      componentId: 'relocation_travel_time',
      description: 'Total Travel Time',
      quantity: travelHrs,
      price: travelRate,
      btw: '21',
      salesgroup: defaultSalesGroup,
      isCalculated: true,
    });
  }

  // 3. Travel Distance
  const distance = Number(relocation?.distance) || 0;
  const kmRate = Number(relocation?.pricePerKilometer) || 0;
  if (distance > 0 && kmRate > 0) {
    targetLines.push({
      componentId: 'relocation_distance',
      description: 'Travel Distance (km)',
      quantity: distance,
      price: kmRate,
      btw: '21',
      salesgroup: defaultSalesGroup,
      isCalculated: true,
    });
  }

  // 4. Property Location Surcharge (EXEC-16: Never suppress surcharge!)
  const propertySurcharge = Number(relocation?.propertySurcharge) || 0;
  if (propertySurcharge > 0) {
    targetLines.push({
      componentId: 'relocation_property_surcharge',
      description: 'Property Location Surcharge',
      quantity: 1,
      price: propertySurcharge,
      btw: '21',
      salesgroup: defaultSalesGroup,
      isCalculated: true,
    });
  }

  // 5. Room Inventory Moving Boxes (EXEC-16: Never suppress inventory moving boxes!)
  if (Array.isArray(rooms)) {
    const groupedBoxes = {};
    rooms.forEach(r => {
      (r?.inventoryItems || []).forEach(item => {
        if (!item) return;
        const key = item._id || item.name;
        if (!key) return;
        if (!groupedBoxes[key]) {
          groupedBoxes[key] = {
            id: key,
            name: item.name || 'Moving Box',
            quantity: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
          };
        } else {
          groupedBoxes[key].quantity += (Number(item.quantity) || 0);
        }
      });
    });

    Object.values(groupedBoxes).forEach(box => {
      if (box.quantity > 0 && box.price > 0) {
        targetLines.push({
          componentId: `inventory_box_${box.id}`,
          description: `Moving Item: ${box.name}`,
          quantity: box.quantity,
          price: box.price,
          btw: '21',
          salesgroup: defaultSalesGroup,
          isCalculated: true,
        });
      }
    });
  }

  // 6. Packing Service
  if (isServiceActive('packing')) {
    const packingHrs = parseTimeToHours(packing?.requiredHours);
    const packingRate = Number(packing?.appliedPrice) || 0;
    if (packingHrs > 0 && packingRate > 0) {
      targetLines.push({
        componentId: 'service_packing',
        description: 'Packing Service',
        quantity: packingHrs,
        price: packingRate,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 7. Unpacking Service
  if (isServiceActive('unpacking')) {
    const unpackingHrs = parseTimeToHours(unpacking?.requiredHours);
    const unpackingRate = Number(unpacking?.appliedPrice) || 0;
    if (unpackingHrs > 0 && unpackingRate > 0) {
      targetLines.push({
        componentId: 'service_unpacking',
        description: 'Unpacking Service',
        quantity: unpackingHrs,
        price: unpackingRate,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 8. Furniture Assembly Service
  if (isServiceActive('assembling')) {
    const assembleHrs = parseTimeToHours(assembling?.requiredHours);
    const assembleRate = Number(assembling?.appliedPrice) || 0;
    if (assembleHrs > 0 && assembleRate > 0) {
      targetLines.push({
        componentId: 'service_assembling',
        description: 'Furniture Assembly Service',
        quantity: assembleHrs,
        price: assembleRate,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 9. Furniture Disassembly Service (EXEC-16: Never suppress disassembly!)
  if (isServiceActive('disassembling')) {
    const disHrs = parseTimeToHours(disassembling?.requiredHours);
    const disRate = Number(disassembling?.appliedPrice) || 0;
    if (disHrs > 0 && disRate > 0) {
      targetLines.push({
        componentId: 'service_disassembling',
        description: 'Furniture Disassembly Service',
        quantity: disHrs,
        price: disRate,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 10. Moving Lift
  if (isServiceActive('movingLift')) {
    const liftQty = Number(movingLift?.quantity) || 0;
    const liftPrice = Number(movingLift?.price) || Number(movingLift?.appliedPrice) || 0;
    if (liftQty > 0 && liftPrice > 0) {
      targetLines.push({
        componentId: 'service_moving_lift',
        description: 'Moving Lift Service',
        quantity: liftQty,
        price: liftPrice,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 11. Storage Service
  if (isServiceActive('storage')) {
    const sQty = Number(storage?.storageVolume) || Number(storage?.quantity) || 0;
    const sPrice = Number(storage?.appliedPrice) || Number(storage?.price) || 0;
    if (sQty > 0 && sPrice > 0) {
      targetLines.push({
        componentId: 'service_storage',
        description: 'Storage Service',
        quantity: sQty,
        price: sPrice,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 12. Insurance Coverage
  if (isServiceActive('insurance')) {
    const insQty = Number(insurance?.quantity) || 0;
    const insPrice = Number(insurance?.price) || Number(insurance?.appliedPrice) || 0;
    if (insQty > 0 && insPrice > 0) {
      targetLines.push({
        componentId: 'service_insurance',
        description: 'Insurance Coverage',
        quantity: insQty,
        price: insPrice,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 13. Certificate Service
  if (isServiceActive('certificate')) {
    const certQty = Number(certificate?.quantity) || 0;
    const certPrice = Number(certificate?.price) || Number(certificate?.appliedPrice) || 0;
    if (certQty > 0 && certPrice > 0) {
      targetLines.push({
        componentId: 'service_certificate',
        description: 'Certificate Service',
        quantity: certQty,
        price: certPrice,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 14. Moving Packages
  if (isServiceActive('movingPackage')) {
    const mpQty = Number(movingPackages?.quantity) || 0;
    const mpPrice = Number(movingPackages?.price) || Number(movingPackages?.appliedPrice) || 0;
    if (mpQty > 0 && mpPrice > 0) {
      targetLines.push({
        componentId: 'service_moving_package',
        description: 'Moving Packages Service',
        quantity: mpQty,
        price: mpPrice,
        btw: '21',
        salesgroup: defaultSalesGroup,
        isCalculated: true,
      });
    }
  }

  // 15. Packing Materials
  if (Array.isArray(materials)) {
    materials.forEach(mat => {
      const qty = Number(mat.quantity) || 0;
      const price = Number(mat.sellingPrice) || Number(mat.price) || 0;
      if (qty > 0 && price > 0) {
        targetLines.push({
          componentId: `material_${mat._id || mat.name}`,
          description: `Packing Material: ${mat.name || 'Moving Item'}`,
          quantity: qty,
          price: price,
          btw: '21',
          salesgroup: defaultSalesGroup,
          isCalculated: true,
        });
      }
    });
  }

  return targetLines;
}

/**
 * Deterministically reconciles existing items with target generated lines.
 * Guarantees:
 * - In-place updates when quantity or price changes (no duplicates, no stale lines).
 * - Dropping of obsolete system lines when services/packages change.
 * - 100% preservation of manual items (isManual: true).
 * - Preservation of manual overrides (manualOverride: true) with provenance.
 */
function reconcilePackageLines(existingItems = [], targetLines = []) {
  const updatedItems = [];
  const matchedTargetIds = new Set();

  for (const item of existingItems) {
    // If it's a manual line added by staff, always preserve it!
    if (item.isManual) {
      updatedItems.push(item);
      continue;
    }

    const compId = item.componentId || deriveComponentId(item);
    const target = targetLines.find(t => t.componentId === compId);

    if (target) {
      if (item.manualOverride) {
        // Preserved deliberate manual override
        updatedItems.push({
          ...item,
          componentId: compId,
        });
      } else {
        // Update in-place
        updatedItems.push({
          ...item,
          componentId: compId,
          description: target.description,
          quantity: target.quantity,
          price: target.price,
          btw: target.btw,
          salesgroup: item.salesgroup || target.salesgroup,
          isCalculated: true,
        });
      }
      matchedTargetIds.add(compId);
    }
    // If existing system line has no target (e.g. deselected or package switched), it is omitted (NO STALE LINES)
  }

  // Add any target lines that were not yet in existingItems
  for (const target of targetLines) {
    if (!matchedTargetIds.has(target.componentId)) {
      updatedItems.push({
        componentId: target.componentId,
        description: target.description,
        quantity: target.quantity,
        price: target.price,
        btw: target.btw,
        salesgroup: target.salesgroup,
        isCalculated: true,
        isManual: false,
        enabled: true,
      });
    }
  }

  return updatedItems;
}

module.exports = {
  deriveComponentId,
  parseTimeToHours,
  generateTargetLines,
  reconcilePackageLines,
};
