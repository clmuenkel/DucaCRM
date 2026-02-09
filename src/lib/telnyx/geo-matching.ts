/**
 * Geographic number matching for Telnyx
 * Selects the best outbound number based on the contact's state.
 * If there's an exact state match, uses that number.
 * If not, picks the number whose state is geographically closest.
 */

// ─── Area Code → US State ──────────────────────────────────────────────
// Comprehensive mapping of North American area codes to US states.
// Only US area codes included (Canada/Caribbean are omitted).
const AREA_CODE_TO_STATE: Record<string, string> = {
  // Alabama
  "205": "Alabama", "251": "Alabama", "256": "Alabama", "334": "Alabama", "938": "Alabama",
  // Alaska
  "907": "Alaska",
  // Arizona
  "480": "Arizona", "520": "Arizona", "602": "Arizona", "623": "Arizona", "928": "Arizona",
  // Arkansas
  "479": "Arkansas", "501": "Arkansas", "870": "Arkansas",
  // California
  "209": "California", "213": "California", "279": "California", "310": "California",
  "323": "California", "341": "California", "350": "California", "408": "California",
  "415": "California", "424": "California", "442": "California", "510": "California",
  "530": "California", "559": "California", "562": "California", "619": "California",
  "626": "California", "628": "California", "650": "California", "657": "California",
  "661": "California", "669": "California", "707": "California", "714": "California",
  "747": "California", "760": "California", "805": "California", "818": "California",
  "831": "California", "840": "California", "858": "California", "909": "California",
  "916": "California", "925": "California", "949": "California", "951": "California",
  // Colorado
  "303": "Colorado", "719": "Colorado", "720": "Colorado", "970": "Colorado",
  // Connecticut
  "203": "Connecticut", "475": "Connecticut", "860": "Connecticut", "959": "Connecticut",
  // Delaware
  "302": "Delaware",
  // Florida
  "239": "Florida", "305": "Florida", "321": "Florida", "352": "Florida", "386": "Florida",
  "407": "Florida", "561": "Florida", "689": "Florida", "727": "Florida", "754": "Florida",
  "772": "Florida", "786": "Florida", "813": "Florida", "850": "Florida", "863": "Florida",
  "904": "Florida", "941": "Florida", "954": "Florida",
  // Georgia
  "229": "Georgia", "404": "Georgia", "470": "Georgia", "478": "Georgia", "678": "Georgia",
  "706": "Georgia", "762": "Georgia", "770": "Georgia", "912": "Georgia", "943": "Georgia",
  // Hawaii
  "808": "Hawaii",
  // Idaho
  "208": "Idaho", "986": "Idaho",
  // Illinois
  "217": "Illinois", "224": "Illinois", "309": "Illinois", "312": "Illinois", "331": "Illinois",
  "618": "Illinois", "630": "Illinois", "708": "Illinois", "773": "Illinois", "779": "Illinois",
  "815": "Illinois", "847": "Illinois", "872": "Illinois",
  // Indiana
  "219": "Indiana", "260": "Indiana", "317": "Indiana", "463": "Indiana", "574": "Indiana",
  "765": "Indiana", "812": "Indiana", "930": "Indiana",
  // Iowa
  "319": "Iowa", "515": "Iowa", "563": "Iowa", "641": "Iowa", "712": "Iowa",
  // Kansas
  "316": "Kansas", "620": "Kansas", "785": "Kansas", "913": "Kansas",
  // Kentucky
  "270": "Kentucky", "364": "Kentucky", "502": "Kentucky", "606": "Kentucky", "859": "Kentucky",
  // Louisiana
  "225": "Louisiana", "318": "Louisiana", "337": "Louisiana", "504": "Louisiana", "985": "Louisiana",
  // Maine
  "207": "Maine",
  // Maryland
  "240": "Maryland", "301": "Maryland", "410": "Maryland", "443": "Maryland", "667": "Maryland",
  // Massachusetts
  "339": "Massachusetts", "351": "Massachusetts", "413": "Massachusetts", "508": "Massachusetts",
  "617": "Massachusetts", "774": "Massachusetts", "781": "Massachusetts", "857": "Massachusetts",
  "978": "Massachusetts",
  // Michigan
  "231": "Michigan", "248": "Michigan", "269": "Michigan", "313": "Michigan", "517": "Michigan",
  "586": "Michigan", "616": "Michigan", "734": "Michigan", "810": "Michigan", "906": "Michigan",
  "947": "Michigan", "989": "Michigan",
  // Minnesota
  "218": "Minnesota", "320": "Minnesota", "507": "Minnesota", "612": "Minnesota",
  "651": "Minnesota", "763": "Minnesota", "952": "Minnesota",
  // Mississippi
  "228": "Mississippi", "601": "Mississippi", "662": "Mississippi", "769": "Mississippi",
  // Missouri
  "314": "Missouri", "417": "Missouri", "573": "Missouri", "636": "Missouri", "660": "Missouri",
  "816": "Missouri",
  // Montana
  "406": "Montana",
  // Nebraska
  "308": "Nebraska", "402": "Nebraska", "531": "Nebraska",
  // Nevada
  "702": "Nevada", "725": "Nevada", "775": "Nevada",
  // New Hampshire
  "603": "New Hampshire",
  // New Jersey
  "201": "New Jersey", "551": "New Jersey", "609": "New Jersey", "732": "New Jersey",
  "848": "New Jersey", "856": "New Jersey", "862": "New Jersey", "908": "New Jersey",
  "973": "New Jersey",
  // New Mexico
  "505": "New Mexico", "575": "New Mexico",
  // New York
  "212": "New York", "315": "New York", "332": "New York", "347": "New York",
  "516": "New York", "518": "New York", "585": "New York", "607": "New York",
  "631": "New York", "646": "New York", "680": "New York", "716": "New York",
  "718": "New York", "838": "New York", "845": "New York", "914": "New York",
  "917": "New York", "929": "New York", "934": "New York",
  // North Carolina
  "252": "North Carolina", "336": "North Carolina", "704": "North Carolina",
  "743": "North Carolina", "828": "North Carolina", "910": "North Carolina",
  "919": "North Carolina", "980": "North Carolina", "984": "North Carolina",
  // North Dakota
  "701": "North Dakota",
  // Ohio
  "216": "Ohio", "220": "Ohio", "234": "Ohio", "283": "Ohio", "326": "Ohio",
  "330": "Ohio", "380": "Ohio", "419": "Ohio", "440": "Ohio", "513": "Ohio",
  "567": "Ohio", "614": "Ohio", "740": "Ohio", "937": "Ohio",
  // Oklahoma
  "405": "Oklahoma", "539": "Oklahoma", "572": "Oklahoma", "580": "Oklahoma", "918": "Oklahoma",
  // Oregon
  "458": "Oregon", "503": "Oregon", "541": "Oregon", "971": "Oregon",
  // Pennsylvania
  "215": "Pennsylvania", "223": "Pennsylvania", "267": "Pennsylvania", "272": "Pennsylvania",
  "412": "Pennsylvania", "445": "Pennsylvania", "484": "Pennsylvania", "570": "Pennsylvania",
  "582": "Pennsylvania", "610": "Pennsylvania", "717": "Pennsylvania", "724": "Pennsylvania",
  "814": "Pennsylvania", "835": "Pennsylvania", "878": "Pennsylvania",
  // Rhode Island
  "401": "Rhode Island",
  // South Carolina
  "803": "South Carolina", "839": "South Carolina", "843": "South Carolina", "854": "South Carolina", "864": "South Carolina",
  // South Dakota
  "605": "South Dakota",
  // Tennessee
  "423": "Tennessee", "615": "Tennessee", "629": "Tennessee", "731": "Tennessee", "865": "Tennessee", "901": "Tennessee", "931": "Tennessee",
  // Texas
  "210": "Texas", "214": "Texas", "254": "Texas", "281": "Texas", "325": "Texas",
  "346": "Texas", "361": "Texas", "409": "Texas", "430": "Texas", "432": "Texas",
  "469": "Texas", "512": "Texas", "682": "Texas", "713": "Texas", "726": "Texas",
  "737": "Texas", "806": "Texas", "817": "Texas", "830": "Texas", "832": "Texas",
  "903": "Texas", "915": "Texas", "936": "Texas", "940": "Texas", "956": "Texas",
  "972": "Texas", "979": "Texas",
  // Utah
  "385": "Utah", "435": "Utah", "801": "Utah",
  // Vermont
  "802": "Vermont",
  // Virginia
  "276": "Virginia", "434": "Virginia", "540": "Virginia", "571": "Virginia",
  "703": "Virginia", "757": "Virginia", "804": "Virginia", "826": "Virginia",
  "948": "Virginia",
  // Washington
  "206": "Washington", "253": "Washington", "360": "Washington", "425": "Washington",
  "509": "Washington", "564": "Washington",
  // Washington DC
  "202": "District of Columbia",
  // West Virginia
  "304": "West Virginia", "681": "West Virginia",
  // Wisconsin
  "262": "Wisconsin", "274": "Wisconsin", "414": "Wisconsin", "534": "Wisconsin",
  "608": "Wisconsin", "715": "Wisconsin", "920": "Wisconsin",
  // Wyoming
  "307": "Wyoming",
};

// ─── State → Geographic Center (lat, lng) ───────────────────────────────
// Approximate geographic center of each US state for distance calculation
const STATE_COORDS: Record<string, { lat: number; lng: number }> = {
  "Alabama": { lat: 32.806671, lng: -86.791130 },
  "Alaska": { lat: 61.370716, lng: -152.404419 },
  "Arizona": { lat: 33.729759, lng: -111.431221 },
  "Arkansas": { lat: 34.969704, lng: -92.373123 },
  "California": { lat: 36.116203, lng: -119.681564 },
  "Colorado": { lat: 39.059811, lng: -105.311104 },
  "Connecticut": { lat: 41.597782, lng: -72.755371 },
  "Delaware": { lat: 39.318523, lng: -75.507141 },
  "District of Columbia": { lat: 38.897438, lng: -77.026817 },
  "Florida": { lat: 27.766279, lng: -81.686783 },
  "Georgia": { lat: 33.040619, lng: -83.643074 },
  "Hawaii": { lat: 21.094318, lng: -157.498337 },
  "Idaho": { lat: 44.240459, lng: -114.478828 },
  "Illinois": { lat: 40.349457, lng: -88.986137 },
  "Indiana": { lat: 39.849426, lng: -86.258278 },
  "Iowa": { lat: 42.011539, lng: -93.210526 },
  "Kansas": { lat: 38.526600, lng: -96.726486 },
  "Kentucky": { lat: 37.668140, lng: -84.670067 },
  "Louisiana": { lat: 31.169546, lng: -91.867805 },
  "Maine": { lat: 44.693947, lng: -69.381927 },
  "Maryland": { lat: 39.063946, lng: -76.802101 },
  "Massachusetts": { lat: 42.230171, lng: -71.530106 },
  "Michigan": { lat: 43.326618, lng: -84.536095 },
  "Minnesota": { lat: 45.694454, lng: -93.900192 },
  "Mississippi": { lat: 32.741646, lng: -89.678696 },
  "Missouri": { lat: 38.456085, lng: -92.288368 },
  "Montana": { lat: 46.921925, lng: -110.454353 },
  "Nebraska": { lat: 41.125370, lng: -98.268082 },
  "Nevada": { lat: 38.313515, lng: -117.055374 },
  "New Hampshire": { lat: 43.452492, lng: -71.563896 },
  "New Jersey": { lat: 40.298904, lng: -74.521011 },
  "New Mexico": { lat: 34.840515, lng: -106.248482 },
  "New York": { lat: 42.165726, lng: -74.948051 },
  "North Carolina": { lat: 35.630066, lng: -79.806419 },
  "North Dakota": { lat: 47.528912, lng: -99.784012 },
  "Ohio": { lat: 40.388783, lng: -82.764915 },
  "Oklahoma": { lat: 35.565342, lng: -96.928917 },
  "Oregon": { lat: 44.572021, lng: -122.070938 },
  "Pennsylvania": { lat: 40.590752, lng: -77.209755 },
  "Rhode Island": { lat: 41.680893, lng: -71.511780 },
  "South Carolina": { lat: 33.856892, lng: -80.945007 },
  "South Dakota": { lat: 44.299782, lng: -99.438828 },
  "Tennessee": { lat: 35.747845, lng: -86.692345 },
  "Texas": { lat: 31.054487, lng: -97.563461 },
  "Utah": { lat: 40.150032, lng: -111.862434 },
  "Vermont": { lat: 44.045876, lng: -72.710686 },
  "Virginia": { lat: 37.769337, lng: -78.169968 },
  "Washington": { lat: 47.400902, lng: -121.490494 },
  "West Virginia": { lat: 38.491226, lng: -80.954453 },
  "Wisconsin": { lat: 44.268543, lng: -89.616508 },
  "Wyoming": { lat: 42.755966, lng: -107.302490 },
  // Canadian provinces (mapped to nearest US border region)
  "Alberta": { lat: 53.9333, lng: -116.5765 },
  "British Columbia": { lat: 53.7267, lng: -127.6476 },
  "Ontario": { lat: 51.2538, lng: -85.3232 },
  "Quebec": { lat: 52.9399, lng: -73.5491 },
  "Saskatchewan": { lat: 52.9399, lng: -106.4509 },
};

/**
 * Extract the area code (first 3 digits after country code) from a phone number
 */
function extractAreaCode(phoneNumber: string): string | null {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");
  // Handle +1XXXYYYZZZZ format
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.substring(1, 4);
  }
  // Handle XXXYYYZZZZ format
  if (digits.length === 10) {
    return digits.substring(0, 3);
  }
  return null;
}

/**
 * Get the US state for a phone number based on its area code
 */
export function getStateFromPhone(phoneNumber: string): string | null {
  const areaCode = extractAreaCode(phoneNumber);
  if (!areaCode) return null;
  return AREA_CODE_TO_STATE[areaCode] || null;
}

/**
 * Calculate the distance between two states using the Haversine formula (in miles)
 */
function distanceBetweenStates(stateA: string, stateB: string): number {
  const coordA = STATE_COORDS[stateA];
  const coordB = STATE_COORDS[stateB];
  if (!coordA || !coordB) return Infinity;

  const R = 3959; // Earth radius in miles
  const dLat = ((coordB.lat - coordA.lat) * Math.PI) / 180;
  const dLng = ((coordB.lng - coordA.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coordA.lat * Math.PI) / 180) *
      Math.cos((coordB.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Pick the best Telnyx number to use when calling a contact in a given state.
 *
 * @param contactState  The state/region of the contact being called
 * @param numbers       Array of { id, phone_number, daily_call_count, daily_call_limit, ... }
 * @returns             The best number to use, or null if none available
 */
export function pickBestNumber<T extends { phone_number: string; daily_call_count: number; daily_call_limit: number }>(
  contactState: string | null | undefined,
  numbers: T[]
): T | null {
  // Filter to only numbers under their daily limit
  const available = numbers.filter(n => n.daily_call_count < n.daily_call_limit);
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];

  // If no contact state, fall back to least-used number
  if (!contactState) {
    return available.sort((a, b) => a.daily_call_count - b.daily_call_count)[0];
  }

  // Map each number to its state
  const numbersWithState = available.map(n => ({
    ...n,
    numberState: getStateFromPhone(n.phone_number),
  }));

  // 1. Exact state match — prefer the least-used one
  const exactMatches = numbersWithState.filter(n => n.numberState === contactState);
  if (exactMatches.length > 0) {
    return exactMatches.sort((a, b) => a.daily_call_count - b.daily_call_count)[0];
  }

  // 2. Closest state by geographic distance — tie-break on least-used
  const withDistance = numbersWithState
    .filter(n => n.numberState !== null)
    .map(n => ({
      ...n,
      distance: distanceBetweenStates(contactState, n.numberState!),
    }));

  if (withDistance.length > 0) {
    withDistance.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.daily_call_count - b.daily_call_count;
    });
    return withDistance[0];
  }

  // 3. Fallback: least-used
  return available.sort((a, b) => a.daily_call_count - b.daily_call_count)[0];
}
