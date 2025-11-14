/**
 * City Name to IATA Code Mapping
 * Maps common city names to their IATA airport codes
 * This is a modular service that can be expanded or replaced
 */

const cityToIataMap = {
  // Major US Cities
  'atlanta': 'ATL',
  'austin': 'AUS',
  'baltimore': 'BWI',
  'boston': 'BOS',
  'buffalo': 'BUF',
  'charlotte': 'CLT',
  'chicago': 'ORD',
  'cincinnati': 'CVG',
  'cleveland': 'CLE',
  'columbus': 'CMH',
  'dallas': 'DFW',
  'denver': 'DEN',
  'detroit': 'DTW',
  'houston': 'IAH',
  'indianapolis': 'IND',
  'jacksonville': 'JAX',
  'kansas city': 'MCI',
  'las vegas': 'LAS',
  'los angeles': 'LAX',
  'miami': 'MIA',
  'milwaukee': 'MKE',
  'minneapolis': 'MSP',
  'minneapolis/st. paul': 'MSP',
  'nashville': 'BNA',
  'new orleans': 'MSY',
  'new york': 'JFK',
  'new york city': 'JFK',
  'newark': 'EWR',
  'norfolk': 'ORF',
  'oklahoma city': 'OKC',
  'omaha': 'OMA',
  'orlando': 'MCO',
  'philadelphia': 'PHL',
  'phoenix': 'PHX',
  'pittsburgh': 'PIT',
  'raleigh': 'RDU',
  'richmond': 'RIC',
  'san antonio': 'SAT',
  'san diego': 'SAN',
  'san francisco': 'SFO',
  'seattle': 'SEA',
  'st. louis': 'STL',
  'st louis': 'STL',
  'tampa': 'TPA',
  'washington': 'DCA',
  'washington, d.c.': 'DCA',
  'washington d.c.': 'DCA',
  
  // International
  'cancun': 'CUN',
  'cabo san lucas': 'SJD',
  'puerto vallarta': 'PVR',
  'san juan': 'SJU',
  'aguadilla': 'BQN',
  'punta cana': 'PUJ',
  'montego bay': 'MBJ',
  'nassau': 'NAS',
  'oranjestad': 'AUA',
  'st. maarten': 'SXM',
  'st maarten': 'SXM',
  'guatemala city': 'GUA',
  'san salvador': 'SAL',
  'san pedro sula': 'SAP',
  'san jose, cr': 'SJO',
  'san jose cr': 'SJO',
  
  // Other US Cities
  'fort lauderdale': 'FLL',
  'fort myers': 'RSW',
  'west palm beach': 'PBI',
  'hartford': 'BDL',
  'syracuse': 'SYR',
  'trenton': 'TTN',
  'long island': 'ISP',
  'islip': 'ISP',
  'burlington': 'BTV',
  'portland': 'PDX',
  'portland, me': 'PWM',
  'sacramento': 'SMF',
  'san jose, ca': 'SJC',
  'san jose': 'SJC',
  'salt lake city': 'SLC',
  'reno': 'RNO',
  'tucson': 'TUS',
  'el paso': 'ELP',
  'corpus christi': 'CRP',
  'little rock': 'LIT',
  'memphis': 'MEM',
  'knoxville': 'TYS',
  'des moines': 'DSM',
  'cedar rapids': 'CID',
  'fargo': 'FAR',
  'sioux falls': 'FSD',
  'missoula': 'MSO',
  'spokane': 'GEG',
  'boise': 'BOI',
  'grand rapids': 'GRR',
  'madison': 'MSN',
  'green bay': 'GRB',
  'bentonville': 'XNA',
  'fayetteville': 'XNA',
  'bentonville/fayetteville': 'XNA',
  'burbank': 'BUR',
  'ontario': 'ONT',
  'ontario/la': 'ONT',
  'palm springs': 'PSP',
  'pensacola': 'PNS',
  'sarasota': 'SRQ',
  'myrtle beach': 'MYR',
  'charleston': 'CHS',
  'savannah': 'SAV',
  'harrisburg': 'MDT',
  'vail': 'EGE',
  'tulsa': 'TUL',
  'providenciales': 'PLS',
  'providence island': 'PLS',
  'ponce': 'PSE',
  'santo domingo': 'SDQ',
  'bridgetown': 'BGI',
  'port-of-spain': 'POS',
  'port of spain': 'POS',
  'saint croix': 'STX',
  'st. thomas': 'STT',
  'st thomas': 'STT',
  'saint john\'s': 'ANU',
  'saint johns': 'ANU',
  'st. john\'s': 'ANU',
  'st johns': 'ANU',
  'santiago de los caballeros': 'STI',
  'puerto plata': 'POP',
  'orange county': 'SNA',
  'santa ana': 'SNA',
  'santa ana, ca': 'SNA',
};

/**
 * Cities with multiple airports
 * When a city has multiple airports, we create routes for all of them
 */
const multiAirportCities = {
  'chicago': ['ORD', 'MDW'],
  'chicago, il': ['ORD', 'MDW'],
  // Add more multi-airport cities as needed
  // 'new york': ['JFK', 'LGA'], // Note: EWR is Newark, separate city
  // 'los angeles': ['LAX', 'BUR', 'ONT', 'SNA'], // Multiple airports in LA area
  // 'san francisco': ['SFO', 'SJC', 'OAK'], // Bay Area airports
  // 'washington': ['DCA', 'IAD'], // Note: BWI is Baltimore, separate city
};

/**
 * Convert city name to IATA code(s)
 * Returns a single IATA code string, or an array if the city has multiple airports
 * Handles various formats and variations
 */
function cityToIata(cityName) {
  if (!cityName) return null;
  
  // Normalize: lowercase, remove extra spaces, remove commas
  const normalized = cityName
    .toLowerCase()
    .trim()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' ');
  
  // Check for multi-airport cities first
  if (multiAirportCities[normalized]) {
    return multiAirportCities[normalized];
  }
  
  // Try partial matches for multi-airport cities (e.g., "chicago, il" -> "chicago")
  const parts = normalized.split(/\s+/);
  for (let i = parts.length; i > 0; i--) {
    const partial = parts.slice(0, i).join(' ');
    if (multiAirportCities[partial]) {
      return multiAirportCities[partial];
    }
  }
  
  // Direct lookup for single-airport cities
  if (cityToIataMap[normalized]) {
    return cityToIataMap[normalized];
  }
  
  // Try partial matches (e.g., "atlanta, ga" -> "atlanta")
  for (let i = parts.length; i > 0; i--) {
    const partial = parts.slice(0, i).join(' ');
    if (cityToIataMap[partial]) {
      return cityToIataMap[partial];
    }
  }
  
  // Try matching just the first word (for cases like "atlanta, ga")
  if (parts.length > 0 && cityToIataMap[parts[0]]) {
    return cityToIataMap[parts[0]];
  }
  
  // Special case: "san jose" - default to SJC (California) unless context suggests CR
  // This is a limitation - ideally we'd have more context
  if (normalized.includes('san jose')) {
    // If it mentions "CR" or "costa rica", use SJO, otherwise SJC
    if (normalized.includes('cr') || normalized.includes('costa rica')) {
      return 'SJO';
    }
    return 'SJC';
  }
  
  return null;
}

/**
 * Extract city name from link text
 * Formats: "City - City, State" or "City, State - City, State"
 */
function extractCitiesFromText(text) {
  if (!text) return null;
  
  // Split by " - " or " – " (different dash types)
  const parts = text.split(/\s*[-–]\s*/);
  if (parts.length !== 2) return null;
  
  const origin = parts[0].trim();
  const destination = parts[1].trim();
  
  // Remove state abbreviations from destination (e.g., "Miami, FL" -> "Miami")
  const destCity = destination.split(',')[0].trim();
  
  return {
    originCity: origin,
    destinationCity: destCity
  };
}

/**
 * Extract city names from URL
 * Format: /en/flights-from-{origin}-to-{destination}
 * Examples: /en/flights-from-aguadilla-to-miami, /en/flights-from-atlanta-to-austin
 */
function extractCitiesFromUrl(url) {
  if (!url) return null;
  
  // Match pattern: /flights-from-{origin}-to-{destination}
  // Handle both /en/flights-from-... and /flights-from-...
  // Examples: /en/flights-from-aguadilla-to-miami, /flights-from-atlanta-to-austin
  const match = url.match(/\/flights-from-([^-]+(?:-[^-]+)*?)-to-(.+?)(?:\?|$|\/)/);
  if (!match) {
    // Try without leading slash
    const match2 = url.match(/flights-from-([^-]+(?:-[^-]+)*?)-to-(.+?)(?:\?|$|\/)/);
    if (!match2) return null;
    
    const originCity = match2[1].replace(/-/g, ' ').trim();
    const destinationCity = match2[2].replace(/-/g, ' ').trim();
    
    return {
      originCity,
      destinationCity
    };
  }
  
  // Convert hyphens to spaces and clean up
  const originCity = match[1].replace(/-/g, ' ').trim();
  const destinationCity = match[2].replace(/-/g, ' ').trim();
  
  return {
    originCity,
    destinationCity
  };
}

/**
 * Reverse mapping: IATA code to city name
 * Used for displaying airport names in UI
 */
function iataToCityName(iata) {
  if (!iata) return null;
  
  const iataUpper = iata.toUpperCase();
  
  // Create reverse map from cityToIataMap
  const reverseMap = {};
  for (const [city, code] of Object.entries(cityToIataMap)) {
    if (!reverseMap[code] || city.length > reverseMap[code].length) {
      // Prefer longer/more specific city names
      reverseMap[code] = city;
    }
  }
  
  // Capitalize city name properly
  const cityName = reverseMap[iataUpper];
  if (!cityName) return iataUpper; // Fallback to IATA if not found
  
  // Capitalize first letter of each word
  return cityName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  cityToIata,
  iataToCityName,
  extractCitiesFromText,
  extractCitiesFromUrl,
  cityToIataMap
};

