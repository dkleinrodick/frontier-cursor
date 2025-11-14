/**
 * Proxy Management API Routes
 */

const express = require('express');
const router = express.Router();
const { getProxyManager } = require('../services/decodoProxyManager');
const logger = require('../utils/logger');

/**
 * GET /api/proxy/stats
 * Get proxy statistics
 */
router.get('/stats', (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized',
        hint: 'Configure DECODO_USERNAME and DECODO_PASSWORD in .env'
      });
    }

    const stats = proxyManager.getStatistics();
    res.json(stats);

  } catch (error) {
    logger.error('Proxy stats endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/reset
 * Reset proxy statistics
 */
router.post('/reset', (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    proxyManager.resetStatistics();

    logger.info('Proxy statistics reset');

    res.json({
      success: true,
      message: 'Proxy statistics reset'
    });

  } catch (error) {
    logger.error('Proxy reset endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/proxy/test/:proxyId
 * Test a specific proxy connection
 */
router.get('/test/:proxyId', async (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    const { proxyId } = req.params;
    const result = await proxyManager.testProxy(proxyId);

    res.json(result);

  } catch (error) {
    logger.error('Proxy test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/test-all
 * Test all proxies
 */
router.post('/test-all', async (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    // Send immediate response, test in background
    res.json({
      status: 'started',
      message: 'Testing all proxies. Results will be available via WebSocket and stats endpoint.'
    });

    // Test proxies asynchronously
    (async () => {
      try {
        const results = await proxyManager.testAllProxies();

        if (global.broadcast) {
          global.broadcast({
            type: 'proxy_test_complete',
            ...results,
            timestamp: new Date().toISOString()
          });
        }

        logger.info(`Proxy testing complete: ${results.working}/${results.total} working`);
      } catch (error) {
        logger.error(`Proxy testing failed: ${error.message}`);
        if (global.broadcast) {
          global.broadcast({
            type: 'proxy_test_error',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    })();

  } catch (error) {
    logger.error('Proxy test-all endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/:proxyId/enable
 * Enable a proxy
 */
router.post('/:proxyId/enable', (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    const { proxyId } = req.params;
    const result = proxyManager.setProxyEnabled(proxyId, true);

    res.json(result);

  } catch (error) {
    logger.error('Proxy enable endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/:proxyId/disable
 * Disable a proxy
 */
router.post('/:proxyId/disable', (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    const { proxyId } = req.params;
    const reason = req.body.reason || 'Manual disable';
    const result = proxyManager.setProxyEnabled(proxyId, false, reason);

    res.json(result);

  } catch (error) {
    logger.error('Proxy disable endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/update
 * Update proxy list (add or replace)
 * Body: { proxies: ["host:port", ...], replace: true/false, username: "...", password: "..." }
 */
router.post('/update', async (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    const { proxies, replace = false, username, password } = req.body;

    if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
      return res.status(400).json({
        error: 'proxies must be a non-empty array of "host:port" or "host:port:username:password" strings'
      });
    }

    // Update manager default credentials if provided
    if (username && password) {
      proxyManager.username = username;
      proxyManager.password = password;
      logger.info('Proxy manager default credentials updated');
    }

    // Update proxies with default credentials (proxies can override with embedded credentials)
    const result = proxyManager.updateProxies(proxies, replace, username, password);

    res.json(result);

  } catch (error) {
    logger.error('Proxy update endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/proxy/test-batch
 * Test multiple proxies before adding them
 * Body: { proxies: ["host:port", ...], username: "...", password: "..." }
 */
router.post('/test-batch', async (req, res) => {
  try {
    const { proxies, username, password } = req.body;

    if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
      return res.status(400).json({
        error: 'proxies must be a non-empty array'
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        error: 'username and password are required'
      });
    }

    // Send immediate response, test in background
    res.json({
      status: 'started',
      total: proxies.length,
      message: 'Testing proxies. Results will be available via WebSocket and response.'
    });

    // Test proxies asynchronously
    (async () => {
      const results = [];
      const { DecodoProxyManager } = require('../services/decodoProxyManager');

      for (const proxyStr of proxies) {
        const parts = proxyStr.split(':');
        if (parts.length < 2) {
          results.push({
            proxy: proxyStr,
            success: false,
            error: 'Invalid format. Expected "host:port" or "host:port:username:password"'
          });
          continue;
        }

        const host = parts[0];
        const port = parseInt(parts[1]);
        
        // Extract username/password from proxy string if provided, otherwise use defaults
        let proxyUsername = username;
        let proxyPassword = password;
        
        if (parts.length >= 4) {
          // Format: host:port:username:password
          proxyUsername = parts[2];
          proxyPassword = parts.slice(3).join(':'); // Handle passwords with colons
        } else if (parts.length === 3) {
          // Format: host:port:username (password missing, use default)
          proxyUsername = parts[2];
          // password stays as default
        }
        // If 2 parts, use default username/password

        const result = await DecodoProxyManager.testProxyConnection(host, port, proxyUsername, proxyPassword);
        results.push({
          proxy: proxyStr,
          ...result
        });

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const working = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      if (global.broadcast) {
        global.broadcast({
          type: 'proxy_batch_test_complete',
          total: proxies.length,
          working,
          failed,
          results,
          timestamp: new Date().toISOString()
        });
      }

      logger.info(`Proxy batch test complete: ${working}/${proxies.length} working`);
    })();

  } catch (error) {
    logger.error('Proxy test-batch endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
