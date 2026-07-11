/* Location -> tax rate lookup.
 *
 * How accurate is this?
 *  - CITIES / special STATE entries: hand-verified restaurant rates, incl. food-vs-alcohol
 *    differences (e.g. Evanston's 6% liquor tax, DC's 10% meals tax). Marked "exact".
 *  - Everywhere else: the state's *typical* combined restaurant sales tax (state + average
 *    local). Marked "typical" because the exact rate depends on your street address.
 *
 * Rates change. Everything the lookup fills in stays editable in the app.
 * Sources: Tax Foundation state & local sales tax data; City of Evanston home-rule liquor
 * tax; DC Office of the CFO; Illinois Dept. of Revenue.
 */

// Per state: sales = state base rate, avg = typical combined restaurant rate (fallback).
// Optional food/alcohol = statewide restaurant override (used verbatim when present).
const STATES = {
  AL: { name: 'Alabama', avg: 9.29 },
  AK: { name: 'Alaska', avg: 1.82 },
  AZ: { name: 'Arizona', avg: 8.38 },
  AR: { name: 'Arkansas', avg: 9.45 },
  CA: { name: 'California', avg: 8.85 },
  CO: { name: 'Colorado', avg: 7.81 },
  CT: { name: 'Connecticut', avg: 6.35 },
  DE: { name: 'Delaware', avg: 0 },
  FL: { name: 'Florida', avg: 7.00 },
  GA: { name: 'Georgia', avg: 7.40 },
  HI: { name: 'Hawaii', avg: 4.50 },
  ID: { name: 'Idaho', avg: 6.03 },
  IL: { name: 'Illinois', avg: 8.85 },
  IN: { name: 'Indiana', avg: 7.00 },
  IA: { name: 'Iowa', avg: 6.94 },
  KS: { name: 'Kansas', avg: 8.75 },
  KY: { name: 'Kentucky', avg: 6.00 },
  LA: { name: 'Louisiana', avg: 10.13 },
  ME: { name: 'Maine', avg: 5.50 },
  MD: { name: 'Maryland', avg: 6.00 },
  MA: { name: 'Massachusetts', avg: 6.25 },
  MI: { name: 'Michigan', avg: 6.00 },
  MN: { name: 'Minnesota', avg: 8.04 },
  MS: { name: 'Mississippi', avg: 7.06 },
  MO: { name: 'Missouri', avg: 8.39 },
  MT: { name: 'Montana', avg: 0 },
  NE: { name: 'Nebraska', avg: 6.97 },
  NV: { name: 'Nevada', avg: 8.24 },
  NH: { name: 'New Hampshire', avg: 0 },
  NJ: { name: 'New Jersey', avg: 6.60 },
  NM: { name: 'New Mexico', avg: 7.62 },
  NY: { name: 'New York', avg: 8.53 },
  NC: { name: 'North Carolina', avg: 7.00 },
  ND: { name: 'North Dakota', avg: 7.04 },
  OH: { name: 'Ohio', avg: 7.24 },
  OK: { name: 'Oklahoma', avg: 8.99 },
  OR: { name: 'Oregon', avg: 0 },
  PA: { name: 'Pennsylvania', avg: 6.34 },
  RI: { name: 'Rhode Island', avg: 7.00 },
  SC: { name: 'South Carolina', avg: 7.50 },
  SD: { name: 'South Dakota', avg: 6.11 },
  TN: { name: 'Tennessee', avg: 9.55 },
  TX: { name: 'Texas', avg: 8.20 },
  UT: { name: 'Utah', avg: 7.25 },
  VT: { name: 'Vermont', avg: 6.36 },
  VA: { name: 'Virginia', avg: 5.77 },
  WA: { name: 'Washington', avg: 9.38 },
  WV: { name: 'West Virginia', avg: 6.57 },
  WI: { name: 'Wisconsin', avg: 5.70 },
  WY: { name: 'Wyoming', avg: 5.44 },
  // DC restaurant meals and on-premise alcohol are both taxed at 10% (not the 6% base).
  DC: { name: 'District of Columbia', avg: 6.00, food: 10, alcohol: 10 },
};

// Hand-verified cities. sales applies to food & alcohol unless food/alcohol given.
const CITIES = [
  // The headline example: Evanston taxes alcohol 6% higher than food.
  { name: 'Evanston', state: 'IL', food: 10.25, alcohol: 16.25, zips: ['60201','60202','60203','60204','60208','60209'],
    note: 'includes Evanston’s 6% liquor tax on alcohol' },
  { name: 'Chicago', state: 'IL', sales: 10.25 },
  { name: 'New York', aliases: ['nyc','new york city','manhattan'], state: 'NY', sales: 8.875 },
  { name: 'Los Angeles', aliases: ['la'], state: 'CA', sales: 9.50 },
  { name: 'San Francisco', aliases: ['sf'], state: 'CA', sales: 8.625 },
  { name: 'San Diego', state: 'CA', sales: 7.75 },
  { name: 'San Jose', state: 'CA', sales: 9.375 },
  { name: 'Sacramento', state: 'CA', sales: 8.75 },
  { name: 'Seattle', state: 'WA', sales: 10.35 },
  { name: 'Denver', state: 'CO', sales: 8.81 },
  { name: 'Boston', state: 'MA', sales: 7.00, note: 'MA 6.25% + 0.75% local meals tax' },
  { name: 'Austin', state: 'TX', sales: 8.25 },
  { name: 'Houston', state: 'TX', sales: 8.25 },
  { name: 'Dallas', state: 'TX', sales: 8.25 },
  { name: 'San Antonio', state: 'TX', sales: 8.25 },
  { name: 'Atlanta', state: 'GA', sales: 8.90 },
  { name: 'Miami', state: 'FL', sales: 7.00 },
  { name: 'Orlando', state: 'FL', sales: 6.50 },
  { name: 'Phoenix', state: 'AZ', sales: 8.60 },
  { name: 'Las Vegas', state: 'NV', sales: 8.375 },
  { name: 'Portland', state: 'OR', sales: 0 },
  { name: 'Nashville', state: 'TN', sales: 9.25 },
  { name: 'Memphis', state: 'TN', sales: 9.75 },
  { name: 'New Orleans', state: 'LA', sales: 9.45 },
  { name: 'Minneapolis', state: 'MN', sales: 8.025, note: 'downtown restaurants may add a 3% tax' },
  { name: 'Philadelphia', state: 'PA', sales: 8.00 },
  { name: 'Pittsburgh', state: 'PA', sales: 7.00 },
  { name: 'Baltimore', state: 'MD', sales: 6.00 },
  { name: 'Detroit', state: 'MI', sales: 6.00 },
  { name: 'Milwaukee', state: 'WI', sales: 5.50 },
  { name: 'Salt Lake City', state: 'UT', sales: 7.75 },
  { name: 'St. Louis', aliases: ['saint louis'], state: 'MO', sales: 9.68 },
  { name: 'Kansas City', state: 'MO', sales: 8.60 },
  { name: 'Charlotte', state: 'NC', sales: 7.25 },
  { name: 'Columbus', state: 'OH', sales: 7.50 },
  { name: 'Indianapolis', state: 'IN', sales: 7.00 },
  { name: 'Washington', aliases: ['washington dc','dc'], state: 'DC', food: 10, alcohol: 10,
    zips: ['20001','20002','20003','20004','20005','20006','20007','20008','20009','20010'] },
];

// First 3 digits of a ZIP -> state. Ranges cover the mainland USPS allocation.
function zip3ToState(z) {
  const r = (a, b) => z >= a && z <= b;
  if (r(6, 6)) return 'NY';       // Holtsville etc.
  if (r(10, 27)) return 'MA';
  if (r(28, 29)) return 'RI';
  if (r(30, 38)) return 'NH';
  if (r(39, 49)) return 'ME';
  if (r(50, 54)) return 'VT';
  if (r(55, 59)) return 'MA';     // Andover area
  if (r(60, 69)) return 'CT';
  if (r(70, 89)) return 'NJ';
  if (r(100, 149)) return 'NY';
  if (r(150, 196)) return 'PA';
  if (r(197, 199)) return 'DE';
  if (r(200, 205)) return 'DC';
  if (r(206, 219)) return 'MD';
  if (r(220, 246)) return 'VA';
  if (r(247, 268)) return 'WV';
  if (r(270, 289)) return 'NC';
  if (r(290, 299)) return 'SC';
  if (r(300, 319) || r(398, 399)) return 'GA';
  if (r(320, 349)) return 'FL';
  if (r(350, 369)) return 'AL';
  if (r(370, 385)) return 'TN';
  if (r(386, 397)) return 'MS';
  if (r(400, 427)) return 'KY';
  if (r(430, 459)) return 'OH';
  if (r(460, 479)) return 'IN';
  if (r(480, 499)) return 'MI';
  if (r(500, 528)) return 'IA';
  if (r(530, 549)) return 'WI';
  if (r(550, 567)) return 'MN';
  if (r(570, 577)) return 'SD';
  if (r(580, 588)) return 'ND';
  if (r(590, 599)) return 'MT';
  if (r(600, 629)) return 'IL';
  if (r(630, 658)) return 'MO';
  if (r(660, 679)) return 'KS';
  if (r(680, 693)) return 'NE';
  if (r(700, 714)) return 'LA';
  if (r(716, 729)) return 'AR';
  if (r(730, 749) || z === 733 || z === 885) return 'OK';
  if (r(750, 799)) return 'TX';
  if (r(800, 816)) return 'CO';
  if (r(820, 831)) return 'WY';
  if (r(832, 838)) return 'ID';
  if (r(840, 847)) return 'UT';
  if (r(850, 865)) return 'AZ';
  if (r(870, 884)) return 'NM';
  if (r(889, 898)) return 'NV';
  if (r(900, 961)) return 'CA';
  if (r(967, 968)) return 'HI';
  if (r(970, 979)) return 'OR';
  if (r(980, 994)) return 'WA';
  if (r(995, 999)) return 'AK';
  return null;
}

function stateResult(abbr, viaLabel) {
  const s = STATES[abbr];
  if (!s) return null;
  const rate = s.avg;
  const food = s.food != null ? s.food : rate;
  const alcohol = s.alcohol != null ? s.alcohol : rate;
  const exact = s.food != null; // statewide restaurant override (e.g. DC) is exact
  return {
    food, alcohol, other: rate,
    label: viaLabel ? `${viaLabel} → ${s.name}` : s.name,
    confidence: exact ? 'exact' : 'typical',
    note: exact ? 'statewide restaurant rate' : 'typical statewide estimate — your city may differ',
  };
}

function cityResult(c) {
  const food = c.food != null ? c.food : c.sales;
  const alcohol = c.alcohol != null ? c.alcohol : c.sales;
  const other = c.sales != null ? c.sales : (c.food != null ? c.food : 0);
  return {
    food, alcohol, other,
    label: `${c.name}, ${c.state}`,
    confidence: 'exact',
    note: c.note || 'verified local rate',
  };
}

const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');

/* Main entry: accepts "Evanston, IL", "evanston", "60201", "chicago", "IL", "illinois". */
function lookupTax(query) {
  const q = norm(query);
  if (!q) return null;

  // ZIP code
  const zipMatch = q.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    const cityByZip = CITIES.find(c => c.zips && c.zips.includes(zip));
    if (cityByZip) return cityResult(cityByZip);
    const st = zip3ToState(parseInt(zip.slice(0, 3), 10));
    if (st) return stateResult(st, zip);
    return null;
  }

  // "City, ST" or "City ST"
  let cityPart = q, statePart = null;
  const comma = q.split(',');
  if (comma.length >= 2) {
    cityPart = norm(comma[0]);
    statePart = norm(comma[1]);
  } else {
    // No comma: if the query ends in a state abbr/name, peel it off as the state.
    const words = q.split(' ');
    if (words.length >= 2) {
      const lastAbbr = resolveStateAbbr(words[words.length - 1]);
      const lastTwo = resolveStateAbbr(words.slice(-2).join(' ')); // e.g. "new york"
      if (lastTwo) { statePart = words.slice(-2).join(' '); cityPart = norm(words.slice(0, -2).join(' ')) || statePart; }
      else if (lastAbbr) { statePart = words[words.length - 1]; cityPart = norm(words.slice(0, -1).join(' ')) || statePart; }
    }
  }

  // City by name / alias (optionally constrained by state)
  const cityMatch = CITIES.find(c => {
    const names = [norm(c.name), ...(c.aliases || []).map(norm)];
    if (!names.includes(cityPart)) return false;
    if (statePart) {
      const abbr = resolveStateAbbr(statePart);
      if (abbr && abbr !== c.state) return false;
    }
    return true;
  });
  if (cityMatch) return cityResult(cityMatch);

  // Whole-query alias hit (e.g. "washington dc", "nyc")
  const aliasMatch = CITIES.find(c => (c.aliases || []).map(norm).includes(q));
  if (aliasMatch) return cityResult(aliasMatch);

  // State by name or abbreviation
  const abbr = resolveStateAbbr(statePart || q);
  if (abbr) return stateResult(abbr, null);

  return null;
}

function resolveStateAbbr(text) {
  const t = norm(text);
  if (!t) return null;
  if (STATES[t.toUpperCase()]) return t.toUpperCase();
  for (const [ab, s] of Object.entries(STATES)) {
    if (norm(s.name) === t) return ab;
  }
  return null;
}

// Names for the autocomplete datalist.
const CITY_SUGGESTIONS = CITIES.map(c => `${c.name}, ${c.state}`);
