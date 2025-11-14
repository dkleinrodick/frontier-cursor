/**
 * Scraper API Routes
 */

const express = require('express');
const router = express.Router();
const { scrapeFlights } = require('../services/scraper');
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

    logger.info(`Scraping ${origin}->${destination} on ${date}`);

    const result = await scrapeFlights(origin, destination, date);

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
 * GET /api/scraper/status
 * Get scraper status and configuration
 */
router.get('/status', (req, res) => {
  const { getProxyManager } = require('../services/decodoProxyManager');
  const proxyManager = getProxyManager();

  res.json({
    scraperMethod: process.env.SCRAPER_METHOD || 'playwright',
    timeoutSeconds: parseInt(process.env.SCRAPER_TIMEOUT_SECONDS) || 90,
    maxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
    maxConcurrent: parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5,
    decodoEnabled: !!proxyManager,
    proxyStats: proxyManager ? proxyManager.getStatistics() : null,
    wsConnections: global.wsClients ? global.wsClients.size : 0
  });
});

module.exports = router;
