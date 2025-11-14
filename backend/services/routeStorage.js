/**
 * Route Storage Service
 * Manages storage and retrieval of available flight routes
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const ROUTES_DIR = path.join(__dirname, '../../cache');
const ROUTES_FILE = path.join(ROUTES_DIR, 'routes.json');

class RouteStorage {
  constructor() {
    this.routes = [];
    this.routeMap = null;
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(ROUTES_DIR, { recursive: true });
      await this.load();
    } catch (error) {
      logger.error(`Failed to initialize route storage: ${error.message}`);
    }
  }

  async load() {
    try {
      const data = await fs.readFile(ROUTES_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.routes = parsed.routes || [];
      this.routeMap = this.buildRouteMap(this.routes);
      logger.info(`Loaded ${this.routes.length} routes from storage`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to load routes: ${error.message}`);
      }
      this.routes = [];
      this.routeMap = this.buildRouteMap(this.routes);
    }
  }

  async save(routes) {
    try {
      this.routes = routes;
      this.routeMap = this.buildRouteMap(routes);
      
      const data = {
        routes: this.routes,
        lastUpdated: new Date().toISOString(),
        count: this.routes.length
      };

      await fs.writeFile(ROUTES_FILE, JSON.stringify(data, null, 2));
      logger.info(`Saved ${this.routes.length} routes to storage`);
    } catch (error) {
      logger.error(`Failed to save routes: ${error.message}`);
      throw error;
    }
  }

  buildRouteMap(routes) {
    const routeMap = {
      origins: new Set(),
      destinations: new Map() // origin -> Set of destinations
    };

    routes.forEach(route => {
      routeMap.origins.add(route.origin);
      
      if (!routeMap.destinations.has(route.origin)) {
        routeMap.destinations.set(route.origin, new Set());
      }
      
      routeMap.destinations.get(route.origin).add(route.destination);
    });

    return routeMap;
  }

  getRoutes() {
    return this.routes;
  }

  getOrigins() {
    if (!this.routeMap || !this.routeMap.origins) {
      return [];
    }
    return Array.from(this.routeMap.origins).sort();
  }

  getDestinations(origin) {
    if (!origin || !this.routeMap || !this.routeMap.destinations) {
      return [];
    }
    const destSet = this.routeMap.destinations.get(origin);
    return destSet ? Array.from(destSet).sort() : [];
  }

  isValidRoute(origin, destination) {
    if (!this.routeMap || !this.routeMap.destinations) {
      return false;
    }
    const destSet = this.routeMap.destinations.get(origin);
    return destSet ? destSet.has(destination) : false;
  }

  getAllRoutesForOrigin(origin) {
    if (!this.routeMap || !this.routeMap.destinations) {
      return [];
    }
    const destSet = this.routeMap.destinations.get(origin);
    if (!destSet) {
      return [];
    }
    return Array.from(destSet).map(dest => ({
      origin,
      destination: dest
    }));
  }

  getAllRoutes() {
    return this.routes;
  }

  getStats() {
    return {
      totalRoutes: this.routes.length,
      totalOrigins: this.routeMap && this.routeMap.origins ? this.routeMap.origins.size : 0,
      lastUpdated: null // Will be set asynchronously if needed
    };
  }

  async getStatsAsync() {
    const lastUpdated = await this.getLastUpdated();
    return {
      totalRoutes: this.routes.length,
      totalOrigins: this.routeMap && this.routeMap.origins ? this.routeMap.origins.size : 0,
      lastUpdated
    };
  }

  async getLastUpdated() {
    try {
      const data = await fs.readFile(ROUTES_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.lastUpdated || null;
    } catch (error) {
      return null;
    }
  }
}

// Singleton instance
let routeStorageInstance = null;

function getRouteStorage() {
  if (!routeStorageInstance) {
    routeStorageInstance = new RouteStorage();
  }
  return routeStorageInstance;
}

module.exports = { getRouteStorage };

