/*
 * app.js — UI, AI estimation, daily log, and persistence for the Calorie Counter.
 * Depends on foods.js (window.CC). No frameworks, no build step, no server.
 */
(function () {
  'use strict';

  var CC = window.CC;
  var $ = function (id) { return document.getElementById(id); };

  // ---- storage keys ----
  var K_KEY = 'cc_api_key';
  var K_MODEL = 'cc_model';
  var K_TARGETS = 'cc_targets';
  var K_HISTORY = 'cc_history';
  var K_PREFER = 'cc_prefer_db';
  var K_LEARNED = 'cc_learned';

  var MODELS = [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fast & inexpensive (recommended)' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5 — more accurate' },
    { id: 'claude-opus-5', label: 'Opus 5 — most accurate' },
  ];

  // ---- persisted state ----
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var apiKey = localStorage.getItem(K_KEY) || '';
  var model = localStorage.getItem(K_MODEL) || 'claude-haiku-4-5';
  var targets = Object.assign({}, CC.DEFAULT_TARGETS, load(K_TARGETS, {}));
  var history = load(K_HISTORY, {});
  var lastResult = null; // most recent estimate awaiting "Add to today"
  var statMetric = localStorage.getItem('cc_statmetric') || 'calories'; // which metric the trend charts show
  var preferDB = load(K_PREFER, true); // check the free built-in list before paying for an AI lookup
  var learned = load(K_LEARNED, []);   // foods learned from past AI lookups, reused for free

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function prettyDate(key) {
    var parts = key.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function todaysItems() { return history[todayKey()] || []; }

  // ---- estimation ----
  var SYSTEM_PROMPT =
    'You are a nutrition estimation engine. Given a free-text description of food or ' +
    'drink, estimate its nutrition using your knowledge of common foods, restaurant and ' +
    'chain menu items, and packaged brands. Make reasonable assumptions about portion ' +
    'size when it is not specified, and briefly state them. If several items are ' +
    'described, sum them into one total.\n\n' +
    'Respond with ONLY a single minified JSON object and nothing else — no prose, no code ' +
    'fences. Use exactly these keys:\n' +
    '{"name":string,"assumptions":string,"calories":number,"sugar_g":number,' +
    '"carbs_g":number,"sodium_mg":number,"protein_g":number,"fat_g":number,' +
    '"sat_fat_g":number,"fiber_g":number,"confidence":"high"|"medium"|"low"}\n\n' +
    'All numbers are for the TOTAL amount described. calories are kcal, sodium is in ' +
    'milligrams, everything else in grams. Round calories and sodium to whole numbers. ' +
    'These are estimates — do not refuse a reasonable food description. If the text is ' +
    'not food or drink, set every number to 0, confidence to "low", and explain in ' +
    '"assumptions".';

  function estimateWithAI(query) {
    var body = {
      model: model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: query }],
    };
    // These models think by default; a nutrition lookup does not need it, and
    // leaving it on adds latency and cost. Haiku does not think by default.
    if (model.indexOf('haiku') === -1) body.thinking = { type: 'disabled' };

    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      if (!r.ok) {
        var msg = (r.data && r.data.error && r.data.error.message) || ('HTTP ' + r.status);
        if (r.status === 401) msg = 'Your API key looks invalid or expired — check Settings.';
        else if (r.status === 400 && /credit|billing/i.test(msg)) msg = 'Your Anthropic account needs credit to run lookups.';
        else if (r.status === 429) msg = 'Rate limited — wait a few seconds and try again.';
        else if (r.status === 529) msg = 'The API is briefly overloaded — try again in a moment.';
        throw new Error(msg);
      }
      var block = (r.data.content || []).filter(function (b) { return b.type === 'text'; })[0];
      return CC.parseNutritionJSON(block ? block.text : '');
    });
  }

  function normQ(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Save an AI result into the personal food bank so this food is free next time.
  function learnFood(query, n) {
    var qn = normQ(query);
    for (var i = 0; i < learned.length; i++) {
      if (normQ(learned[i].q) === qn) { learned.splice(i, 1); break; } // replace an older copy
    }
    learned.push({
      q: query, name: n.name, assumptions: n.assumptions,
      calories: n.calories, sugar_g: n.sugar_g, carbs_g: n.carbs_g, sodium_mg: n.sodium_mg,
      protein_g: n.protein_g, fat_g: n.fat_g, sat_fat_g: n.sat_fat_g, fiber_g: n.fiber_g,
      confidence: n.confidence, ts: Date.now()
    });
    if (learned.length > 500) learned.shift(); // cap storage; drop oldest
    save(K_LEARNED, learned);
  }

  // Best free answer for a query: the built-in list or a saved food, no API call.
  // An exact match to something you saved wins; otherwise a curated built-in food;
  // otherwise a looser saved match. Returns { n, note } or null.
  function freeLookup(query) {
    var curated = CC.matchFood(query);
    var lm = CC.matchLearned(query, learned);
    if (lm && lm.score >= 0.999) return { n: lm.n, note: 'From your saved foods — no AI lookup used.' };
    if (curated) return { n: curated, note: 'Free built-in estimate — no AI lookup used.' };
    if (lm) return { n: lm.n, note: 'From your saved foods — no AI lookup used.' };
    return null;
  }

  function runEstimate() {
    var query = $('food-input').value.trim();
    if (!query) { $('food-input').focus(); return; }

    lastResult = null;
    setBusy(true);
    showStatus('');

    var done = function (nutrition, note) {
      lastResult = nutrition;
      renderResult(nutrition, note);
      setBusy(false);
    };
    var fail = function (message) {
      renderError(message);
      setBusy(false);
    };

    if (apiKey) {
      // Money-saver: answer for free from the built-in list or your saved foods first;
      // only pay for an AI lookup when it's genuinely something new.
      if (preferDB) {
        var f = freeLookup(query);
        if (f) { done(f.n, f.note); return; }
      }
      estimateWithAI(query).then(function (n) {
        learnFood(query, n); // remember it so next time is free
        done(n, 'Saved to your foods — looking this up again won’t cost anything.');
      }).catch(function (err) {
        // Network/API failed — fall back to any free match.
        var f2 = freeLookup(query);
        if (f2) done(f2.n, 'Couldn’t reach the AI (' + err.message + '); used a saved/built-in estimate.');
        else fail(err.message + ' No saved or built-in match either — you can add credit or try rephrasing.');
      });
    } else {
      // No key: use the free built-in list + anything you saved earlier.
      var f3 = freeLookup(query);
      if (f3) { done(f3.n, f3.note + ' Add a Claude API key in Settings to look up new foods.'); }
      else {
        fail('No saved or built-in match for “' + query + '”. Add a Claude API key in Settings and the app can estimate anything — a restaurant meal, a homemade dish, a handful of candy.');
        setBusy(false);
      }
    }
  }

  // ---- rendering ----
  function setBusy(busy) {
    var btn = $('estimate-btn');
    btn.disabled = busy;
    btn.textContent = busy ? 'Estimating…' : 'Estimate';
  }
  function showStatus(msg) {
    var el = $('status');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function bar(value, target, unit) {
    var ratio = target > 0 ? value / target : 0;
    var pct = Math.min(100, Math.round(ratio * 100));
    var lvl = CC.levelForRatio(ratio);
    var shown = unit === 'mg' || unit === '' ? Math.round(value) : CC.fmtGrams(value);
    return '' +
      '<div class="metric ' + lvl + '">' +
        '<div class="metric-top"><span class="metric-val">' + shown + '<span class="metric-unit">' + unit + '</span></span>' +
        '<span class="metric-pct">' + Math.round(ratio * 100) + '% of day</span></div>' +
        '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
  }

  function renderResult(n, note) {
    var confClass = n.confidence === 'high' ? 'good' : (n.confidence === 'low' ? 'high' : 'mid');
    var primaries = CC.NUTRIENTS.filter(function (x) { return x.primary; });
    var secondaries = CC.NUTRIENTS.filter(function (x) { return !x.primary; });

    var html = '<div class="card result">';
    html += '<div class="result-head">' +
      '<div><div class="result-name">' + esc(n.name) + '</div>' +
      (n.assumptions ? '<div class="result-assume">' + esc(n.assumptions) + '</div>' : '') + '</div>' +
      '<span class="badge ' + confClass + '">' + esc(n.confidence) + ' confidence</span>' +
      '</div>';

    html += '<div class="metrics-grid">';
    primaries.forEach(function (nut) {
      html += '<div class="metric-cell"><div class="metric-label">' + nut.label + '</div>' + bar(n[nut.key], targets[nut.key], nut.unit) + '</div>';
    });
    html += '</div>';

    // secondary nutrients as a compact row
    html += '<div class="secondary">';
    secondaries.forEach(function (nut) {
      html += '<span><b>' + CC.fmtGrams(n[nut.key]) + nut.unit + '</b> ' + nut.label.toLowerCase() + '</span>';
    });
    html += '</div>';

    // relatable "compare it to" chips
    var comps = CC.relatableComparisons(n);
    if (comps.length) {
      html += '<div class="chips compare">';
      comps.forEach(function (c) { html += '<span class="chip static">' + esc(c) + '</span>'; });
      html += '</div>';
    }

    html += '<button id="add-btn" class="primary add">＋ Add to today</button>';
    if (note) html += '<div class="note">' + esc(note) + '</div>';
    html += '</div>';

    $('result').innerHTML = html;
    var addBtn = $('add-btn');
    if (addBtn) addBtn.addEventListener('click', addLastToToday);
  }

  function renderError(message) {
    $('result').innerHTML = '<div class="card result error"><div class="result-name">Hmm.</div>' +
      '<div class="result-assume">' + esc(message) + '</div></div>';
  }

  function addLastToToday() {
    if (!lastResult) return;
    var key = todayKey();
    if (!history[key]) history[key] = [];
    var item = Object.assign({}, lastResult, { id: key + '-' + history[key].length + '-' + Math.round(performance.now()) });
    history[key].push(item);
    save(K_HISTORY, history);
    lastResult = null;
    $('result').innerHTML = '';
    $('food-input').value = '';
    $('food-input').focus();
    renderLog();
  }

  function removeItem(id) {
    var key = todayKey();
    history[key] = (history[key] || []).filter(function (it) { return it.id !== id; });
    if (history[key].length === 0) delete history[key];
    save(K_HISTORY, history);
    renderLog();
  }

  function clearToday() {
    if (!todaysItems().length) return;
    if (!confirm('Clear everything logged today?')) return;
    delete history[todayKey()];
    save(K_HISTORY, history);
    renderLog();
  }

  function renderLog() {
    var items = todaysItems();
    var totals = CC.sumNutrition(items);
    var primaries = CC.NUTRIENTS.filter(function (x) { return x.primary; });

    var html = '<div class="log-head"><h2>Today <span class="muted">· ' + prettyDate(todayKey()) + '</span></h2>';
    if (items.length) html += '<button id="clear-btn" class="ghost">Clear</button>';
    html += '</div>';

    // daily totals vs targets
    html += '<div class="metrics-grid totals">';
    primaries.forEach(function (nut) {
      var val = totals[nut.key];
      var tgt = targets[nut.key];
      var ratio = tgt > 0 ? val / tgt : 0;
      var pct = Math.min(100, Math.round(ratio * 100));
      var lvl = CC.levelForRatio(ratio);
      var shown = nut.unit === 'g' ? CC.fmtGrams(val) : Math.round(val);
      html += '<div class="metric-cell"><div class="metric-label">' + nut.label + '</div>' +
        '<div class="metric ' + lvl + '"><div class="metric-top">' +
        '<span class="metric-val">' + shown + '<span class="metric-unit">' + nut.unit + '</span></span>' +
        '<span class="metric-pct">of ' + (nut.unit === 'g' ? CC.fmtGrams(tgt) : tgt) + nut.unit + '</span></div>' +
        '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div></div>';
    });
    html += '</div>';

    if (!items.length) {
      html += '<div class="empty">Nothing logged yet. Estimate a food above and tap <b>Add to today</b>.</div>';
    } else {
      html += '<ul class="log-list">';
      items.forEach(function (it) {
        html += '<li><div class="log-main"><span class="log-name">' + esc(it.name) + '</span>' +
          '<span class="log-sub">' + Math.round(it.calories) + ' cal · ' + CC.fmtGrams(it.sugar_g) + 'g sugar · ' +
          CC.fmtGrams(it.carbs_g) + 'g carbs · ' + Math.round(it.sodium_mg) + 'mg sodium</span></div>' +
          '<button class="remove" data-id="' + esc(it.id) + '" aria-label="Remove">✕</button></li>';
      });
      html += '</ul>';
    }

    $('log').innerHTML = html;
    var clearBtn = $('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearToday);
    Array.prototype.forEach.call($('log').querySelectorAll('.remove'), function (b) {
      b.addEventListener('click', function () { removeItem(b.getAttribute('data-id')); });
    });

    renderStats();
  }

  // ---- trends (pedometer-style day/week tracking) ----
  function metricDef() {
    for (var i = 0; i < CC.NUTRIENTS.length; i++) {
      if (CC.NUTRIENTS[i].key === statMetric && CC.NUTRIENTS[i].primary) return CC.NUTRIENTS[i];
    }
    return CC.NUTRIENTS[0];
  }

  // A small neutral "▲ 12%" / "▼ 12%" chip. Direction only — no good/bad coloring.
  function deltaChip(cur, prev) {
    if (prev == null || prev === 0) return '';
    var pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return '<span class="delta same">≈ same</span>';
    return '<span class="delta">' + (pct > 0 ? '▲' : '▼') + ' ' + Math.abs(pct) + '%</span>';
  }

  // Render a CSS bar chart. `bars` = [{label, value, highlight}]; a dashed line marks the target.
  function plot(bars, target, unit) {
    var scale = target || 0;
    bars.forEach(function (b) { scale = Math.max(scale, b.value); });
    scale = (scale || 1) * 1.15; // headroom so the tallest bar and its label fit
    var tPct = target > 0 ? Math.min(100, Math.round((target / scale) * 100)) : 0;
    var barsHtml = '', labsHtml = '';
    bars.forEach(function (b) {
      var h = b.value > 0 ? Math.max(2, Math.round((b.value / scale) * 100)) : 0;
      var lvl = b.value > 0 ? CC.dayLevel(b.value, target) : 'empty';
      barsHtml += '<div class="bar-col">' +
        '<div class="bar-val">' + (b.value > 0 ? CC.fmtCompact(b.value, unit) : '') + '</div>' +
        '<div class="bar ' + lvl + (b.highlight ? ' hl' : '') + '" style="height:' + h + '%"></div></div>';
      labsHtml += '<div class="lab' + (b.highlight ? ' hl' : '') + '">' + esc(b.label) + '</div>';
    });
    return '<div class="chart"><div class="plot">' +
      (target > 0 ? '<div class="target-line" style="bottom:' + tPct + '%"><span>' + CC.fmtCompact(target, unit) + ' target</span></div>' : '') +
      '<div class="bars">' + barsHtml + '</div></div><div class="labs">' + labsHtml + '</div></div>';
  }

  function renderStats() {
    var el = $('stats');
    var md = metricDef();
    var metric = md.key, unit = md.unit, target = targets[metric];

    var tabs = CC.NUTRIENTS.filter(function (n) { return n.primary; }).map(function (n) {
      return '<button class="tab' + (n.key === metric ? ' active' : '') + '" data-metric="' + n.key + '">' + n.label + '</button>';
    }).join('');
    var html = '<div class="stats-head"><h2>Trends</h2></div><div class="tabs">' + tabs + '</div>';

    if (!Object.keys(history).length) {
      html += '<div class="empty">Log a few foods and your day, week, and week-over-week trends show up here — like a step tracker for what you eat.</div>';
      el.innerHTML = html;
      wireTabs();
      return;
    }

    var today = new Date();
    var todayK = CC.dateKey(today);
    var todayVal = CC.dayMetric(history, todayK, metric).value;
    var yVal = CC.dayMetric(history, CC.dateKey(CC.addDays(today, -1)), metric).value;

    // streak: consecutive days logged (the headline), plus a within-target run
    // for the selected metric. Both update automatically from logged history.
    var isLogged = function (k) { return CC.isLoggedDay(history, k); };
    var logStreak = CC.streakCount(history, today, isLogged);
    var logBest = CC.longestStreak(history, isLogged);
    var mStreak = CC.streakCount(history, today, function (k) {
      return CC.isLoggedDay(history, k) && CC.dayMetric(history, k, metric).value <= target;
    });
    if (logStreak > 0) {
      html += '<div class="card streak"><div class="flame on">🔥</div><div class="streak-main">' +
        '<div class="streak-num">' + logStreak + ' <span>day streak</span></div>' +
        '<div class="streak-sub">Longest ' + logBest + ' day' + (logBest === 1 ? '' : 's') +
        (mStreak > 0 ? ' · <b>' + mStreak + '</b> day' + (mStreak === 1 ? '' : 's') + ' in a row within your ' + md.label.toLowerCase() + ' target' : '') +
        '</div></div></div>';
    } else {
      html += '<div class="card streak paused"><div class="flame">🔥</div><div class="streak-main">' +
        '<div class="streak-num">No streak yet</div><div class="streak-sub">Log a food today to start one' +
        (logBest > 0 ? ' · your best was ' + logBest + ' day' + (logBest === 1 ? '' : 's') : '') + '.</div></div></div>';
    }

    // headline: today's number + delta vs yesterday
    html += '<div class="card headline"><div class="hl-val">' + CC.fmtCompact(todayVal, unit) +
      '<span class="hl-unit">' + unit + '</span></div><div class="hl-sub">' + md.label.toLowerCase() + ' today' +
      (yVal ? ' · ' + deltaChip(todayVal, yVal) + ' <span class="muted">vs yesterday</span>' : '') + '</div></div>';

    // this week: 7-day bar chart + summary
    var monday = CC.startOfWeek(today);
    var wkKeys = CC.weekDayKeys(monday);
    var dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var wkBars = wkKeys.map(function (k, i) {
      return { label: dayNames[i], value: CC.dayMetric(history, k, metric).value, highlight: k === todayK };
    });
    var tw = CC.weekSummary(history, wkKeys, metric, target);

    html += '<div class="card panel"><div class="panel-head"><h3>This week</h3></div>' + plot(wkBars, target, unit);
    if (tw.loggedDays) {
      html += '<div class="panel-sum">Avg <b>' + CC.fmtCompact(tw.avg, unit) + unit + '</b>/day · logged ' +
        tw.loggedDays + ' of 7 days · <b>' + tw.within + '</b> within target</div>';
    } else {
      html += '<div class="panel-sum muted">Nothing logged this week yet.</div>';
    }
    var lw = CC.weekSummary(history, CC.weekDayKeys(CC.addDays(monday, -7)), metric, target);
    if (lw.loggedDays && tw.loggedDays) {
      html += '<div class="panel-sum">This week averages <b>' + CC.fmtCompact(tw.avg, unit) + unit + '</b>/day ' +
        deltaChip(tw.avg, lw.avg) + ' <span class="muted">vs last week (' + CC.fmtCompact(lw.avg, unit) + unit + '/day).</span></div>';
    }
    html += '</div>';

    // by week: last 8 weeks of daily-average
    var weeks = [], priorData = false;
    for (var i = 7; i >= 0; i--) {
      var m = CC.addDays(monday, -7 * i);
      var s = CC.weekSummary(history, CC.weekDayKeys(m), metric, target);
      if (i > 0 && s.loggedDays) priorData = true;
      weeks.push({ label: (m.getMonth() + 1) + '/' + m.getDate(), value: s.avg, highlight: i === 0 });
    }
    if (priorData) {
      html += '<div class="card panel"><div class="panel-head"><h3>By week</h3><span class="muted">daily average · week of</span></div>' +
        plot(weeks, target, unit) + '</div>';
    }

    el.innerHTML = html;
    wireTabs();
  }

  function wireTabs() {
    Array.prototype.forEach.call($('stats').querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        statMetric = t.getAttribute('data-metric');
        localStorage.setItem('cc_statmetric', statMetric);
        renderStats();
      });
    });
  }

  // ---- settings ----
  function buildSettings() {
    var modelOpts = MODELS.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === model ? ' selected' : '') + '>' + esc(m.label) + '</option>';
    }).join('');

    var targetInputs = CC.NUTRIENTS.map(function (nut) {
      return '<label class="target-row"><span>' + nut.label + (nut.unit ? ' (' + nut.unit + ')' : '') + '</span>' +
        '<input type="number" min="0" step="1" data-target="' + nut.key + '" value="' + targets[nut.key] + '"></label>';
    }).join('');

    $('settings-body').innerHTML =
      '<label class="field"><span>Claude API key</span>' +
      '<span class="key-wrap"><input id="key-input" type="password" placeholder="sk-ant-…" value="' + esc(apiKey) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button type="button" id="key-toggle" class="key-eye">Show</button></span></label>' +
      '<p class="hint">Saved only in this browser, on this device — so enter it once on each device (phone, laptop). ' +
      'It’s sent only to Anthropic, never to us. Get one at <b>console.anthropic.com</b> → API Keys; ' +
      'each lookup costs a fraction of a cent. Without a key, the app still works for ~35 common foods.</p>' +
      '<label class="field"><span>Model</span><select id="model-input">' + modelOpts + '</select></label>' +
      '<label class="switch-row"><span class="switch-label">Check built-in foods first' +
      '<small>Saves money — only pays for an AI lookup when a food isn’t in the built-in list.</small></span>' +
      '<span class="switch"><input type="checkbox" id="prefer-db"' + (preferDB ? ' checked' : '') + '><span class="slider"></span></span></label>' +
      '<div class="field"><span>Your saved foods</span>' +
      '<p class="hint">' + learned.length + ' food' + (learned.length === 1 ? '' : 's') +
      ' you looked up with AI ' + (learned.length === 1 ? 'is' : 'are') + ' saved here and reused for free. ' +
      (learned.length ? '<button type="button" id="clear-learned" class="linkbtn">Clear saved foods</button>' : '') + '</p></div>' +
      '<div class="field"><span>Daily targets to compare against</span><div class="targets">' + targetInputs + '</div>' +
      '<p class="hint">Defaults are the U.S. FDA Daily Values (2,000-calorie diet). Adjust for your own goals.</p></div>' +
      '<div class="settings-actions"><button id="save-settings" class="primary">Save</button>' +
      '<button id="reset-targets" class="ghost">Reset targets</button></div>';

    $('save-settings').addEventListener('click', saveSettings);
    $('reset-targets').addEventListener('click', function () {
      targets = Object.assign({}, CC.DEFAULT_TARGETS);
      save(K_TARGETS, targets);
      buildSettings();
      renderLog();
    });
    $('key-toggle').addEventListener('click', function () {
      var inp = $('key-input');
      var hidden = inp.type === 'password';
      inp.type = hidden ? 'text' : 'password';
      $('key-toggle').textContent = hidden ? 'Hide' : 'Show';
    });
    var clearLearned = $('clear-learned');
    if (clearLearned) clearLearned.addEventListener('click', function () {
      if (confirm('Clear your ' + learned.length + ' saved AI food' + (learned.length === 1 ? '' : 's') + '? Built-in foods stay.')) {
        learned = [];
        save(K_LEARNED, learned);
        buildSettings();
      }
    });
  }

  function saveSettings() {
    apiKey = $('key-input').value.trim();
    localStorage.setItem(K_KEY, apiKey);
    model = $('model-input').value;
    localStorage.setItem(K_MODEL, model);
    preferDB = $('prefer-db').checked;
    save(K_PREFER, preferDB);
    Array.prototype.forEach.call(document.querySelectorAll('[data-target]'), function (inp) {
      var k = inp.getAttribute('data-target');
      var v = parseFloat(inp.value);
      if (isFinite(v) && v >= 0) targets[k] = v;
    });
    save(K_TARGETS, targets);
    toggleSettings(false);
    renderLog();
    showStatus('Settings saved.');
    setTimeout(function () { showStatus(''); }, 2000);
    updateKeyPill();
  }

  function toggleSettings(open) {
    var panel = $('settings');
    var show = open == null ? panel.hasAttribute('hidden') : open;
    if (show) { buildSettings(); panel.removeAttribute('hidden'); }
    else panel.setAttribute('hidden', '');
  }

  function updateKeyPill() {
    var pill = $('key-pill');
    if (apiKey) { pill.textContent = 'AI on'; pill.className = 'pill good'; }
    else { pill.textContent = 'no key'; pill.className = 'pill'; }
  }

  // ---- examples ----
  var EXAMPLES = ['a Jersey Mike\'s Italian sub, original size', 'a homemade grilled cheese', 'a large handful of sour gummy worms', '2 eggs, toast, and black coffee'];
  function buildExamples() {
    var html = EXAMPLES.map(function (ex) { return '<span class="chip" data-ex="' + esc(ex) + '">' + esc(ex) + '</span>'; }).join('');
    $('examples').innerHTML = html;
    Array.prototype.forEach.call($('examples').querySelectorAll('[data-ex]'), function (c) {
      c.addEventListener('click', function () { $('food-input').value = c.getAttribute('data-ex'); runEstimate(); });
    });
  }

  // ---- init ----
  function init() {
    $('estimate-btn').addEventListener('click', runEstimate);
    $('food-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runEstimate(); }
    });
    $('settings-toggle').addEventListener('click', function () { toggleSettings(); });
    $('settings-close').addEventListener('click', function () { toggleSettings(false); });
    buildExamples();
    updateKeyPill();
    renderLog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
