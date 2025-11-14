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
 * GET /api/proxy/test
 * Test a proxy connection
 */
router.get('/test', async (req, res) => {
  try {
    const proxyManager = getProxyManager();

    if (!proxyManager) {
      return res.status(503).json({
        error: 'Decodo proxy manager not initialized'
      });
    }

    const proxy = proxyManager.getNextProxy();

    if (!proxy) {
      return res.status(503).json({
        error: 'No proxies available'
      });
    }

    // Simple test: try to get proxy info
    const testResult = {
      success: true,
      proxyId: proxy.proxyId,
      host: `${proxy.host}:${proxy.port}`,
      timestamp: new Date().toISOString()
    };

    proxyManager.releaseProxy(proxy.proxyId, true);

    res.json(testResult);

  } catch (error) {
    logger.error('Proxy test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
