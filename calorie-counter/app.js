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
      estimateWithAI(query).then(function (n) { done(n); }).catch(function (err) {
        // Fall back to the built-in database if the network/API fails.
        var m = CC.matchFood(query);
        if (m) done(m, 'Used the built-in estimate (couldn’t reach the AI: ' + err.message + ').');
        else fail(err.message + ' No built-in match either — you can add credit or try rephrasing.');
      });
    } else {
      // No key: try the offline database.
      var m2 = CC.matchFood(query);
      if (m2) { done(m2, 'Built-in estimate. Add a Claude API key in Settings to look up anything you type.'); }
      else {
        fail('No built-in match for “' + query + '”. Add a Claude API key in Settings and the app can estimate anything — a restaurant meal, a homemade dish, a handful of candy.');
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

    renderHistory();
  }

  function renderHistory() {
    var keys = Object.keys(history).filter(function (k) { return k !== todayKey(); }).sort().reverse().slice(0, 7);
    if (!keys.length) { $('history').innerHTML = ''; return; }
    var html = '<h2>Previous days</h2><ul class="hist-list">';
    keys.forEach(function (k) {
      var t = CC.sumNutrition(history[k]);
      html += '<li><span>' + prettyDate(k) + '</span><span class="muted">' + Math.round(t.calories) +
        ' cal · ' + Math.round(t.sodium_mg) + 'mg sodium · ' + CC.fmtGrams(t.sugar_g) + 'g sugar</span></li>';
    });
    html += '</ul>';
    $('history').innerHTML = html;
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
      '<input id="key-input" type="password" placeholder="sk-ant-…" value="' + esc(apiKey) + '" autocomplete="off"></label>' +
      '<p class="hint">Stored only in this browser. Get one at <b>console.anthropic.com</b> → API Keys. ' +
      'Each lookup costs a fraction of a cent. Without a key, the app still works for ~35 common foods.</p>' +
      '<label class="field"><span>Model</span><select id="model-input">' + modelOpts + '</select></label>' +
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
  }

  function saveSettings() {
    apiKey = $('key-input').value.trim();
    localStorage.setItem(K_KEY, apiKey);
    model = $('model-input').value;
    localStorage.setItem(K_MODEL, model);
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
