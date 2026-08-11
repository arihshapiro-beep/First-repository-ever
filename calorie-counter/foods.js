/*
 * foods.js — built-in food database + pure helper functions for the Calorie Counter.
 *
 * Everything here is framework-free and side-effect-free so it can run both in the
 * browser (attached to window.CC) and under Node for quick tests (module.exports).
 *
 * All nutrition numbers are ESTIMATES for a typical serving. Sodium is in
 * milligrams; everything else (sugar, carbs, protein, fat, sat fat, fiber) is in
 * grams; calories are kcal.
 */

// Recommended daily amounts. Based on the U.S. FDA Daily Values for a 2,000-calorie
// reference diet. `sugar` uses the added-sugars limit (50 g). These are the default
// "something to compare it to" — the user can override them in Settings.
var DEFAULT_TARGETS = {
  calories: 2000,
  sugar_g: 50,     // FDA added-sugars limit
  carbs_g: 275,    // total carbohydrate DV
  sodium_mg: 2300, // sodium DV
  protein_g: 50,
  fat_g: 78,
  sat_fat_g: 20,
  fiber_g: 28,
};

// The nutrient fields we track, in display order, with labels and units.
var NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: '', primary: true },
  { key: 'sugar_g', label: 'Sugar', unit: 'g', primary: true },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', primary: true },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', primary: true },
  { key: 'protein_g', label: 'Protein', unit: 'g', primary: false },
  { key: 'fat_g', label: 'Fat', unit: 'g', primary: false },
  { key: 'sat_fat_g', label: 'Sat fat', unit: 'g', primary: false },
  { key: 'fiber_g', label: 'Fiber', unit: 'g', primary: false },
];

// Built-in database. `k` is the list of trigger keywords/phrases (matched on word
// boundaries). Numbers are: calories, sugar_g, carbs_g, sodium_mg, protein_g,
// fat_g, sat_fat_g, fiber_g. `note` describes the assumed portion.
var FOOD_DB = [
  // --- the three examples from the original request ---
  { name: "Jersey Mike's Italian sub (regular)", k: ['jersey mike', 'jersey mikes', 'italian sub', 'mikes italian'],
    cal: 770, sugar: 8, carbs: 72, sodium: 2060, protein: 38, fat: 38, satfat: 13, fiber: 3,
    note: 'Regular (7") Original Italian on white bread.' },
  { name: 'Homemade grilled cheese', k: ['grilled cheese'],
    cal: 400, sugar: 5, carbs: 33, sodium: 840, protein: 14, fat: 24, satfat: 12, fiber: 2,
    note: '2 slices bread, 2 slices American cheese, butter-grilled.' },
  { name: 'Sour gummy worms (large handful)', k: ['gummy worm', 'gummy worms', 'sour gummy', 'sour worms'],
    cal: 150, sugar: 24, carbs: 34, sodium: 20, protein: 1, fat: 0, satfat: 0, fiber: 0,
    note: 'About 1.5 oz (a large handful, ~9 worms).' },

  // --- common single foods ---
  { name: 'Banana (medium)', k: ['banana'], cal: 105, sugar: 14, carbs: 27, sodium: 1, protein: 1, fat: 0, satfat: 0, fiber: 3, note: '1 medium banana.' },
  { name: 'Apple (medium)', k: ['apple'], cal: 95, sugar: 19, carbs: 25, sodium: 2, protein: 0, fat: 0, satfat: 0, fiber: 4, note: '1 medium apple.' },
  { name: 'Egg (large)', k: ['egg', 'eggs'], cal: 72, sugar: 0, carbs: 0, sodium: 71, protein: 6, fat: 5, satfat: 2, fiber: 0, note: '1 large egg.' },
  { name: 'Avocado (half)', k: ['avocado'], cal: 160, sugar: 1, carbs: 9, sodium: 7, protein: 2, fat: 15, satfat: 2, fiber: 7, note: 'Half a medium avocado.' },
  { name: 'Almonds (1 oz)', k: ['almond', 'almonds'], cal: 165, sugar: 1, carbs: 6, sodium: 0, protein: 6, fat: 14, satfat: 1, fiber: 4, note: 'About 23 almonds (1 oz).' },
  { name: 'Peanut butter (2 tbsp)', k: ['peanut butter'], cal: 190, sugar: 3, carbs: 8, sodium: 140, protein: 8, fat: 16, satfat: 3, fiber: 2, note: '2 tablespoons.' },
  { name: 'Cheddar cheese (1 oz)', k: ['cheddar'], cal: 115, sugar: 1, carbs: 1, sodium: 180, protein: 7, fat: 9, satfat: 6, fiber: 0, note: '1 oz slice/cube.' },
  { name: 'Slice of white bread', k: ['white bread', 'slice of bread', 'toast'], cal: 75, sugar: 2, carbs: 14, sodium: 140, protein: 3, fat: 1, satfat: 0, fiber: 1, note: '1 slice.' },
  { name: 'Plain bagel', k: ['bagel'], cal: 245, sugar: 6, carbs: 48, sodium: 430, protein: 10, fat: 2, satfat: 0, fiber: 2, note: '1 plain bagel.' },
  { name: 'Oatmeal (1 cup cooked)', k: ['oatmeal', 'oats', 'porridge'], cal: 150, sugar: 1, carbs: 27, sodium: 9, protein: 5, fat: 3, satfat: 1, fiber: 4, note: '1 cup cooked, no toppings.' },
  { name: 'Greek yogurt (1 cup, plain)', k: ['greek yogurt', 'yogurt', 'yoghurt'], cal: 130, sugar: 9, carbs: 9, sodium: 85, protein: 22, fat: 1, satfat: 0, fiber: 0, note: '1 cup nonfat plain.' },
  { name: 'White rice (1 cup cooked)', k: ['white rice', 'rice'], cal: 205, sugar: 0, carbs: 45, sodium: 2, protein: 4, fat: 0, satfat: 0, fiber: 1, note: '1 cup cooked.' },
  { name: 'Grilled chicken breast (4 oz)', k: ['chicken breast', 'grilled chicken'], cal: 187, sugar: 0, carbs: 0, sodium: 84, protein: 35, fat: 4, satfat: 1, fiber: 0, note: '4 oz skinless, grilled.' },
  { name: 'Spaghetti with marinara', k: ['spaghetti', 'pasta with marinara', 'pasta marinara'], cal: 330, sugar: 9, carbs: 60, sodium: 580, protein: 12, fat: 5, satfat: 1, fiber: 5, note: '~1.5 cups pasta + marinara.' },

  // --- meals / restaurant items ---
  { name: 'Cheese pizza (1 slice)', k: ['pizza'], cal: 285, sugar: 4, carbs: 36, sodium: 640, protein: 12, fat: 10, satfat: 5, fiber: 2, note: '1 slice, medium cheese pizza.' },
  { name: 'Big Mac', k: ['big mac'], cal: 563, sugar: 9, carbs: 45, sodium: 1010, protein: 26, fat: 33, satfat: 11, fiber: 3, note: '1 McDonald’s Big Mac.' },
  { name: 'Cheeseburger (fast food)', k: ['cheeseburger', 'burger'], cal: 300, sugar: 7, carbs: 32, sodium: 680, protein: 15, fat: 12, satfat: 6, fiber: 2, note: 'Single fast-food cheeseburger.' },
  { name: 'French fries (medium)', k: ['french fries', 'fries'], cal: 320, sugar: 0, carbs: 43, sodium: 260, protein: 5, fat: 15, satfat: 2, fiber: 4, note: 'Medium fast-food fries.' },
  { name: 'Chicken burrito', k: ['burrito'], cal: 970, sugar: 8, carbs: 108, sodium: 2000, protein: 47, fat: 35, satfat: 12, fiber: 13, note: 'Large chicken burrito with rice, beans, cheese, salsa.' },
  { name: 'Turkey deli sandwich', k: ['turkey sandwich', 'deli sandwich', 'turkey sub'], cal: 320, sugar: 6, carbs: 40, sodium: 1200, protein: 22, fat: 8, satfat: 2, fiber: 3, note: 'Turkey, cheese, veg on sub roll.' },
  { name: 'Caesar salad with chicken', k: ['caesar salad', 'caesar'], cal: 470, sugar: 5, carbs: 12, sodium: 1080, protein: 33, fat: 33, satfat: 8, fiber: 4, note: 'With grilled chicken, dressing, croutons.' },
  { name: 'Side salad with ranch', k: ['side salad', 'garden salad'], cal: 200, sugar: 4, carbs: 10, sodium: 350, protein: 3, fat: 17, satfat: 3, fiber: 2, note: 'Small salad + 2 tbsp ranch.' },

  // --- drinks ---
  { name: 'Can of Coke (12 oz)', k: ['coke', 'coca cola', 'coca-cola', 'soda', 'cola'], cal: 140, sugar: 39, carbs: 39, sodium: 45, protein: 0, fat: 0, satfat: 0, fiber: 0, note: '12 oz can, regular.' },
  { name: 'Orange juice (8 oz)', k: ['orange juice', 'oj'], cal: 110, sugar: 21, carbs: 26, sodium: 2, protein: 2, fat: 0, satfat: 0, fiber: 0, note: '8 oz glass.' },
  { name: 'Grande latte (2% milk)', k: ['latte'], cal: 190, sugar: 18, carbs: 19, sodium: 170, protein: 13, fat: 7, satfat: 4, fiber: 0, note: 'Grande (16 oz) with 2% milk.' },
  { name: 'Black coffee', k: ['black coffee', 'coffee'], cal: 2, sugar: 0, carbs: 0, sodium: 5, protein: 0, fat: 0, satfat: 0, fiber: 0, note: 'Plain brewed coffee, no additions.' },
  { name: 'Beer (12 oz)', k: ['beer'], cal: 150, sugar: 0, carbs: 13, sodium: 14, protein: 2, fat: 0, satfat: 0, fiber: 0, note: '12 oz regular beer.' },
  { name: 'Red wine (5 oz)', k: ['red wine', 'wine', 'glass of wine'], cal: 125, sugar: 1, carbs: 4, sodium: 6, protein: 0, fat: 0, satfat: 0, fiber: 0, note: '5 oz glass.' },

  // --- snacks / sweets ---
  { name: 'Glazed donut', k: ['donut', 'doughnut'], cal: 260, sugar: 12, carbs: 31, sodium: 330, protein: 3, fat: 14, satfat: 6, fiber: 1, note: '1 glazed donut.' },
  { name: 'Chocolate chip cookie (large)', k: ['chocolate chip cookie', 'cookie'], cal: 220, sugar: 16, carbs: 30, sodium: 130, protein: 2, fat: 11, satfat: 5, fiber: 1, note: '1 large bakery cookie.' },
  { name: 'Protein bar', k: ['protein bar'], cal: 200, sugar: 3, carbs: 22, sodium: 200, protein: 20, fat: 7, satfat: 2, fiber: 3, note: 'Typical 1-bar serving.' },
  { name: 'Potato chips (1 oz)', k: ['potato chips', 'chips'], cal: 150, sugar: 0, carbs: 15, sodium: 170, protein: 2, fat: 10, satfat: 1, fiber: 1, note: 'Small 1 oz bag (~15 chips).' },
];

// Convert a raw DB row into the standard nutrition object used everywhere else.
function dbRowToNutrition(row) {
  return {
    name: row.name,
    assumptions: row.note,
    calories: row.cal,
    sugar_g: row.sugar,
    carbs_g: row.carbs,
    sodium_mg: row.sodium,
    protein_g: row.protein,
    fat_g: row.fat,
    sat_fat_g: row.satfat,
    fiber_g: row.fiber,
    confidence: 'medium',
    source: 'database',
  };
}

// Escape a string for safe use inside a RegExp.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True if `word` appears in `text` on word boundaries (so "egg" doesn't match
// "eggplant"). Multi-word phrases are matched as-is.
function hasWord(text, word) {
  try {
    return new RegExp('\\b' + escapeRegExp(word) + '\\b', 'i').test(text);
  } catch (e) {
    return text.indexOf(word) !== -1;
  }
}

/*
 * Find the best matching built-in food for a free-text query.
 * Scores each row by the summed length of the keywords it matches (longer,
 * more specific phrases win). Returns a nutrition object or null.
 */
function matchFood(query) {
  if (!query) return null;
  var text = ' ' + String(query).toLowerCase().trim() + ' ';
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < FOOD_DB.length; i++) {
    var row = FOOD_DB[i];
    var score = 0;
    for (var j = 0; j < row.k.length; j++) {
      if (hasWord(text, row.k[j])) {
        // Longer keyword = stronger, more specific signal.
        score = Math.max(score, row.k[j].length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  // Require at least a 3-character keyword hit to avoid nonsense matches.
  if (best && bestScore >= 3) return dbRowToNutrition(best);
  return null;
}

/*
 * Parse the JSON a language model returns for a nutrition estimate. Tolerant of
 * code fences and surrounding prose: grabs the outermost { ... } and coerces the
 * numeric fields. Returns a normalized nutrition object, or throws on failure.
 */
function parseNutritionJSON(raw) {
  if (raw == null) throw new Error('Empty response');
  var text = String(raw).trim();
  // Strip ```json ... ``` fences if present.
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in response');
  }
  var obj = JSON.parse(text.slice(start, end + 1));
  function num(v) {
    var n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : Number(v);
    return isFinite(n) ? n : 0;
  }
  var conf = String(obj.confidence || 'medium').toLowerCase();
  if (conf !== 'high' && conf !== 'low') conf = 'medium';
  return {
    name: (obj.name != null ? String(obj.name) : '').trim() || 'Food',
    assumptions: (obj.assumptions != null ? String(obj.assumptions) : '').trim(),
    calories: Math.max(0, Math.round(num(obj.calories))),
    sugar_g: Math.max(0, num(obj.sugar_g)),
    carbs_g: Math.max(0, num(obj.carbs_g)),
    sodium_mg: Math.max(0, Math.round(num(obj.sodium_mg))),
    protein_g: Math.max(0, num(obj.protein_g)),
    fat_g: Math.max(0, num(obj.fat_g)),
    sat_fat_g: Math.max(0, num(obj.sat_fat_g)),
    fiber_g: Math.max(0, num(obj.fiber_g)),
    confidence: conf,
    source: 'ai',
  };
}

// Round grams for display: whole numbers at 10+, one decimal below 10.
function fmtGrams(n) {
  if (n >= 10 || n === Math.round(n)) return String(Math.round(n));
  return (Math.round(n * 10) / 10).toString();
}

/*
 * Build a few friendly "compare it to" lines for a nutrition object.
 * Uses common equivalences: 4 g sugar = 1 tsp, ~2,325 mg sodium = 1 tsp salt,
 * ~15 g carbs = 1 slice of bread, ~4 kcal burned per minute of brisk walking.
 */
function relatableComparisons(n) {
  var out = [];
  if (n.sugar_g > 0) out.push('Sugar ≈ ' + fmtGrams(n.sugar_g / 4) + ' tsp of sugar');
  if (n.sodium_mg > 0) out.push('Sodium ≈ ' + Math.round((n.sodium_mg / 2300) * 100) + '% of a day’s limit');
  if (n.carbs_g > 0) out.push('Carbs ≈ ' + fmtGrams(n.carbs_g / 15) + ' slices of bread');
  if (n.calories > 0) out.push('≈ ' + Math.round(n.calories / 4) + ' min of brisk walking to burn');
  return out;
}

// Empty running-total object.
function emptyTotals() {
  return { calories: 0, sugar_g: 0, carbs_g: 0, sodium_mg: 0, protein_g: 0, fat_g: 0, sat_fat_g: 0, fiber_g: 0 };
}

// Sum a list of nutrition objects into a totals object.
function sumNutrition(items) {
  var t = emptyTotals();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    t.calories += it.calories || 0;
    t.sugar_g += it.sugar_g || 0;
    t.carbs_g += it.carbs_g || 0;
    t.sodium_mg += it.sodium_mg || 0;
    t.protein_g += it.protein_g || 0;
    t.fat_g += it.fat_g || 0;
    t.sat_fat_g += it.sat_fat_g || 0;
    t.fiber_g += it.fiber_g || 0;
  }
  return t;
}

// Pick a status color for a value relative to its daily target.
// < 25% green, < 50% amber, otherwise red.
function levelForRatio(ratio) {
  if (ratio < 0.25) return 'good';
  if (ratio < 0.5) return 'mid';
  return 'high';
}

// ---- date / aggregation helpers (for the day / week trends) ----

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// Local YYYY-MM-DD for a Date (no UTC shift).
function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

// Parse a YYYY-MM-DD key back into a local Date at midnight.
function keyToDate(key) { var p = key.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }

// A new Date n days from d (local, midnight-anchored).
function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

// Monday (local midnight) of the week containing d.
function startOfWeek(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var off = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - off);
  return x;
}

// The 7 day-keys (Mon..Sun) for the week starting at `monday`.
function weekDayKeys(monday) {
  var out = [];
  for (var i = 0; i < 7; i++) out.push(dateKey(addDays(monday, i)));
  return out;
}

// The selected-metric value for one day, plus whether anything was logged.
function dayMetric(history, key, metric) {
  var items = history[key];
  if (!items || !items.length) return { value: 0, logged: false };
  var t = sumNutrition(items);
  return { value: t[metric] || 0, logged: true };
}

// Percent change from prev → cur; null when there's no prior value to compare.
function pctDelta(cur, prev) { if (!prev) return null; return ((cur - prev) / prev) * 100; }

// Color band for a whole-day value vs its daily target.
function dayLevel(value, target) {
  if (value <= 0) return 'empty';
  var r = target > 0 ? value / target : 0;
  if (r <= 1) return 'good';
  if (r <= 1.3) return 'mid';
  return 'high';
}

// Compact number for chart labels: 1,850 -> "1.9k"; small grams stay plain.
function fmtCompact(v, unit) {
  v = Math.round(v);
  if (unit === 'g') return String(v);
  if (v >= 1000) {
    var k = v / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
  }
  return String(v);
}

// Average of a numeric array over only the entries that count (loggedFlags true).
// Returns { avg, loggedDays, total }.
function weekSummary(history, dayKeys, metric, target) {
  var total = 0, loggedDays = 0, within = 0;
  for (var i = 0; i < dayKeys.length; i++) {
    var dm = dayMetric(history, dayKeys[i], metric);
    if (dm.logged) {
      loggedDays++;
      total += dm.value;
      if (dm.value <= target) within++;
    }
  }
  return { total: total, loggedDays: loggedDays, avg: loggedDays ? total / loggedDays : 0, within: within };
}

// Did the user log anything on this day?
function isLoggedDay(history, key) { return !!(history[key] && history[key].length); }

// Current streak: consecutive days for which ok(key) is true, ending today —
// or ending yesterday when today isn't logged yet (a grace period so the streak
// isn't shown as broken before the day is over). `ok` must imply the day is logged.
function streakCount(history, today, ok) {
  var start = isLoggedDay(history, dateKey(today)) ? today : addDays(today, -1);
  var n = 0, d = start;
  while (ok(dateKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

// Longest run of consecutive calendar days for which ok(key) is true (all time).
function longestStreak(history, ok) {
  var keys = Object.keys(history).filter(function (k) { return ok(k); }).sort();
  var best = 0, run = 0, prev = null;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (prev && dateKey(addDays(keyToDate(prev), 1)) === k) run++; else run = 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

var CC = {
  DEFAULT_TARGETS: DEFAULT_TARGETS,
  NUTRIENTS: NUTRIENTS,
  FOOD_DB: FOOD_DB,
  matchFood: matchFood,
  parseNutritionJSON: parseNutritionJSON,
  relatableComparisons: relatableComparisons,
  fmtGrams: fmtGrams,
  emptyTotals: emptyTotals,
  sumNutrition: sumNutrition,
  levelForRatio: levelForRatio,
  dbRowToNutrition: dbRowToNutrition,
  dateKey: dateKey,
  keyToDate: keyToDate,
  addDays: addDays,
  startOfWeek: startOfWeek,
  weekDayKeys: weekDayKeys,
  dayMetric: dayMetric,
  pctDelta: pctDelta,
  dayLevel: dayLevel,
  fmtCompact: fmtCompact,
  weekSummary: weekSummary,
  isLoggedDay: isLoggedDay,
  streakCount: streakCount,
  longestStreak: longestStreak,
};

if (typeof window !== 'undefined') { window.CC = CC; }
if (typeof module !== 'undefined' && module.exports) { module.exports = CC; }
