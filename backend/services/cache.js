const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const CACHE_DIR = path.join(__dirname, '../../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'flights-cache.json');
const CACHE_MAX_AGE_HOURS = 6;

class FlightCache {
  constructor() {
    this.cache = {};
    this.enabled = process.env.CACHE_ENABLED === 'true';
    this.init();
  }

  async init() {
    try {
      // Ensure cache directory exists
      await fs.mkdir(CACHE_DIR, { recursive: true });

      // Load existing cache
      await this.load();

      logger.info(`Flight cache initialized (${this.enabled ? 'enabled' : 'disabled'})`);
    } catch (error) {
      logger.error(`Failed to initialize cache: ${error.message}`);
    }
  }

  async load() {
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf8');
      this.cache = JSON.parse(data);
      logger.info(`Loaded ${Object.keys(this.cache).length} cached routes`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to load cache: ${error.message}`);
      }
      this.cache = {};
    }
  }

  async save() {
    try {
      await fs.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      logger.error(`Failed to save cache: ${error.message}`);
    }
  }

  getCacheKey(origin, destination, date) {
    return `${origin}-${destination}-${date}`;
  }

  isValidCache(entry) {
    if (!entry || !entry.timestamp) {
      return false;
    }

    const now = new Date();
    const cacheTime = new Date(entry.timestamp);

    // Check if cache is from a previous day
    const cacheDay = cacheTime.toISOString().split('T')[0];
    const currentDay = now.toISOString().split('T')[0];

    if (cacheDay !== currentDay) {
      return false;
    }

    // Check if cache is older than 6 hours
    const ageInHours = (now - cacheTime) / (1000 * 60 * 60);

    if (ageInHours > CACHE_MAX_AGE_HOURS) {
      return false;
    }

    return true;
  }

  async get(origin, destination, date) {
    if (!this.enabled) {
      return null;
    }

    const key = this.getCacheKey(origin, destination, date);
    const entry = this.cache[key];

    if (!entry) {
      return null;
    }

    if (!this.isValidCache(entry)) {
      // Cache expired, remove it
      delete this.cache[key];
      await this.save();
      logger.info(`Cache expired for ${key}`);
      return null;
    }

    logger.info(`Cache hit for ${key} (age: ${Math.round((Date.now() - new Date(entry.timestamp)) / (1000 * 60))} minutes)`);
    return entry.data;
  }

  async set(origin, destination, date, data) {
    if (!this.enabled) {
      return;
    }

    const key = this.getCacheKey(origin, destination, date);

    this.cache[key] = {
      timestamp: new Date().toISOString(),
      data: data
    };

    await this.save();
    logger.info(`Cached ${data.flights?.length || 0} flights for ${key}`);
  }

  async clear() {
    this.cache = {};
    await this.save();
    logger.info('Cache cleared');
  }

  getStats() {
    const entries = Object.keys(this.cache).length;
    const validEntries = Object.values(this.cache).filter(entry => this.isValidCache(entry)).length;

    return {
      enabled: this.enabled,
      totalEntries: entries,
      validEntries: validEntries,
      expiredEntries: entries - validEntries
    };
  }
}

// Singleton instance
let cacheInstance = null;

function getCache() {
  if (!cacheInstance) {
    cacheInstance = new FlightCache();
  }
  return cacheInstance;
}

module.exports = { getCache };
