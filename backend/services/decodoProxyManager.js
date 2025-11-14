/**
 * Decodo Proxy Manager
 * Manages Decodo residential proxies with rotation and rate limiting
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '../../cache/proxy-state.json');

class ProxyUsage {
  constructor(proxyId, host, port) {
    this.proxyId = proxyId;
    this.host = host;
    this.port = port;
    this.lastUsed = null;
    this.useCount = 0;
    this.recentUses = [];
    this.totalRequests = 0;
    this.failedRequests = 0;
  }

  canUse(maxUsesPerMinute = 2) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.recentUses = this.recentUses.filter(t => t > oneMinuteAgo);
    return this.recentUses.length < maxUsesPerMinute;
  }

  markUsed() {
    const now = Date.now();
    this.lastUsed = now;
    this.recentUses.push(now);
    this.useCount++;
    this.totalRequests++;
  }

  markFailed() {
    this.failedRequests++;
  }

  getSuccessRate() {
    if (this.totalRequests === 0) return 100.0;
    return ((this.totalRequests - this.failedRequests) / this.totalRequests) * 100;
  }
}

class DecodoProxyManager {
  constructor(username, password, maxUsesPerMinute = 2, maxWorkers = 2) {
    this.username = username;
    this.password = password;
    this.maxUsesPerMinute = maxUsesPerMinute;
    this.maxWorkers = maxWorkers;

    this.proxies = Array.from({ length: 10 }, (_, i) =>
      new ProxyUsage(`decodo-${i + 1}`, 'dc.decodo.com', 10001 + i)
    );

    this.currentIndex = this.loadState();
    this.activeWorkers = 0;

    logger.info(`Decodo proxy manager created with ${this.proxies.length} proxies (starting at index ${this.currentIndex})`);
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        logger.info(`Loaded proxy state: last index was ${data.currentIndex}`);
        return data.currentIndex || 0;
      }
    } catch (error) {
      logger.warn(`Failed to load proxy state: ${error.message}`);
    }
    return 0;
  }

  saveState() {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify({ currentIndex: this.currentIndex }));
    } catch (error) {
      logger.error(`Failed to save proxy state: ${error.message}`);
    }
  }

  getNextProxy() {
    if (this.activeWorkers >= this.maxWorkers) {
      return null;
    }

    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      this.saveState(); // Persist rotation state
      attempts++;

      if (proxy.canUse(this.maxUsesPerMinute)) {
        proxy.markUsed();
        this.activeWorkers++;

        return {
          proxyId: proxy.proxyId,
          host: proxy.host,
          port: proxy.port,
          username: this.username,
          password: this.password,
          httpProxy: `http://${this.username}:${this.password}@${proxy.host}:${proxy.port}`,
          playwrightConfig: {
            server: `http://${proxy.host}:${proxy.port}`,
            username: this.username,
            password: this.password
          }
        };
      }
    }

    return null;
  }

  releaseProxy(proxyId, success = true) {
    if (this.activeWorkers > 0) {
      this.activeWorkers--;
    }

    if (!success) {
      const proxy = this.proxies.find(p => p.proxyId === proxyId);
      if (proxy) proxy.markFailed();
    }
  }

  async waitForAvailableProxy(timeoutMs = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const proxy = this.getNextProxy();
      if (proxy) return proxy;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return null;
  }

  getStatistics() {
    return {
      totalProxies: this.proxies.length,
      activeWorkers: this.activeWorkers,
      maxWorkers: this.maxWorkers,
      maxUsesPerMinute: this.maxUsesPerMinute,
      proxies: this.proxies.map(proxy => ({
        id: proxy.proxyId,
        host: `${proxy.host}:${proxy.port}`,
        totalRequests: proxy.totalRequests,
        failedRequests: proxy.failedRequests,
        successRate: Math.round(proxy.getSuccessRate() * 100) / 100,
        recentUses: proxy.recentUses.length,
        canUseNow: proxy.canUse(this.maxUsesPerMinute),
        lastUsed: proxy.lastUsed ? new Date(proxy.lastUsed).toISOString() : null
      }))
    };
  }

  resetStatistics() {
    this.proxies.forEach(proxy => {
      proxy.useCount = 0;
      proxy.recentUses = [];
      proxy.totalRequests = 0;
      proxy.failedRequests = 0;
      proxy.lastUsed = null;
    });
    logger.info('Proxy statistics reset');
  }
}

let _proxyManager = null;

function getProxyManager() {
  return _proxyManager;
}

function initializeProxyManager(username, password, maxUsesPerMinute = 2, maxWorkers = 2) {
  _proxyManager = new DecodoProxyManager(username, password, maxUsesPerMinute, maxWorkers);
  return _proxyManager;
}

module.exports = {
  DecodoProxyManager,
  getProxyManager,
  initializeProxyManager
};
