/**
 * EXEC-13: Dutch Address Lookup (PDOK Locatieserver) & Argument Reversal Resilience (Backend)
 */

const isCountryIdentifier = (val) => {
  if (!val || typeof val !== 'string') return false;
  const v = val.trim().toLowerCase();
  if (!v) return false;
  return (
    v === 'netherlands' ||
    v === 'nederland' ||
    v === 'nl' ||
    v === 'the netherlands' ||
    v === 'holland' ||
    v === 'germany' ||
    v === 'deutschland' ||
    v === 'de' ||
    v === 'belgium' ||
    v === 'belgië' ||
    v === 'be' ||
    v === 'france' ||
    v === 'fr' ||
    v === 'united kingdom' ||
    v === 'uk' ||
    v === 'spain' ||
    v === 'italy' ||
    (v.length > 5 && !/^[0-9]/.test(v))
  );
};

const lookupDutchAddress = async (
  paramsOrPostcode,
  rawHouseNumber,
  arg3,
  arg4
) => {
  let postcode = '';
  let houseNumber = '';
  let addition = '';
  let country = 'Netherlands';

  if (typeof paramsOrPostcode === 'object' && paramsOrPostcode !== null) {
    postcode = String(paramsOrPostcode.postcode || '').trim();
    houseNumber = String(paramsOrPostcode.houseNumber || '').trim();
    addition = String(paramsOrPostcode.addition || '').trim();
    country = String(paramsOrPostcode.country || 'Netherlands').trim();
  } else {
    postcode = String(paramsOrPostcode || '').trim();
    houseNumber = String(rawHouseNumber || '').trim();

    const param3 = arg3 !== undefined ? String(arg3).trim() : '';
    const param4 = arg4 !== undefined ? String(arg4).trim() : '';

    // Smart Disambiguation:
    // If arg3 is a country (e.g. 'Netherlands', 'Germany'), then signature was (postcode, houseNumber, country, addition)
    if (isCountryIdentifier(param3)) {
      country = param3 || 'Netherlands';
      addition = param4;
    } else if (isCountryIdentifier(param4)) {
      // If arg4 is a country, then signature was (postcode, houseNumber, addition, country)
      addition = param3;
      country = param4 || 'Netherlands';
    } else {
      // Default: arg3 is addition (e.g. 'A', 'bis'), arg4 is country or defaults to Netherlands
      addition = param3;
      country = param4 || 'Netherlands';
    }
  }

  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  const cleanHouseNumber = houseNumber.trim();
  const cleanAddition = addition.trim();

  if (!cleanPostcode || !cleanHouseNumber) {
    return { success: false, message: 'Postcode and house number are required for lookup.' };
  }

  // Dutch postcode format: 4 digits + 2 letters (e.g. 1012JS, 3011AD)
  const isDutchFormat = /^[1-9][0-9]{3}[A-Z]{2}$/.test(cleanPostcode);
  if (!isDutchFormat) {
    return { success: false, message: 'Not a standard Dutch postcode format (e.g. 1012JS).' };
  }

  // Respect deliberate foreign country selections (only run for Netherlands / blank)
  const normCountry = country.toLowerCase();
  const isDutchCountry =
    !normCountry ||
    normCountry === 'netherlands' ||
    normCountry === 'nederland' ||
    normCountry === 'nl' ||
    normCountry === 'the netherlands' ||
    normCountry === 'holland';

  if (!isDutchCountry) {
    return { success: false, message: 'Foreign country selected; skipping Dutch lookup.' };
  }

  try {
    const query = cleanAddition
      ? `${cleanPostcode} ${cleanHouseNumber} ${cleanAddition}`
      : `${cleanPostcode} ${cleanHouseNumber}`;
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      return { success: false, message: 'Lookup service temporarily unavailable. Please enter details manually.' };
    }

    const data = await response.json();
    const docs = data?.response?.docs || [];

    if (docs.length === 0) {
      // Fallback: retry without addition if addition was provided
      if (cleanAddition) {
        const fallbackUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(`${cleanPostcode} ${cleanHouseNumber}`)}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const fallbackDoc = fallbackData?.response?.docs?.[0];
          if (fallbackDoc && fallbackDoc.straatnaam && fallbackDoc.woonplaatsnaam) {
            return {
              success: true,
              street: fallbackDoc.straatnaam,
              city: fallbackDoc.woonplaatsnaam,
              postcode: cleanPostcode,
              houseNumber: cleanHouseNumber,
              addition: cleanAddition,
              country: 'Netherlands',
              message: `✓ Address found: ${fallbackDoc.straatnaam}, ${fallbackDoc.woonplaatsnaam}`,
            };
          }
        }
      }
      return { success: false, message: 'No matching address found. Please enter details manually.' };
    }

    const doc = docs[0];
    if (doc.straatnaam && doc.woonplaatsnaam) {
      return {
        success: true,
        street: doc.straatnaam,
        city: doc.woonplaatsnaam,
        postcode: cleanPostcode,
        houseNumber: cleanHouseNumber,
        addition: cleanAddition,
        country: 'Netherlands',
        message: `✓ Address found: ${doc.straatnaam}, ${doc.woonplaatsnaam}`,
      };
    }

    return { success: false, message: 'Address details incomplete in registry. Please enter manually.' };
  } catch (error) {
    console.warn('[EXEC-13] PDOK Lookup error:', error);
    return { success: false, message: 'Lookup service unavailable. Please enter details manually.' };
  }
};

module.exports = {
  isCountryIdentifier,
  lookupDutchAddress,
};
