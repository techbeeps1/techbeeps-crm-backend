const axios = require('axios');
const { roundToTwo, calculateHaversineFallback } = require('../utils/routeCalculator');

const getOrsApiKey = () => {
  return process.env.OPENROUTESERVICE_KEY || '5b3ce3597851110001cf6248495a99f209a54de397d7d927a4a3f00b';
};

/**
 * Calculates driving directions via server-side proxy
 * Priority: 1) OpenRouteService -> 2) OSRM -> 3) Haversine Fallback
 */
exports.calculateDirections = async (req, res) => {
  try {
    const { startCoords, endCoords } = req.body;

    if (!Array.isArray(startCoords) || startCoords.length < 2 || !Array.isArray(endCoords) || endCoords.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_COORDINATES',
        message: 'startCoords and endCoords arrays [lon, lat] are required',
      });
    }

    const startLon = parseFloat(startCoords[0]);
    const startLat = parseFloat(startCoords[1]);
    const endLon = parseFloat(endCoords[0]);
    const endLat = parseFloat(endCoords[1]);

    if (!Number.isFinite(startLon) || !Number.isFinite(startLat) || !Number.isFinite(endLon) || !Number.isFinite(endLat)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_COORDINATES',
        message: 'Coordinates must be valid finite numbers',
      });
    }

    const apiKey = getOrsApiKey();

    // 1. Tier 1: OpenRouteService Driving Directions
    if (apiKey) {
      try {
        const directionsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startLon},${startLat}&end=${endLon},${endLat}`;
        const orsRes = await axios.get(directionsUrl, { timeout: 6000 });
        const summary = orsRes.data?.features?.[0]?.properties?.summary;
        if (summary && typeof summary.distance === 'number') {
          return res.status(200).json({
            success: true,
            distanceKm: roundToTwo(summary.distance / 1000),
            durationHours: roundToTwo((summary.duration || 0) / 3600),
            source: 'ORS',
            isFallback: false,
            status: 'CONFIRMED_ROAD',
          });
        }
      } catch (orsErr) {
        // Log & proceed to OSRM fallback
        console.warn('[Routing] ORS API call failed, falling back to OSRM:', orsErr.message);
      }
    }

    // 2. Tier 2: OSRM Routing Fallback
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
      const osrmRes = await axios.get(osrmUrl, { timeout: 5000 });
      if (osrmRes.data?.routes?.length > 0) {
        const route = osrmRes.data.routes[0];
        return res.status(200).json({
          success: true,
          distanceKm: roundToTwo(route.distance / 1000),
          durationHours: roundToTwo(route.duration / 3600),
          source: 'OSRM',
          isFallback: false,
          status: 'CONFIRMED_ROAD',
        });
      }
    } catch (osrmErr) {
      console.warn('[Routing] OSRM routing failed, falling back to Haversine:', osrmErr.message);
    }

    // 3. Tier 3: Haversine Fallback
    const fallback = calculateHaversineFallback([startLon, startLat], [endLon, endLat]);
    return res.status(200).json({
      success: true,
      distanceKm: fallback.distanceKm,
      durationHours: fallback.durationHours,
      source: fallback.source,
      isFallback: fallback.isFallback,
      status: fallback.status,
    });
  } catch (error) {
    console.error('[Routing Controller Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'ROUTING_ERROR',
      message: error.message || 'Internal error calculating route',
    });
  }
};

/**
 * Geocodes an address string via OpenRouteService server-side proxy
 */
exports.geocodeSearch = async (req, res) => {
  try {
    const query = (req.body?.query || req.query?.query || req.query?.text || '').toString().trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY',
        message: 'Search query string is required',
      });
    }

    const apiKey = getOrsApiKey();
    if (!apiKey) {
      return res.status(200).json({
        success: false,
        coords: null,
        message: 'OpenRouteService API key not configured',
      });
    }

    const orsUrl = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(query)}`;
    const orsRes = await axios.get(orsUrl, { timeout: 5000 });

    if (orsRes.data?.features?.length > 0) {
      const coords = orsRes.data.features[0].geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const lon = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          return res.status(200).json({
            success: true,
            coords: [lon, lat],
          });
        }
      }
    }

    return res.status(200).json({
      success: false,
      coords: null,
    });
  } catch (error) {
    console.warn('[Routing Geocode Error]:', error.message);
    return res.status(200).json({
      success: false,
      coords: null,
      error: error.message,
    });
  }
};
