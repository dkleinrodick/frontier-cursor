/**
 * Configuration API Routes
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * GET /api/config
 * Get current configuration
 */
router.get('/', (req, res) => {
  res.json({
    server: {
      port: process.env.PORT || 3000,
      host: process.env.HOST || 'localhost',
      environment: process.env.NODE_ENV || 'development'
    },
    scraper: {
      method: process.env.SCRAPER_METHOD || 'playwright',
      timeoutSeconds: parseInt(process.env.SCRAPER_TIMEOUT_SECONDS) || 90,
      maxRetries: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
      concurrentRoutes: parseInt(process.env.SCRAPER_CONCURRENT_ROUTES) || 5
    },
    decodo: {
      enabled: !!(process.env.DECODO_USERNAME && process.env.DECODO_PASSWORD),
      maxUsesPerMinute: parseInt(process.env.DECODO_MAX_USES_PER_MINUTE) || 2,
      maxWorkers: parseInt(process.env.DECODO_MAX_WORKERS) || 3
    },
    cache: {
      enabled: process.env.CACHE_ENABLED === 'true',
      ttlHours: parseInt(process.env.CACHE_TTL_HOURS) || 24
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });
});

/**
 * GET /api/config/version
 * Get application version
 */
router.get('/version', (req, res) => {
  const packageJson = require('../../package.json');

  res.json({
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description
  });
});

/**
 * POST /api/config/update
 * Update configuration settings
 */
router.post('/update', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const updates = req.body;
    const ENV_FILE = path.join(__dirname, '../../.env');

    // Read current .env file
    let envContent = await fs.readFile(ENV_FILE, 'utf8');

    // Update each setting
    const allowedSettings = [
      'SCRAPER_METHOD',
      'SCRAPER_TIMEOUT_SECONDS',
      'SCRAPER_MAX_RETRIES',
      'SCRAPER_CONCURRENT_ROUTES',
      'DECODO_MAX_USES_PER_MINUTE',
      'DECODO_MAX_WORKERS',
      'LOG_LEVEL',
      'CACHE_ENABLED'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedSettings.includes(key)) {
        // Find and replace the line
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
          logger.info(`Updated ${key} to ${value}`);
        }
      } else {
        logger.warn(`Attempted to update disallowed setting: ${key}`);
      }
    }

    // Write back to .env file
    await fs.writeFile(ENV_FILE, envContent);

    res.json({
      success: true,
      message: 'Configuration updated. Restart server for changes to take effect.',
      updatedSettings: Object.keys(updates).filter(k => allowedSettings.includes(k))
    });

  } catch (error) {
    logger.error(`Failed to update configuration: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
});

/**
 * POST /api/config/clear-cache
 * Clear flight cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const { getCache } = require('../services/cache');
    const cache = getCache();
    await cache.clear();

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    logger.error(`Failed to clear cache: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

module.exports = router;
