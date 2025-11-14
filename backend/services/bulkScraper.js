/**
 * Bulk Scraper Service
 * Modular service for handling bulk scraping operations with cache awareness
 */

const { scrapeFlights } = require('./scraper');
const { getCache } = require('./cache');
const { getRouteStorage } = require('./routeStorage');
const logger = require('../utils/logger');

/**
 * Scrape all routes from a specific origin
 * Returns hierarchical results: { origin, destinations: { dest: flights[] } }
 */
async function scrapeRoutesByOrigin(origin, date, useCache = true) {
  const routeStorage = getRouteStorage();
  const cache = getCache();
  const routes = routeStorage.getAllRoutesForOrigin(origin);

  if (routes.length === 0) {
    return {
      success: false,
      error: `No routes found for origin ${origin}`
    };
  }

  logger.info(`Scraping ${routes.length} routes from ${origin} for date ${date}`);

  const results = {
    origin,
    date,
    destinations: {},
    stats: {
      total: routes.length,
      cached: 0,
      scraped: 0,
      failed: 0
    }
  };

  // Process routes with cache awareness
  for (const route of routes) {
    const { destination } = route;

    try {
      // Check cache if enabled
      let cachedData = null;
      if (useCache && cache.shouldUseCache()) {
        cachedData = await cache.get(origin, destination, date);
      } else if (useCache) {
        // Even if cache checking is disabled, check if data exists for stats
        cachedData = await cache.getUnchecked(origin, destination, date);
      }

      if (cachedData) {
        results.destinations[destination] = cachedData.flights || [];
        results.stats.cached++;
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_cached',
            origin,
            destination,
            flightCount: cachedData.flights?.length || 0,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // Scrape live
        const result = await scrapeFlights(origin, destination, date);
        
        if (result.success) {
          results.destinations[destination] = result.flights || [];
          results.stats.scraped++;
        } else {
          results.destinations[destination] = [];
          results.stats.failed++;
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_complete',
            origin,
            destination,
            success: result.success,
            flightCount: result.flights?.length || 0,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error(`Error scraping ${origin}-${destination}: ${error.message}`);
      results.destinations[destination] = [];
      results.stats.failed++;

      if (global.broadcast) {
        global.broadcast({
          type: 'bulk_route_error',
          origin,
          destination,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  results.success = results.stats.failed < results.stats.total;
  return results;
}

/**
 * Scrape all available routes
 * Returns hierarchical results: { origins: { origin: { destinations: { dest: flights[] } } } }
 */
async function scrapeAllRoutes(date, useCache = true) {
  const routeStorage = getRouteStorage();
  const cache = getCache();
  const allRoutes = routeStorage.getAllRoutes();
  const origins = routeStorage.getOrigins();

  if (allRoutes.length === 0) {
    return {
      success: false,
      error: 'No routes available. Please update routes first.'
    };
  }

  logger.info(`Scraping all ${allRoutes.length} routes for date ${date}`);

  const results = {
    date,
    origins: {},
    stats: {
      total: allRoutes.length,
      cached: 0,
      scraped: 0,
      failed: 0
    }
  };

  // Initialize structure
  origins.forEach(origin => {
    results.origins[origin] = {
      destinations: {}
    };
  });

  // Process all routes
  for (const route of allRoutes) {
    const { origin, destination } = route;

    try {
      // Check cache if enabled
      let cachedData = null;
      if (useCache && cache.shouldUseCache()) {
        cachedData = await cache.get(origin, destination, date);
      } else if (useCache) {
        cachedData = await cache.getUnchecked(origin, destination, date);
      }

      if (cachedData) {
        results.origins[origin].destinations[destination] = cachedData.flights || [];
        results.stats.cached++;
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_cached',
            origin,
            destination,
            flightCount: cachedData.flights?.length || 0,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // Scrape live
        const result = await scrapeFlights(origin, destination, date);
        
        if (result.success) {
          results.origins[origin].destinations[destination] = result.flights || [];
          results.stats.scraped++;
        } else {
          results.origins[origin].destinations[destination] = [];
          results.stats.failed++;
        }

        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_route_complete',
            origin,
            destination,
            success: result.success,
            flightCount: result.flights?.length || 0,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error(`Error scraping ${origin}-${destination}: ${error.message}`);
      results.origins[origin].destinations[destination] = [];
      results.stats.failed++;

      if (global.broadcast) {
        global.broadcast({
          type: 'bulk_route_error',
          origin,
          destination,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  results.success = results.stats.failed < results.stats.total;
  return results;
}

module.exports = {
  scrapeRoutesByOrigin,
  scrapeAllRoutes
};

