/**
 * Route Manager Module
 * Modular service for managing routes in the frontend
 */

class RouteManager {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.routes = [];
    this.origins = [];
    this.originsWithCities = [];
    this.destinationsMap = new Map(); // origin -> destinations[]
    this.destinationsWithCities = new Map(); // origin -> destinationsWithCities[]
  }

  /**
   * Load routes from API
   */
  async loadRoutes() {
    try {
      const response = await fetch(`${this.apiBase}/api/routes`);
      const data = await response.json();
      
      if (data.success) {
        this.routes = data.routes || [];
        this.buildMaps();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load routes:', error);
      return false;
    }
  }

  /**
   * Load origins from API
   */
  async loadOrigins() {
    try {
      const response = await fetch(`${this.apiBase}/api/routes/origins`);
      const data = await response.json();
      
      if (data.success) {
        this.origins = data.origins || [];
        this.originsWithCities = data.originsWithCities || [];
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load origins:', error);
      return false;
    }
  }

  /**
   * Load destinations for an origin
   */
  async loadDestinations(origin) {
    try {
      const response = await fetch(`${this.apiBase}/api/routes/destinations/${origin}`);
      const data = await response.json();
      
      if (data.success) {
        this.destinationsMap.set(origin, data.destinations || []);
        // Store city info for display
        if (!this.destinationsWithCities) {
          this.destinationsWithCities = new Map();
        }
        this.destinationsWithCities.set(origin, data.destinationsWithCities || []);
        return data.destinations || [];
      }
      return [];
    } catch (error) {
      console.error(`Failed to load destinations for ${origin}:`, error);
      return [];
    }
  }
  
  /**
   * Get display name for an origin (city name + IATA)
   */
  getOriginDisplay(iata) {
    if (!this.originsWithCities) return iata;
    const originData = this.originsWithCities.find(o => o.iata === iata);
    return originData ? originData.display : iata;
  }
  
  /**
   * Get display name for a destination (city name + IATA)
   */
  getDestinationDisplay(origin, destination) {
    if (!this.destinationsWithCities) return destination;
    const dests = this.destinationsWithCities.get(origin);
    if (!dests) return destination;
    const destData = dests.find(d => d.iata === destination);
    return destData ? destData.display : destination;
  }

  /**
   * Build internal maps from routes
   */
  buildMaps() {
    this.origins = [];
    this.destinationsMap.clear();

    this.routes.forEach(route => {
      if (!this.origins.includes(route.origin)) {
        this.origins.push(route.origin);
      }

      if (!this.destinationsMap.has(route.origin)) {
        this.destinationsMap.set(route.origin, []);
      }

      const dests = this.destinationsMap.get(route.origin);
      if (!dests.includes(route.destination)) {
        dests.push(route.destination);
      }
    });

    // Sort
    this.origins.sort();
    this.destinationsMap.forEach((dests, origin) => {
      dests.sort();
    });
  }

  /**
   * Get all origins
   */
  getOrigins() {
    return this.origins;
  }

  /**
   * Get destinations for an origin
   */
  getDestinations(origin) {
    return this.destinationsMap.get(origin) || [];
  }

  /**
   * Check if a route is valid
   */
  isValidRoute(origin, destination) {
    const dests = this.destinationsMap.get(origin);
    return dests ? dests.includes(destination) : false;
  }

  /**
   * Check if routes are loaded
   */
  hasRoutes() {
    return this.routes.length > 0;
  }

  /**
   * Get route count
   */
  getRouteCount() {
    return this.routes.length;
  }
}

