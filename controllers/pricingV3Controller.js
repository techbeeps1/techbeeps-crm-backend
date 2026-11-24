const pricingEngine = require('../services/pricingEngineV3Service');

/**
 * Controller for Pricing Engine v3
 * Provides authoritative calculation and advice endpoints for quotes and valuations.
 */

exports.calculatePrice = async (req, res) => {
  try {
    const { job, settingsOverrides } = req.body;
    if (!job || typeof job !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_JOB_PAYLOAD',
        message: 'A valid job configuration object is required for pricing calculation.',
      });
    }

    const settings = pricingEngine.resolveSettings(settingsOverrides);
    const result = pricingEngine.calc(settings, job);

    const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;

    return res.status(200).json({
      success: true,
      calculation: {
        fixed_price_shown: round2(result.vastShow),
        fixed_price_excl_vat: round2(result.vastEx),
        hourly_indication_shown: round2(result.uurShow),
        cost_price_excl_vat: round2(result.kost),
        vat_treatment: result.regime,
        vat_rate: result.btw,
        days: result.dagen,
        nights: result.nachten,
        overnight: result.overnacht,
        overtime_hours: round2(result.overU),
        total_labour_hours: round2(result.man),
        crew: result.ploeg,
        truck: result.w?.id,
        trucks: result.nW,
        warnings: result.warnings,
        warnings_count: result.warnings.length,
        raw: result,
      },
    });
  } catch (error) {
    console.error('[PricingEngineV3 Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'PRICING_CALCULATION_ERROR',
      message: error.message || 'An error occurred while calculating pricing v3.',
    });
  }
};

exports.getAdvice = async (req, res) => {
  try {
    const { job, settingsOverrides } = req.body;
    if (!job || typeof job !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_JOB_PAYLOAD',
        message: 'A valid job configuration object is required for advice calculation.',
      });
    }

    const settings = pricingEngine.resolveSettings(settingsOverrides);
    const result = pricingEngine.advies(settings, job);

    const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;

    return res.status(200).json({
      success: true,
      advice: {
        truck: result.wagen,
        trucks: result.n,
        crew: result.ploeg,
        days: result.dagen,
        fixed_price_shown: round2(result.prijs),
        feasible: result.ok,
        shortfall: round2(result.tekort),
        hours: round2(result.uren),
        overnight: result.overnacht,
      },
    });
  } catch (error) {
    console.error('[PricingEngineV3 Advice Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'PRICING_ADVICE_ERROR',
      message: error.message || 'An error occurred while generating pricing advice.',
    });
  }
};

exports.getDefaultSettings = async (req, res) => {
  try {
    const settings = pricingEngine.getDefaultSettings();
    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'SETTINGS_FETCH_ERROR',
      message: error.message || 'Failed to fetch default pricing v3 settings.',
    });
  }
};
