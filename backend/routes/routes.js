/**
 * Route Management API Routes
 * Modular endpoints for managing available flight routes
 */

const express = require('express');
const router = express.Router();
const { getRouteStorage } = require('../services/routeStorage');
const { fetchAllRoutes } = require('../services/routeFetcher');
const { iataToCityName } = require('../utils/cityToIata');
const logger = require('../utils/logger');

/**
 * GET /api/routes
 * Get all available routes
 */
router.get('/', async (req, res) => {
  try {
    const routeStorage = getRouteStorage();
    const routes = routeStorage.getRoutes();
    const stats = await routeStorage.getStatsAsync();

    res.json({
      success: true,
      routes,
      stats
    });
  } catch (error) {
    logger.error(`Failed to get routes: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve routes'
    });
  }
});

/**
 * GET /api/routes/origins
 * Get all available origin airports
 */
router.get('/origins', (req, res) => {
  try {
    const routeStorage = getRouteStorage();
    const origins = routeStorage.getOrigins();
    
    // Create array with city names and sort by city name
    const originsWithCities = origins.map(iata => {
      // Try to get city name from route data first
      const routes = routeStorage.getRoutes();
      const route = routes.find(r => r.origin === iata);
      const cityName = route?.originCity 
        ? route.originCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : iataToCityName(iata);
      
      return {
        iata,
        cityName: cityName || iata,
        display: cityName ? `${cityName} (${iata})` : iata
      };
    });
    
    // Sort by city name (first letter)
    originsWithCities.sort((a, b) => {
      const cityA = a.cityName.toUpperCase();
      const cityB = b.cityName.toUpperCase();
      return cityA.localeCompare(cityB);
    });

    res.json({
      success: true,
      origins: originsWithCities.map(o => o.iata),
      originsWithCities // Include full data for frontend
    });
  } catch (error) {
    logger.error(`Failed to get origins: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve origins'
    });
  }
});

/**
 * GET /api/routes/destinations/:origin
 * Get all available destinations for a given origin
 */
router.get('/destinations/:origin', (req, res) => {
  try {
    const { origin } = req.params;
    
    if (!/^[A-Z]{3}$/.test(origin)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid origin IATA code'
      });
    }

    const routeStorage = getRouteStorage();
    const destinations = routeStorage.getDestinations(origin.toUpperCase());
    
    // Create array with city names and sort by city name
    const destinationsWithCities = destinations.map(iata => {
      // Try to get city name from route data first
      const routes = routeStorage.getRoutes();
      const route = routes.find(r => r.origin === origin.toUpperCase() && r.destination === iata);
      const cityName = route?.destinationCity 
        ? route.destinationCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : iataToCityName(iata);
      
      return {
        iata,
        cityName: cityName || iata,
        display: cityName ? `${cityName} (${iata})` : iata
      };
    });
    
    // Sort by city name (first letter)
    destinationsWithCities.sort((a, b) => {
      const cityA = a.cityName.toUpperCase();
      const cityB = b.cityName.toUpperCase();
      return cityA.localeCompare(cityB);
    });

    res.json({
      success: true,
      origin: origin.toUpperCase(),
      destinations: destinationsWithCities.map(d => d.iata),
      destinationsWithCities // Include full data for frontend
    });
  } catch (error) {
    logger.error(`Failed to get destinations: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve destinations'
    });
  }
});

/**
 * GET /api/routes/validate/:origin/:destination
 * Validate if a route exists
 */
router.get('/validate/:origin/:destination', (req, res) => {
  try {
    const { origin, destination } = req.params;
    
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IATA codes'
      });
    }

    const routeStorage = getRouteStorage();
    const isValid = routeStorage.isValidRoute(origin.toUpperCase(), destination.toUpperCase());

    res.json({
      success: true,
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      valid: isValid
    });
  } catch (error) {
    logger.error(`Failed to validate route: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to validate route'
    });
  }
});

/**
 * POST /api/routes/update
 * Fetch and update routes from Frontier sitemap
 */
router.post('/update', async (req, res) => {
  try {
    logger.info('Route update requested');

    // Send immediate response
    res.json({
      success: true,
      status: 'started',
      message: 'Route update started. This may take a few minutes. Monitor progress via WebSocket.'
    });

    // Process update asynchronously
    (async () => {
      try {
        if (global.broadcast) {
          global.broadcast({
            type: 'route_update_started',
            message: 'Fetching routes from Frontier sitemap...',
            timestamp: new Date().toISOString()
          });
        }

        const routes = await fetchAllRoutes();

        if (routes.length === 0) {
          throw new Error('No routes found');
        }

        const routeStorage = getRouteStorage();
        await routeStorage.save(routes);

        if (global.broadcast) {
          global.broadcast({
            type: 'route_update_complete',
            success: true,
            routeCount: routes.length,
            message: `Successfully updated ${routes.length} routes`,
            timestamp: new Date().toISOString()
          });
        }

        logger.info(`Route update complete: ${routes.length} routes saved`);

      } catch (error) {
        logger.error(`Route update failed: ${error.message}`);

        if (global.broadcast) {
          global.broadcast({
            type: 'route_update_complete',
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    })();

  } catch (error) {
    logger.error(`Failed to start route update: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start route update'
    });
  }
});

/**
 * GET /api/routes/stats
 * Get route statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const routeStorage = getRouteStorage();
    const stats = await routeStorage.getStatsAsync();

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    logger.error(`Failed to get route stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve route statistics'
    });
  }
});

module.exports = router;

