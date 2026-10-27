/**
 * EXEC-17: Labour Service & Catalogue Unit Calculations (Backend)
 * 
 * Verifies:
 * 1. F-08: 1.7 elapsed hours x 2 workers x €40/hr = €136.00 net.
 * 2. Does NOT multiply an aggregate 3.4 worker-hour input by crew again.
 * 3. Lift selection & direct workflow (selected lift appears once, unselected = €0.00).
 * 4. Property Surcharge resolution via stable canonical IDs.
 * 5. Box dimension validation (positive numbers required; invalid dimensions rejected).
 * 6. Division & remainder time formatting (1.999h -> 02:00, no 01:60).
 */

const { roundToCents } = require('./moneyCalculator');
const { convertToTimeFormat, handleTimeToQuantity } = require('./timeUtil');

/**
 * Calculates labour charges distinguishing elapsed time from aggregate worker-hours.
 */
function calculateLabourCost(options = {}) {
  const {
    elapsedHours = 0,
    workerHours = 0,
    crewCount = 1,
    ratePerHour = 40,
    isAggregateWorkerHours = false,
  } = options;

  const crew = Math.max(1, Number(crewCount) || 1);
  const rate = Number(ratePerHour) || 0;

  let totalWorkerHours = 0;
  let elapsed = 0;

  if (isAggregateWorkerHours || (workerHours > 0 && elapsedHours === 0)) {
    // Explicit aggregate worker-hours: DO NOT multiply by crew again!
    totalWorkerHours = Number(workerHours) || 0;
    elapsed = crew > 0 ? (totalWorkerHours / crew) : totalWorkerHours;
  } else {
    // Elapsed job time: multiply by crew to get total worker-hours
    elapsed = Number(elapsedHours) || 0;
    totalWorkerHours = elapsed * crew;
  }

  const netCharge = roundToCents(totalWorkerHours * rate);

  return {
    elapsedHours: roundToCents(elapsed),
    workerHours: roundToCents(totalWorkerHours),
    crewCount: crew,
    ratePerHour: rate,
    netCharge,
    formattedElapsed: convertToTimeFormat(elapsed),
    formattedWorkerHours: convertToTimeFormat(totalWorkerHours),
  };
}

/**
 * Calculates Moving Lift charge with strict unselected zero policy.
 */
function calculateLiftService(options = {}) {
  const { isSelected = false, quantity = 0, unitPrice = 0 } = options;

  if (!isSelected || Number(quantity) <= 0 || Number(unitPrice) <= 0) {
    return {
      isSelected: false,
      quantity: 0,
      price: 0,
      charge: 0.00,
    };
  }

  const qty = Number(quantity);
  const price = Number(unitPrice);
  const charge = roundToCents(qty * price);

  return {
    isSelected: true,
    quantity: qty,
    price,
    charge,
  };
}

/**
 * Resolves property surcharge with support for stable canonical property IDs & Dutch aliases.
 */
function resolvePropertySurcharge(propertyInput, surchargeTable = {}) {
  if (!propertyInput || typeof propertyInput !== 'string') return 0;
  const clean = propertyInput.trim().toLowerCase();

  // 1. Direct match in table
  for (const [key, val] of Object.entries(surchargeTable)) {
    if (key.toLowerCase() === clean) return Number(val) || 0;
  }

  // 2. Canonical alias mapping
  const canonicalAliases = {
    // Apartment / Flat
    apartment: 'Appartement',
    flat: 'Appartement',
    appratment: 'Appartement',
    appartmant: 'Appartement',
    penthouse: 'Appartement',
    penthouses: 'Appartement',
    studio: 'Studio',
    prop_apartment: 'Appartement',
    prop_flat: 'Appartement',
    // House
    house: 'Huis',
    home: 'Huis',
    woonhuis: 'Huis',
    'single family home': 'Huis',
    prop_house: 'Huis',
    farm: 'Boerderij',
    farmhouse: 'Boerderij',
    boerderij: 'Boerderij',
    // 2-onder-1-kap / Semi-detached
    'semi-detached': '2-onder-1-kap',
    'semi detached': '2-onder-1-kap',
    '2-onder-1-kap': '2-onder-1-kap',
    prop_semidetached: '2-onder-1-kap',
    mansion: 'Herenhuis',
    herenhuis: 'Herenhuis',
    // Detached / Villa
    detached: 'Vrijstaande woning',
    'detached house': 'Vrijstaande woning',
    'vrijstaande woning': 'Vrijstaande woning',
    villa: 'Villa',
    prop_detached: 'Vrijstaande woning',
    // Townhouse / Terraced
    terraced: 'Rijtjeswoning',
    'terraced house': 'Rijtjeswoning',
    townhouse: 'Rijtjeswoning',
    rijtjeswoning: 'Rijtjeswoning',
    corner: 'Hoekwoning',
    'corner house': 'Hoekwoning',
    hoekwoning: 'Hoekwoning',
    prop_terraced: 'Rijtjeswoning',
    // Commercial / Office
    office: 'Kantoor',
    kantoor: 'Kantoor',
    commercial: 'Bedrijfspand',
    'commercial space': 'Bedrijfspand',
    'commercial property': 'Bedrijfspand',
    bedrijfspand: 'Bedrijfspand',
    prop_commercial: 'Bedrijfspand',
    // Storage
    storage: 'Opslag',
    'storage unit': 'Opslag',
    opslag: 'Opslag',
    warehouse: 'Opslag',
    prop_storage: 'Opslag',
  };

  const canonicalKey = canonicalAliases[clean];
  if (canonicalKey) {
    for (const [key, val] of Object.entries(surchargeTable)) {
      if (key.toLowerCase() === canonicalKey.toLowerCase()) {
        return Number(val) || 0;
      }
    }
  }

  return 0;
}

/**
 * Validates moving box dimensions.
 * Requires positive numeric length, width, and height.
 */
function validateBoxDimensions(box = {}) {
  const length = Number(box.length);
  const width = Number(box.width);
  const height = Number(box.height);

  if (
    !Number.isFinite(length) || length <= 0 ||
    !Number.isFinite(width) || width <= 0 ||
    !Number.isFinite(height) || height <= 0
  ) {
    return {
      valid: false,
      error: 'Invalid box dimensions: length, width, and height must be positive numbers greater than 0',
      cubicMeter: 0,
    };
  }

  // Dimensions in centimeters converted to cubic meters
  const cubicMeter = roundToCents((length * width * height) / 10000) / 100; // 4 decimals precision

  return {
    valid: true,
    length,
    width,
    height,
    cubicMeter,
  };
}

module.exports = {
  calculateLabourCost,
  calculateLiftService,
  resolvePropertySurcharge,
  validateBoxDimensions,
  convertToTimeFormat,
  handleTimeToQuantity,
};
