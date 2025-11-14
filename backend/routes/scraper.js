/**
 * Scraper API Routes
 */

const express = require('express');
const router = express.Router();
const { scrapeFlights } = require('../services/scraper');
const { scrapeRoutesByOrigin, scrapeAllRoutes } = require('../services/bulkScraper');
const { getRouteStorage } = require('../services/routeStorage');
const { getCache } = require('../services/cache');
const logger = require('../utils/logger');

/**
 * POST /api/scraper/scrape
 * Scrape flights for a single route
 */
router.post('/scrape', async (req, res) => {
  try {
    const { origin, destination, date } = req.body;

    if (!origin || !destination || !date) {
      return res.status(400).json({
        error: 'Missing required fields: origin, destination, date'
      });
    }

    // Validate IATA codes (3 letters)
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
      return res.status(400).json({
        error: 'Invalid IATA codes (must be 3 uppercase letters)'
      });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format (must be YYYY-MM-DD)'
      });
    }

    // Validate route exists (if routes are loaded)
    // Only validate if routes have been explicitly loaded (not just default empty state)
    const routeStorage = getRouteStorage();
    const routes = routeStorage.getRoutes();
    
    if (routes.length > 10) { // Only validate if we have a meaningful number of routes (more than default/test data)
      const isValid = routeStorage.isValidRoute(origin.toUpperCase(), destination.toUpperCase());
      if (!isValid) {
        logger.warn(`Route validation failed: ${origin.toUpperCase()}-${destination.toUpperCase()} not in route list`);
        return res.status(400).json({
          error: `Route ${origin.toUpperCase()}-${destination.toUpperCase()} is not available. Please update routes or select a valid route.`
        });
      }
    } else if (routes.length > 0) {
      logger.info(`Route validation skipped - only ${routes.length} routes loaded (likely test data)`);
    }

    logger.info(`Scraping ${origin}->${destination} on ${date}`);

    const result = await scrapeFlights(origin.toUpperCase(), destination.toUpperCase(), date);

    res.json(result);

  } catch (error) {
    logger.error('Scrape endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scraper/bulk
 * Scrape multiple routes
 */
router.post('/bulk', async (req, res) => {
  try {
    const { routes } = req.body;

    if (!routes || !Array.isArray(routes)) {
      return res.status(400).json({
        error: 'Invalid request: routes must be an array'
      });
    }

    if (routes.length === 0) {
      return res.status(400).json({
        error: 'No routes provided'
      });
    }

    const maxConcurrent = parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5;

    if (routes.length > 50) {
      return res.status(400).json({
        error: 'Maximum 50 routes per bulk request'
      });
    }

    logger.info(`Bulk scraping ${routes.length} routes`);

    // Send immediate response to prevent timeout
    res.json({
      status: 'started',
      totalRoutes: routes.length,
      message: 'Bulk scraping started. Monitor progress via WebSocket.'
    });

    // Process routes in batches (async)
    (async () => {
      const results = [];
      const batches = [];

      // Create batches
      for (let i = 0; i < routes.length; i += maxConcurrent) {
        batches.push(routes.slice(i, i + maxConcurrent));
      }

      // Process batches
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`);

        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_progress',
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            processed: results.length,
            total: routes.length,
            timestamp: new Date().toISOString()
          });
        }

        const batchResults = await Promise.all(
          batch.map(async (route) => {
            try {
              const result = await scrapeFlights(route.origin, route.destination, route.date);
              return { route, ...result };
            } catch (error) {
              return { route, success: false, error: error.message };
            }
          })
        );

        results.push(...batchResults);
      }

      // Send completion notification
      if (global.broadcast) {
        global.broadcast({
          type: 'bulk_complete',
          totalRoutes: routes.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
          timestamp: new Date().toISOString()
        });
      }

      logger.info(`Bulk scraping complete: ${results.filter(r => r.success).length}/${routes.length} successful`);
    })();

  } catch (error) {
    logger.error('Bulk scrape endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scraper/bulk-by-origin
 * Scrape all routes from a specific origin
 */
router.post('/bulk-by-origin', async (req, res) => {
  try {
    const { origin, date, useCache = true } = req.body;

    if (!origin || !date) {
      return res.status(400).json({
        error: 'Missing required fields: origin, date'
      });
    }

    if (!/^[A-Z]{3}$/.test(origin)) {
      return res.status(400).json({
        error: 'Invalid origin IATA code'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format (must be YYYY-MM-DD)'
      });
    }

    logger.info(`Bulk scraping all routes from ${origin} for date ${date}`);

    // Send immediate response
    res.json({
      status: 'started',
      origin,
      date,
      message: 'Bulk scraping started. Monitor progress via WebSocket.'
    });

    // Process asynchronously
    (async () => {
      try {
        const result = await scrapeRoutesByOrigin(origin.toUpperCase(), date, useCache);
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_by_origin_complete',
            origin,
            date,
            ...result,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logger.error(`Bulk by origin failed: ${error.message}`);
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_by_origin_error',
            origin,
            date,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    })();

  } catch (error) {
    logger.error('Bulk by origin endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scraper/bulk-all
 * Scrape all available routes
 */
router.post('/bulk-all', async (req, res) => {
  try {
    const { date, useCache = true } = req.body;

    if (!date) {
      return res.status(400).json({
        error: 'Missing required field: date'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format (must be YYYY-MM-DD)'
      });
    }

    const routeStorage = getRouteStorage();
    const routeCount = routeStorage.getRoutes().length;

    if (routeCount === 0) {
      return res.status(400).json({
        error: 'No routes available. Please update routes first via /api/routes/update'
      });
    }

    logger.info(`Bulk scraping all ${routeCount} routes for date ${date}`);

    // Send immediate response
    res.json({
      status: 'started',
      date,
      totalRoutes: routeCount,
      message: 'Bulk scraping started. This may take a while. Monitor progress via WebSocket.'
    });

    // Process asynchronously
    (async () => {
      try {
        const result = await scrapeAllRoutes(date, useCache);
        
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_all_complete',
            date,
            ...result,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logger.error(`Bulk all failed: ${error.message}`);
        if (global.broadcast) {
          global.broadcast({
            type: 'bulk_all_error',
            date,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    })();

  } catch (error) {
    logger.error('Bulk all endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scraper/status
 * Get scraper status and configuration
 */
router.get('/status', (req, res) => {
  const { getProxyManager } = require('../services/decodoProxyManager');
  const proxyManager = getProxyManager();
  const routeStorage = getRouteStorage();
  const cache = getCache();

  res.json({
    scraperMethod: process.env.SCRAPER_METHOD || 'playwright',
    timeoutSeconds: parseInt(process.env.SCRAPER_TIMEOUT_SECONDS) || 90,
    maxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
    maxConcurrent: parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5,
    decodoEnabled: !!proxyManager,
    proxyStats: proxyManager ? proxyManager.getStatistics() : null,
    wsConnections: global.wsClients ? global.wsClients.size : 0,
    routesAvailable: routeStorage.getRoutes().length,
    cacheEnabled: cache.shouldUseCache(),
    cacheStats: cache.getStats()
  });
});

module.exports = router;
