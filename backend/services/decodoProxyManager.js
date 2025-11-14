/**
 * Decodo Proxy Manager
 * Manages Decodo residential proxies with rotation and rate limiting
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '../../cache/proxy-state.json');

class ProxyUsage {
  constructor(proxyId, host, port, username = null, password = null) {
    this.proxyId = proxyId;
    this.host = host;
    this.port = port;
    this.username = username; // Per-proxy username (optional, falls back to manager default)
    this.password = password; // Per-proxy password (optional, falls back to manager default)
    this.lastUsed = null;
    this.useCount = 0;
    this.recentUses = [];
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.disabled = false;
    this.disabledReason = null;
    this.lastTested = null;
    this.testResult = null; // 'working', 'failed', 'untested'
    
    // PerimeterX cooldown tracking
    this.perimeterXBlocks = []; // Array of timestamps when PerimeterX was hit
    this.cooldownUntil = null; // Timestamp when cooldown expires
    this.cooldownLevel = 0; // 0 = none, 1 = 20min, 2 = 2hr, 3 = 24hr, 4 = blacklisted
    this.blacklisted = false;
  }

  /**
   * Get username for this proxy (uses per-proxy or manager default)
   */
  getUsername(managerUsername) {
    return this.username || managerUsername;
  }

  /**
   * Get password for this proxy (uses per-proxy or manager default)
   */
  getPassword(managerPassword) {
    return this.password || managerPassword;
  }

  canUse(maxUsesPerMinute = 2) {
    // Check if blacklisted
    if (this.blacklisted) {
      return false;
    }

    // Check if in cooldown
    const now = Date.now();
    if (this.cooldownUntil && now < this.cooldownUntil) {
      return false;
    }

    // Check rate limiting
    const oneMinuteAgo = now - 60000;
    this.recentUses = this.recentUses.filter(t => t > oneMinuteAgo);
    return this.recentUses.length < maxUsesPerMinute;
  }

  /**
   * Record a PerimeterX block and apply cooldown logic
   */
  recordPerimeterXBlock() {
    const now = Date.now();
    const twentyMinutesAgo = now - (20 * 60 * 1000);

    // Add this block to the history
    this.perimeterXBlocks.push(now);

    // Clean old blocks (older than 20 minutes)
    this.perimeterXBlocks = this.perimeterXBlocks.filter(t => t > twentyMinutesAgo);

    // Count blocks in the last 20 minutes
    const recentBlocks = this.perimeterXBlocks.length;

    // Determine cooldown based on block count
    if (recentBlocks === 1) {
      // First block - no cooldown yet
      this.cooldownLevel = 0;
      this.cooldownUntil = null;
      logger.info(`Proxy ${this.proxyId}: First PerimeterX block (no cooldown)`);
    } else if (recentBlocks === 2) {
      // Second block within 20 minutes - 20 minute cooldown
      this.cooldownLevel = 1;
      this.cooldownUntil = now + (20 * 60 * 1000);
      logger.warn(`Proxy ${this.proxyId}: Second PerimeterX block - 20 minute cooldown`);
    } else if (recentBlocks === 3) {
      // Third block - 2 hour cooldown
      this.cooldownLevel = 2;
      this.cooldownUntil = now + (2 * 60 * 60 * 1000);
      logger.warn(`Proxy ${this.proxyId}: Third PerimeterX block - 2 hour cooldown`);
    } else if (recentBlocks === 4) {
      // Fourth block - 24 hour cooldown
      this.cooldownLevel = 3;
      this.cooldownUntil = now + (24 * 60 * 60 * 1000);
      logger.warn(`Proxy ${this.proxyId}: Fourth PerimeterX block - 24 hour cooldown`);
    } else if (recentBlocks >= 5) {
      // Fifth+ block - permanently blacklisted
      this.cooldownLevel = 4;
      this.blacklisted = true;
      this.cooldownUntil = null;
      logger.error(`Proxy ${this.proxyId}: Fifth+ PerimeterX block - PERMANENTLY BLACKLISTED`);
    }
  }

  /**
   * Record a successful request (resets PerimeterX counter)
   */
  recordSuccess() {
    const now = Date.now();

    // If we got a successful request, reset the PerimeterX counter
    // This allows the proxy to start fresh after proving it works
    if (this.perimeterXBlocks.length > 0 || this.cooldownLevel > 0) {
      if (this.cooldownLevel < 4) { // Don't reset if blacklisted
        logger.info(`Proxy ${this.proxyId}: Success after PerimeterX - resetting counter`);
        this.perimeterXBlocks = [];
        this.cooldownLevel = 0;
        this.cooldownUntil = null;
      }
    }

    // Mark as used
    this.markUsed();
  }

  /**
   * Get cooldown status information
   */
  getCooldownStatus() {
    const now = Date.now();
    
    if (this.blacklisted) {
      return {
        status: 'blacklisted',
        message: 'Permanently blacklisted (5+ PerimeterX blocks)',
        cooldownRemaining: null,
        blocksInWindow: this.perimeterXBlocks.length
      };
    }

    if (this.cooldownUntil && now < this.cooldownUntil) {
      const remaining = this.cooldownUntil - now;
      const minutes = Math.ceil(remaining / (60 * 1000));
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      let message = '';
      if (this.cooldownLevel === 1) {
        message = `20 minute cooldown (${minutes} min remaining)`;
      } else if (this.cooldownLevel === 2) {
        message = `2 hour cooldown (${hours}h ${mins}m remaining)`;
      } else if (this.cooldownLevel === 3) {
        message = `24 hour cooldown (${hours}h ${mins}m remaining)`;
      }

      return {
        status: 'cooldown',
        message,
        cooldownRemaining: remaining,
        cooldownLevel: this.cooldownLevel,
        blocksInWindow: this.perimeterXBlocks.length
      };
    }

    return {
      status: 'active',
      message: this.perimeterXBlocks.length > 0 
        ? `${this.perimeterXBlocks.length} PerimeterX block(s) in last 20 min`
        : 'Active',
      cooldownRemaining: null,
      blocksInWindow: this.perimeterXBlocks.length
    };
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
  constructor(username, password, maxUsesPerMinute = 2, maxWorkers = 2, proxyList = null) {
    this.username = username;
    this.password = password;
    this.maxUsesPerMinute = maxUsesPerMinute;
    this.maxWorkers = maxWorkers;

    // If proxyList is provided, use it; otherwise create default 10 proxies
    if (proxyList && Array.isArray(proxyList) && proxyList.length > 0) {
      this.proxies = proxyList.map((proxy, i) => {
        if (typeof proxy === 'string') {
          // Parse format: "host:port" or "host:port:username:password"
          const parts = proxy.split(':');
          if (parts.length >= 2) {
            const host = parts[0];
            const port = parseInt(parts[1]);
            let proxyUsername = null;
            let proxyPassword = null;
            
            // Extract credentials if provided
            if (parts.length >= 4) {
              proxyUsername = parts[2];
              proxyPassword = parts.slice(3).join(':'); // Handle passwords with colons
            }
            
            return new ProxyUsage(`decodo-${i + 1}`, host, port, proxyUsername, proxyPassword);
          }
        } else if (proxy.host && proxy.port) {
          return new ProxyUsage(`decodo-${i + 1}`, proxy.host, proxy.port, proxy.username, proxy.password);
        }
        // Fallback: create default proxy
        return new ProxyUsage(`decodo-${i + 1}`, 'dc.decodo.com', 10001 + i);
      });
    } else {
      // Default: 10 proxies
      this.proxies = Array.from({ length: 10 }, (_, i) =>
        new ProxyUsage(`decodo-${i + 1}`, 'dc.decodo.com', 10001 + i)
      );
    }

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

      // Skip disabled proxies
      if (proxy.disabled) {
        continue;
      }

      // Skip blacklisted proxies
      if (proxy.blacklisted) {
        continue;
      }

      // Skip proxies in cooldown
      if (proxy.cooldownUntil && Date.now() < proxy.cooldownUntil) {
        continue;
      }

      if (proxy.canUse(this.maxUsesPerMinute)) {
        proxy.markUsed();
        this.activeWorkers++;

        // Use per-proxy credentials if available, otherwise use manager default
        const username = proxy.getUsername(this.username);
        const password = proxy.getPassword(this.password);

        return {
          proxyId: proxy.proxyId,
          host: proxy.host,
          port: proxy.port,
          username: username,
          password: password,
          httpProxy: `http://${username}:${password}@${proxy.host}:${proxy.port}`,
          playwrightConfig: {
            server: `http://${proxy.host}:${proxy.port}`,
            username: username,
            password: password
          }
        };
      }
    }

    return null;
  }

  releaseProxy(proxyId, success = true, perimeterXBlock = false) {
    if (this.activeWorkers > 0) {
      this.activeWorkers--;
    }

    const proxy = this.proxies.find(p => p.proxyId === proxyId);
    if (!proxy) return;

    if (perimeterXBlock) {
      // Record PerimeterX block and apply cooldown
      proxy.recordPerimeterXBlock();
      proxy.markFailed();
    } else if (success) {
      // Record success - this may reset cooldown if expired
      proxy.recordSuccess();
    } else {
      // Other failure
      proxy.markFailed();
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
      enabledProxies: this.proxies.filter(p => !p.disabled && !p.blacklisted).length,
      disabledProxies: this.proxies.filter(p => p.disabled).length,
      blacklistedProxies: this.proxies.filter(p => p.blacklisted).length,
      cooldownProxies: this.proxies.filter(p => p.cooldownUntil && Date.now() < p.cooldownUntil).length,
      proxies: this.proxies.map(proxy => {
        const cooldownStatus = proxy.getCooldownStatus();
        return {
          id: proxy.proxyId,
          host: `${proxy.host}:${proxy.port}`,
          totalRequests: proxy.totalRequests,
          failedRequests: proxy.failedRequests,
          successRate: Math.round(proxy.getSuccessRate() * 100) / 100,
          recentUses: proxy.recentUses.length,
          canUseNow: proxy.canUse(this.maxUsesPerMinute) && !proxy.disabled && !proxy.blacklisted,
          lastUsed: proxy.lastUsed ? new Date(proxy.lastUsed).toISOString() : null,
          disabled: proxy.disabled,
          disabledReason: proxy.disabledReason,
          lastTested: proxy.lastTested ? new Date(proxy.lastTested).toISOString() : null,
          testResult: proxy.testResult,
          blacklisted: proxy.blacklisted,
          cooldownStatus: cooldownStatus.status,
          cooldownMessage: cooldownStatus.message,
          cooldownRemaining: cooldownStatus.cooldownRemaining,
          cooldownLevel: proxy.cooldownLevel,
          perimeterXBlocks: cooldownStatus.blocksInWindow,
          hasCustomCredentials: !!(proxy.username || proxy.password) // Indicates if proxy has embedded credentials
        };
      })
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

  /**
   * Test a specific proxy by making a real HTTP request
   */
  async testProxy(proxyId) {
    const proxy = this.proxies.find(p => p.proxyId === proxyId);
    if (!proxy) {
      throw new Error(`Proxy ${proxyId} not found`);
    }

    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);

    let browser = null;
    const testUrl = 'https://httpbin.org/ip'; // Simple endpoint that returns IP
    const testTimeout = 15000; // 15 second timeout for testing

    try {
      logger.info(`Testing proxy ${proxyId}...`);

      // Use per-proxy credentials if available, otherwise use manager default
      const username = proxy.getUsername(this.username);
      const password = proxy.getPassword(this.password);

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const context = await browser.newContext({
        proxy: {
          server: `http://${proxy.host}:${proxy.port}`,
          username: username,
          password: password
        }
      });

      const page = await context.newPage();
      page.setDefaultTimeout(testTimeout);

      const startTime = Date.now();
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: testTimeout });
      const elapsed = Date.now() - startTime;

      // Get the response to verify it worked
      const content = await page.content();
      const ipMatch = content.match(/"origin":\s*"([^"]+)"/);
      const detectedIP = ipMatch ? ipMatch[1] : 'unknown';

      await browser.close();

      proxy.lastTested = Date.now();
      proxy.testResult = 'working';
      proxy.disabled = false;
      proxy.disabledReason = null;

      logger.info(`Proxy ${proxyId} test successful (${elapsed}ms, IP: ${detectedIP})`);

      return {
        success: true,
        proxyId: proxy.proxyId,
        elapsed,
        detectedIP,
        message: `Proxy working (${elapsed}ms)`
      };

    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore
        }
      }

      proxy.lastTested = Date.now();
      proxy.testResult = 'failed';
      proxy.disabled = true;
      proxy.disabledReason = error.message;

      logger.warn(`Proxy ${proxyId} test failed: ${error.message}`);

      return {
        success: false,
        proxyId: proxy.proxyId,
        error: error.message,
        message: `Proxy test failed: ${error.message}`
      };
    }
  }

  /**
   * Test all proxies
   */
  async testAllProxies() {
    const results = [];
    logger.info(`Starting test for all ${this.proxies.length} proxies...`);

    for (const proxy of this.proxies) {
      const result = await this.testProxy(proxy.proxyId);
      results.push(result);
      // Small delay between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const working = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`Proxy testing complete: ${working} working, ${failed} failed`);

    return {
      total: this.proxies.length,
      working,
      failed,
      results
    };
  }

  /**
   * Enable or disable a proxy
   */
  setProxyEnabled(proxyId, enabled, reason = null) {
    const proxy = this.proxies.find(p => p.proxyId === proxyId);
    if (!proxy) {
      throw new Error(`Proxy ${proxyId} not found`);
    }

    proxy.disabled = !enabled;
    proxy.disabledReason = reason;

    if (enabled) {
      proxy.testResult = 'working';
      logger.info(`Proxy ${proxyId} enabled`);
    } else {
      logger.info(`Proxy ${proxyId} disabled: ${reason || 'manual'}`);
    }

    return {
      success: true,
      proxyId,
      enabled,
      message: `Proxy ${proxyId} ${enabled ? 'enabled' : 'disabled'}`
    };
  }

  /**
   * Update proxy list (add or replace)
   * Supports formats:
   * - "host:port" (uses manager default credentials)
   * - "host:port:username:password" (uses embedded credentials)
   */
  updateProxies(proxyList, replace = false, defaultUsername = null, defaultPassword = null) {
    if (!Array.isArray(proxyList) || proxyList.length === 0) {
      throw new Error('Proxy list must be a non-empty array');
    }

    const newProxies = proxyList.map((proxy, i) => {
      let host, port, username = null, password = null;
      
      if (typeof proxy === 'string') {
        // Parse format: "host:port" or "host:port:username:password"
        const parts = proxy.split(':');
        if (parts.length >= 2) {
          host = parts[0];
          port = parseInt(parts[1]);
          
          // If 4 parts, extract username and password
          if (parts.length >= 4) {
            username = parts[2];
            password = parts.slice(3).join(':'); // Handle passwords with colons
          } else if (parts.length === 3) {
            // Could be "host:port:username" but password missing, use default
            username = parts[2];
            password = defaultPassword;
          }
          // If 2 parts, use default credentials (username/password will be null)
        } else {
          throw new Error(`Invalid proxy format: ${proxy}. Expected "host:port" or "host:port:username:password"`);
        }
      } else if (proxy.host && proxy.port) {
        host = proxy.host;
        port = proxy.port;
        username = proxy.username || null;
        password = proxy.password || null;
      } else {
        throw new Error(`Invalid proxy format: ${JSON.stringify(proxy)}`);
      }

      // Check if proxy already exists
      const existing = this.proxies.find(p => p.host === host && p.port === port);
      if (existing && !replace) {
        // Update credentials if provided, but keep existing proxy with its stats
        if (username) existing.username = username;
        if (password) existing.password = password;
        return existing;
      }

      // Create new proxy with credentials
      return new ProxyUsage(`decodo-${i + 1}`, host, port, username, password);
    });

    if (replace) {
      this.proxies = newProxies;
      this.currentIndex = 0;
      logger.info(`Replaced all proxies with ${newProxies.length} new proxies`);
    } else {
      // Add new proxies, avoiding duplicates
      newProxies.forEach(newProxy => {
        const exists = this.proxies.some(p => p.host === newProxy.host && p.port === newProxy.port);
        if (!exists) {
          this.proxies.push(newProxy);
        }
      });
      logger.info(`Added ${newProxies.length} proxies. Total: ${this.proxies.length}`);
    }

    this.saveState();
    return {
      success: true,
      totalProxies: this.proxies.length,
      message: replace ? `Replaced with ${newProxies.length} proxies` : `Added ${newProxies.length} proxies. Total: ${this.proxies.length}`
    };
  }

  /**
   * Test a proxy before adding it (static method for testing without adding)
   */
  static async testProxyConnection(host, port, username, password) {
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);

    let browser = null;
    const testUrl = 'https://httpbin.org/ip';
    const testTimeout = 15000;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const context = await browser.newContext({
        proxy: {
          server: `http://${host}:${port}`,
          username: username,
          password: password
        }
      });

      const page = await context.newPage();
      page.setDefaultTimeout(testTimeout);

      const startTime = Date.now();
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: testTimeout });
      const elapsed = Date.now() - startTime;

      const content = await page.content();
      const ipMatch = content.match(/"origin":\s*"([^"]+)"/);
      const detectedIP = ipMatch ? ipMatch[1] : 'unknown';

      await browser.close();

      return {
        success: true,
        elapsed,
        detectedIP,
        message: `Proxy working (${elapsed}ms)`
      };

    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore
        }
      }

      return {
        success: false,
        error: error.message,
        message: `Proxy test failed: ${error.message}`
      };
    }
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
