/**
 * Frontier Airlines Flight Scraper - Production Server
 *
 * Features:
 * - RESTful API for flight scraping
 * - WebSocket for real-time updates
 * - Decodo proxy integration
 * - Route verification
 * - Production-ready with security, logging, compression
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const scraperRoutes = require('./routes/scraper');
const proxyRoutes = require('./routes/proxy');
const configRoutes = require('./routes/config');
const routeRoutes = require('./routes/routes');
const { initializeProxyManager } = require('./services/decodoProxyManager');
const logger = require('./utils/logger');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store WebSocket connections
global.wsClients = new Set();

wss.on('connection', (ws) => {
  logger.info('New WebSocket client connected');
  global.wsClients.add(ws);

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    global.wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
    global.wsClients.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Frontier Scraper WebSocket',
    timestamp: new Date().toISOString()
  }));
});

// Broadcast function for WebSocket
global.broadcast = (data) => {
  const message = JSON.stringify(data);
  global.wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        logger.error('Error sending WebSocket message:', error);
      }
    }
  });
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for demo
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API Routes
app.use('/api/scraper', scraperRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/config', configRoutes);
app.use('/api/routes', routeRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'development',
    wsConnections: global.wsClients.size
  });
});

// Serve index.html for root and any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize Decodo proxy manager if credentials provided
if (process.env.DECODO_USERNAME && process.env.DECODO_PASSWORD) {
  try {
    const maxUsesPerMinute = parseInt(process.env.DECODO_MAX_USES_PER_MINUTE) || 2;
    const maxWorkers = parseInt(process.env.DECODO_MAX_WORKERS) || 3;

    initializeProxyManager(
      process.env.DECODO_USERNAME,
      process.env.DECODO_PASSWORD,
      maxUsesPerMinute,
      maxWorkers
    );

    logger.info(`Decodo proxy manager initialized (${maxWorkers} workers, ${maxUsesPerMinute} uses/min)`);
  } catch (error) {
    logger.error('Failed to initialize Decodo proxy manager:', error);
  }
} else {
  logger.warn('Decodo credentials not configured - proxy features disabled');
}

// Start server
server.listen(PORT, HOST, () => {
  logger.info('='.repeat(80));
  logger.info(`🚀 Frontier Scraper Server v${require('../package.json').version}`);
  logger.info('='.repeat(80));
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Server: http://${HOST}:${PORT}`);
  logger.info(`WebSocket: ws://${HOST}:${PORT}`);
  logger.info(`Scraper Method: ${process.env.SCRAPER_METHOD || 'playwright'}`);
  logger.info(`Decodo Proxies: ${process.env.DECODO_USERNAME ? 'Enabled ✓' : 'Disabled ✗'}`);
  logger.info('='.repeat(80));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
