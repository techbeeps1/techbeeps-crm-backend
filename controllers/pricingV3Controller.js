const mongoose = require('mongoose');
const pricingEngine = require('../services/pricingEngineV3Service');
const PricingSettings = require('../models/pricingSettingsModel');

const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;

/**
 * Controller for Pricing Engine v3
 * Provides authoritative calculation, advice, and versioned settings CRUD.
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

    const settings = await pricingEngine.resolveSettingsAsync(settingsOverrides);
    const result = pricingEngine.calc(settings, job);

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

    const settings = await pricingEngine.resolveSettingsAsync(settingsOverrides);
    const result = pricingEngine.advies(settings, job);

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

/**
 * GET /api/pricing-v3/settings
 * Returns the currently active pricing settings (from DB if present, fallback to file).
 */
exports.getDefaultSettings = async (req, res) => {
  try {
    let activeDoc = null;
    if (mongoose.connection.readyState === 1) {
      activeDoc = await PricingSettings.findOne({ isActive: true }).sort({ version: -1 }).lean();
    }

    if (activeDoc) {
      return res.status(200).json({
        success: true,
        version: activeDoc.version,
        name: activeDoc.name,
        startDate: activeDoc.startDate,
        isActive: activeDoc.isActive,
        settings: activeDoc.settings,
      });
    }

    const fileSettings = pricingEngine.getDefaultSettings();
    return res.status(200).json({
      success: true,
      version: 3,
      name: 'Pricing Settings v3 (File Fallback)',
      startDate: new Date('2026-01-01'),
      isActive: true,
      settings: fileSettings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'SETTINGS_FETCH_ERROR',
      message: error.message || 'Failed to fetch default pricing v3 settings.',
    });
  }
};

/**
 * GET /api/pricing-v3/settings/versions
 * List all pricing settings versions.
 */
exports.listVersions = async (req, res) => {
  try {
    const versions = await PricingSettings.find()
      .select('version name description startDate isActive createdAt updatedAt')
      .sort({ version: -1 });

    return res.status(200).json({
      success: true,
      count: versions.length,
      versions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VERSIONS_LIST_ERROR',
      message: error.message || 'Failed to list pricing versions.',
    });
  }
};

/**
 * GET /api/pricing-v3/settings/version/:version
 * Get a specific version by its version number.
 */
exports.getVersion = async (req, res) => {
  try {
    const versionNum = Number(req.params.version);
    if (isNaN(versionNum)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_VERSION',
        message: 'Version parameter must be a valid number.',
      });
    }

    const doc = await PricingSettings.findOne({ version: versionNum });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'VERSION_NOT_FOUND',
        message: `Pricing settings version ${versionNum} was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      version: doc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VERSION_FETCH_ERROR',
      message: error.message || 'Failed to retrieve pricing version.',
    });
  }
};

/**
 * POST /api/pricing-v3/settings
 * Create a new versioned pricing settings document.
 */
exports.createVersion = async (req, res) => {
  try {
    const { version, name, description, startDate, isActive, settings, cloneFromVersion } = req.body;

    const vNum = Number(version);
    if (!vNum || isNaN(vNum) || vNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_VERSION_NUMBER',
        message: 'A valid positive version number is required.',
      });
    }

    const existing = await PricingSettings.findOne({ version: vNum });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'VERSION_EXISTS',
        message: `Pricing settings version ${vNum} already exists.`,
      });
    }

    let finalSettings = settings;
    if (!finalSettings && cloneFromVersion) {
      const source = await PricingSettings.findOne({ version: Number(cloneFromVersion) });
      if (source && source.settings) {
        finalSettings = source.settings;
      }
    }
    if (!finalSettings) {
      finalSettings = pricingEngine.getDefaultSettings();
    }

    const newDoc = new PricingSettings({
      version: vNum,
      name: name || `Pricing Settings v${vNum}`,
      description: description || '',
      startDate: startDate ? new Date(startDate) : new Date(),
      isActive: isActive !== undefined ? Boolean(isActive) : false,
      settings: finalSettings,
      createdBy: req.user?._id || req.user?.id,
    });

    await newDoc.save();

    return res.status(201).json({
      success: true,
      message: `Pricing settings version ${vNum} created successfully.`,
      version: newDoc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VERSION_CREATE_ERROR',
      message: error.message || 'Failed to create pricing settings version.',
    });
  }
};

/**
 * PUT /api/pricing-v3/settings/version/:version
 * Update an existing pricing settings version.
 */
exports.updateVersion = async (req, res) => {
  try {
    const vNum = Number(req.params.version);
    const { name, description, startDate, isActive, settings } = req.body;

    const doc = await PricingSettings.findOne({ version: vNum });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'VERSION_NOT_FOUND',
        message: `Pricing settings version ${vNum} was not found.`,
      });
    }

    if (name) doc.name = name;
    if (description !== undefined) doc.description = description;
    if (startDate) doc.startDate = new Date(startDate);
    if (settings && typeof settings === 'object') {
      doc.settings = pricingEngine.deepMerge(doc.settings, settings);
      doc.markModified('settings');
    }
    if (isActive !== undefined) {
      doc.isActive = Boolean(isActive);
    }
    doc.updatedBy = req.user?._id || req.user?.id;

    await doc.save();

    return res.status(200).json({
      success: true,
      message: `Pricing settings version ${vNum} updated successfully.`,
      version: doc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VERSION_UPDATE_ERROR',
      message: error.message || 'Failed to update pricing settings version.',
    });
  }
};

/**
 * POST /api/pricing-v3/settings/version/:version/activate
 * Set a specific version as the active version.
 */
exports.activateVersion = async (req, res) => {
  try {
    const vNum = Number(req.params.version);
    const doc = await PricingSettings.findOne({ version: vNum });
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'VERSION_NOT_FOUND',
        message: `Pricing settings version ${vNum} was not found.`,
      });
    }

    doc.isActive = true;
    doc.updatedBy = req.user?._id || req.user?.id;
    await doc.save();

    return res.status(200).json({
      success: true,
      message: `Pricing settings version ${vNum} is now the active pricing version.`,
      version: doc,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VERSION_ACTIVATE_ERROR',
      message: error.message || 'Failed to activate pricing settings version.',
    });
  }
};
