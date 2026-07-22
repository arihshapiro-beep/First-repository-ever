/* Check Splitter — all logic, no build step, runs in the browser. */

// ---------- State ----------
const state = {
  items: [],        // {id, name, price, category}
  people: [],       // {id, name}
  assignments: {},  // itemId -> [personId, ...]
  tax: { food: 10.25, alcohol: 16.25, other: 10.25 },
  taxOverride: null,                      // exact tax $ from receipt; null = estimate from rates
  location: '',
  tip: { mode: 'percent', percent: 20, base: 'subtotal', flat: 0 }, // mode: 'percent' | 'flat'
  fee: { mode: 'percent', value: 0 },     // mode: 'percent' | 'flat'
};

const CATS = ['food', 'alcohol', 'other'];
const CAT_COLOR = { food: 'var(--food)', alcohol: 'var(--alcohol)', other: 'var(--other)' };

let idSeq = 1;
const uid = () => 'id' + (idSeq++);

// ---------- Persistence ----------
const STORAGE_KEY = 'checkSplitter.v1';
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, idSeq })); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    Object.assign(state, {
      items: d.items || [], people: d.people || [], assignments: d.assignments || {},
      tax: d.tax || state.tax, location: d.location || '',
      taxOverride: (d.taxOverride != null ? d.taxOverride : null),
      tip: Object.assign({ mode: 'percent', percent: 20, base: 'subtotal', flat: 0 }, d.tip || {}),
      fee: d.fee || state.fee,
    });
    idSeq = d.idSeq || 1;
  } catch (e) {}
}

// ---------- Category guessing ----------
const ALCOHOL_WORDS = ['beer','ipa','lager','ale','pilsner','stout','wine','vino','red','white','rose','rosé',
  'cocktail','margarita','martini','mojito','vodka','whiskey','whisky','bourbon','tequila','rum','gin','sake',
  'cider','champagne','prosecco','sangria','negroni','manhattan','spritz','shot','draft','pint','pinot','cab',
  'merlot','chardonnay','malbec','seltzer','mule','daiquiri','old fashioned','bloody mary','mimosa','brandy','cognac'];
function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (ALCOHOL_WORDS.some(w => n.includes(w))) return 'alcohol';
  return 'food';
}

// ---------- Receipt parsing ----------
const SKIP_WORDS = ['subtotal','sub total','sub-total','total','tax','tip','gratuity','balance','change','cash','visa',
  'master','mastercard','amex','discover','credit','debit','card','payment','paid','due','amount','tender','tendered',
  'server','table','guest','order #','check #','receipt','thank','www','http','phone','tel','qty','ttl','auth','ref',
  'trans','approval','account','acct','sale','date','time','host','station','terminal','店','copy','merchant'];

function parseReceipt(text) {
  const lines = (text || '').split('\n');
  const found = [];
  // Any money-looking token: optional $, 1-4 digits, . or , then 2 digits.
  const priceTokenRe = /\$?\s*(\d{1,4}[.,]\d{2})\b/g;
  for (let raw of lines) {
    let line = raw.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (line.length < 3) continue;
    const low = line.toLowerCase();
    if (SKIP_WORDS.some(w => low.includes(w))) continue;

    const prices = [...line.matchAll(priceTokenRe)];
    if (!prices.length) continue;
    const last = prices[prices.length - 1];          // rightmost number = the line price
    const price = parseFloat(last[1].replace(',', '.'));
    if (isNaN(price) || price <= 0 || price > 999) continue;

    // Name = everything before that price token
    let name = line.slice(0, last.index)
      .replace(/[$]/g, '')
      .replace(/[-–—.·•*_=\s]+$/g, '')              // trailing separators/dots
      .replace(/^(\d+)\s*[xX@]?\s+/, '')            // leading quantity "2 " / "2x " / "2@ "
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (name.length < 2 || !/[a-zA-Z]/.test(name)) continue; // needs a real word
    found.push({ id: uid(), name, price, category: guessCategory(name) });
  }
  return found;
}

// ---------- Image pre-processing (big quality win for OCR) ----------
function otsuBinarize(data) {
  const n = data.length / 4;
  const gray = new Uint8Array(n);
  const hist = new Array(256).fill(0);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[j] = g; hist[g]++;
  }
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (wB === 0) continue;
    const wF = n - wB; if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = gray[j] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

function preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targetW = Math.min(2000, Math.max(1200, img.width)); // upscale small, cap large
      const scale = targetW / img.width;
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const d = ctx.getImageData(0, 0, w, h);
        otsuBinarize(d.data);
        ctx.putImageData(d, 0, 0);
      } catch (e) { /* fall back to the plain draw */ }
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null); };
    img.src = URL.createObjectURL(file);
  });
}

// ---------- OCR ----------
const fileInput = document.getElementById('fileInput');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const ocrStatus = document.getElementById('ocrStatus');
const preview = document.getElementById('preview');
const rawWrap = document.getElementById('rawWrap');
const rawText = document.getElementById('rawText');
const reparseBtn = document.getElementById('reparseBtn');

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';

  if (typeof Tesseract === 'undefined') {
    ocrStatus.textContent = '⚠️ Text reader failed to load (need internet). Add items by hand below.';
    return;
  }

  progress.style.display = 'block';
  progressBar.style.width = '0%';
  ocrStatus.textContent = 'Sharpening image…';

  let source = file;
  try { const c = await preprocessImage(file); if (c) source = c; } catch (e) {}

  ocrStatus.textContent = 'Reading receipt…';
  let worker;
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') progressBar.style.width = Math.round(m.progress * 100) + '%';
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(source);
    const text = data.text || '';

    rawText.value = text;
    rawWrap.style.display = 'block';
    rawWrap.open = false;

    const parsed = parseReceipt(text);
    if (parsed.length) {
      state.items = state.items.concat(parsed);
      ocrStatus.textContent = `✅ Found ${parsed.length} item${parsed.length > 1 ? 's' : ''}. Check them in Step 2 — fix any misreads there.`;
    } else {
      rawWrap.open = true;
      ocrStatus.textContent = '🤔 Couldn\'t auto-detect priced items. Open the scanned text below, tidy it up, and tap “Re-scan” — or just add items by hand.';
    }
    renderAll();
    save();
  } catch (err) {
    ocrStatus.textContent = '⚠️ Reading failed. Add items by hand below.';
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) {} }
    progress.style.display = 'none';
  }
});

// Re-parse items from the (possibly hand-edited) scanned text
reparseBtn.addEventListener('click', () => {
  const parsed = parseReceipt(rawText.value || '');
  if (!parsed.length) {
    ocrStatus.textContent = '⚠️ Still no priced items found. Each item line needs a price like 12.99 at the end.';
    return;
  }
  if (state.items.length &&
      !confirm(`Replace the current ${state.items.length} item(s) with ${parsed.length} from this text?`)) return;
  state.items = parsed;
  state.assignments = {};
  renderAll();
  save();
  ocrStatus.textContent = `✅ Loaded ${parsed.length} item${parsed.length > 1 ? 's' : ''} from the text.`;
});

// ---------- Rendering: Items ----------
const itemList = document.getElementById('itemList');
const itemsEmpty = document.getElementById('itemsEmpty');

function renderItems() {
  itemList.innerHTML = '';
  itemsEmpty.style.display = state.items.length ? 'none' : 'block';
  for (const it of state.items) {
    const row = document.createElement('div');
    row.className = 'item';

    const grow = document.createElement('div');
    grow.className = 'grow';

    const nameIn = document.createElement('input');
    nameIn.className = 'name';
    nameIn.value = it.name;
    nameIn.placeholder = 'Item name';
    nameIn.addEventListener('input', () => { it.name = nameIn.value; save(); });

    const pills = document.createElement('div');
    pills.className = 'cat-pills';
    for (const c of CATS) {
      const p = document.createElement('button');
      p.className = 'cat-pill' + (it.category === c ? ' active' : '');
      p.dataset.cat = c;
      p.textContent = c[0].toUpperCase() + c.slice(1);
      p.addEventListener('click', () => { it.category = c; renderItems(); renderAssign(); renderSummary(); save(); });
      pills.appendChild(p);
    }
    grow.appendChild(nameIn);
    grow.appendChild(pills);

    const priceIn = document.createElement('input');
    priceIn.className = 'price';
    priceIn.type = 'number';
    priceIn.step = '0.01';
    priceIn.inputMode = 'decimal';
    priceIn.value = it.price;
    priceIn.addEventListener('input', () => { it.price = parseFloat(priceIn.value) || 0; renderSummary(); save(); });

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.textContent = '✕';
    del.title = 'Remove item';
    del.addEventListener('click', () => {
      state.items = state.items.filter(x => x.id !== it.id);
      delete state.assignments[it.id];
      renderAll(); save();
    });

    row.appendChild(grow);
    row.appendChild(priceIn);
    row.appendChild(del);
    itemList.appendChild(row);
  }
}

document.getElementById('addItemBtn').addEventListener('click', () => {
  state.items.push({ id: uid(), name: '', price: 0, category: 'food' });
  renderItems(); renderAssign(); save();
});

// ---------- Rendering: People ----------
const peopleChips = document.getElementById('peopleChips');
const personInput = document.getElementById('personInput');

function addPerson() {
  const name = personInput.value.trim();
  if (!name) return;
  state.people.push({ id: uid(), name });
  personInput.value = '';
  renderPeople(); renderAssign(); save();
}
document.getElementById('addPersonBtn').addEventListener('click', addPerson);
personInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPerson(); });

function renderPeople() {
  peopleChips.innerHTML = '';
  for (const p of state.people) {
    const chip = document.createElement('span');
    chip.className = 'person-chip';
    chip.textContent = p.name;
    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '×';
    x.addEventListener('click', () => {
      state.people = state.people.filter(q => q.id !== p.id);
      for (const k in state.assignments) {
        state.assignments[k] = state.assignments[k].filter(id => id !== p.id);
      }
      renderPeople(); renderAssign(); renderSummary(); save();
    });
    chip.appendChild(x);
    peopleChips.appendChild(chip);
  }
}

// ---------- Rendering: Assignment ----------
const assignList = document.getElementById('assignList');
const assignEmpty = document.getElementById('assignEmpty');

function renderAssign() {
  assignList.innerHTML = '';
  const ready = state.items.length && state.people.length;
  assignEmpty.style.display = ready ? 'none' : 'block';
  if (!ready) return;

  for (const it of state.items) {
    const wrap = document.createElement('div');
    wrap.className = 'assign-item';

    const head = document.createElement('div');
    head.className = 'assign-head';
    const assignees = state.assignments[it.id] || [];
    const shared = assignees.length > 1
      ? ` <span class="split-note">· split ${assignees.length} ways</span>` : '';
    head.innerHTML = `<span><span class="cat-dot" style="background:${CAT_COLOR[it.category]}"></span>${escapeHtml(it.name || 'Untitled')}${shared}</span><span>$${it.price.toFixed(2)}</span>`;

    const who = document.createElement('div');
    who.className = 'who';
    for (const p of state.people) {
      const b = document.createElement('button');
      const on = assignees.includes(p.id);
      b.className = on ? 'on' : '';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        const arr = state.assignments[it.id] || [];
        state.assignments[it.id] = on ? arr.filter(id => id !== p.id) : arr.concat(p.id);
        renderAssign(); renderSummary(); save();
      });
      who.appendChild(b);
    }

    wrap.appendChild(head);
    wrap.appendChild(who);
    assignList.appendChild(wrap);
  }
}

// ---------- Tax / tip / fee controls ----------
const locationInput = document.getElementById('locationInput');
const lookupBtn = document.getElementById('lookupBtn');
const locResult = document.getElementById('locResult');
const citySuggest = document.getElementById('citySuggest');
const taxFood = document.getElementById('taxFood');
const taxAlcohol = document.getElementById('taxAlcohol');
const taxOther = document.getElementById('taxOther');
const taxExact = document.getElementById('taxExact');
const tipValue = document.getElementById('tipValue');
const tipBaseRow = document.getElementById('tipBaseRow');
const feeValue = document.getElementById('feeValue');

// Autocomplete list of known cities
if (typeof CITY_SUGGESTIONS !== 'undefined') {
  citySuggest.innerHTML = CITY_SUGGESTIONS.map(s => `<option value="${s}"></option>`).join('');
}

function syncTaxInputs() {
  taxFood.value = state.tax.food;
  taxAlcohol.value = state.tax.alcohol;
  taxOther.value = state.tax.other;
}

function showLocResult(res, query) {
  locResult.classList.add('show');
  if (!res) {
    locResult.innerHTML = `<span class="conf miss">no match</span> Couldn't find “${escapeHtml(query)}”. Try a ZIP code, “City, ST”, or a state name — or just type the rates in below.`;
    return;
  }
  const diff = res.alcohol !== res.food
    ? ` <span class="split-note">· alcohol taxed higher here</span>` : '';
  locResult.innerHTML =
    `<span class="lbl">${escapeHtml(res.label)}</span>` +
    `<span class="conf ${res.confidence}">${res.confidence}</span>${diff}` +
    `<div class="sub">Food ${res.food}% · Alcohol ${res.alcohol}% · Other ${res.other}% — ${escapeHtml(res.note)}</div>`;
}

function doLookup() {
  const q = locationInput.value.trim();
  state.location = q;
  if (!q) { locResult.classList.remove('show'); save(); return; }
  const res = (typeof lookupTax !== 'undefined') ? lookupTax(q) : null;
  if (res) {
    state.tax = { food: res.food, alcohol: res.alcohol, other: res.other };
    syncTaxInputs();
    renderSummary();
  }
  showLocResult(res, q);
  save();
}

lookupBtn.addEventListener('click', doLookup);
locationInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } });
locationInput.addEventListener('change', doLookup); // fires when picking a datalist suggestion

function bindTax(input, key) {
  input.addEventListener('input', () => {
    state.tax[key] = parseFloat(input.value) || 0;
    locResult.classList.remove('show'); // manual override clears the lookup note
    renderSummary(); save();
  });
}
bindTax(taxFood, 'food');
bindTax(taxAlcohol, 'alcohol');
bindTax(taxOther, 'other');

// Exact tax from receipt (blank = estimate from rates)
taxExact.addEventListener('input', () => {
  const v = taxExact.value.trim();
  state.taxOverride = v === '' ? null : (parseFloat(v) || 0);
  renderSummary(); save();
});

// Tip value — meaning depends on mode (percent vs exact $)
tipValue.addEventListener('input', () => {
  const v = parseFloat(tipValue.value) || 0;
  if (state.tip.mode === 'flat') state.tip.flat = v; else state.tip.percent = v;
  renderSummary(); save();
});

document.querySelectorAll('[data-tipmode]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tip.mode = btn.dataset.tipmode;
    document.querySelectorAll('[data-tipmode]').forEach(b => b.classList.toggle('on', b === btn));
    syncTipFeeInputs();
    renderSummary(); save();
  });
});

document.querySelectorAll('[data-tipbase]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tip.base = btn.dataset.tipbase;
    document.querySelectorAll('[data-tipbase]').forEach(b => b.classList.toggle('on', b === btn));
    renderSummary(); save();
  });
});

document.querySelectorAll('[data-feemode]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.fee.mode = btn.dataset.feemode;
    document.querySelectorAll('[data-feemode]').forEach(b => b.classList.toggle('on', b === btn));
    renderSummary(); save();
  });
});
feeValue.addEventListener('input', () => {
  state.fee.value = parseFloat(feeValue.value) || 0;
  renderSummary(); save();
});

function syncTipFeeInputs() {
  tipValue.value = state.tip.mode === 'flat' ? state.tip.flat : state.tip.percent;
  feeValue.value = state.fee.value;
  taxExact.value = state.taxOverride != null ? state.taxOverride : '';
  document.querySelectorAll('[data-tipmode]').forEach(b => b.classList.toggle('on', b.dataset.tipmode === state.tip.mode));
  document.querySelectorAll('[data-tipbase]').forEach(b => b.classList.toggle('on', b.dataset.tipbase === state.tip.base));
  document.querySelectorAll('[data-feemode]').forEach(b => b.classList.toggle('on', b.dataset.feemode === state.fee.mode));
  // The base toggle only matters for a percentage tip
  if (tipBaseRow) tipBaseRow.style.display = state.tip.mode === 'flat' ? 'none' : '';
}

// ---------- Core calculation ----------
function compute() {
  // Per-person accumulation
  const per = {};
  for (const p of state.people) per[p.id] = { name: p.name, sub: 0, tax: 0, items: [] };

  let totalSub = 0, totalTax = 0;

  for (const it of state.items) {
    const assignees = (state.assignments[it.id] || []).filter(id => per[id]);
    if (!assignees.length) continue;
    const share = it.price / assignees.length;
    const rate = (state.tax[it.category] || 0) / 100;
    const shareTax = share * rate;
    totalSub += it.price;
    totalTax += it.price * rate;
    for (const id of assignees) {
      per[id].sub += share;
      per[id].tax += shareTax;
      per[id].items.push({ name: it.name || 'Untitled', share, category: it.category, shared: assignees.length > 1 });
    }
  }

  // Exact-tax override: rescale the estimated per-person tax to hit the receipt total exactly,
  // keeping each person's share weighted by what they ordered (alcohol taxed higher, etc.).
  if (state.taxOverride != null && state.taxOverride >= 0) {
    if (totalTax > 0) {
      const f = state.taxOverride / totalTax;
      for (const p of state.people) per[p.id].tax *= f;
    } else {
      const subAll = state.people.reduce((s, p) => s + per[p.id].sub, 0);
      for (const p of state.people) per[p.id].tax = subAll > 0 ? (per[p.id].sub / subAll) * state.taxOverride : 0;
    }
    totalTax = state.taxOverride;
  }

  // Tip — a % of the chosen base, or an exact $ amount; allocated by each person's base proportion
  const baseFor = (rec) => state.tip.base === 'taxed' ? (rec.sub + rec.tax) : rec.sub;
  const totalTipBase = state.people.reduce((s, p) => s + baseFor(per[p.id]), 0);
  const totalTip = state.tip.mode === 'flat'
    ? (state.tip.flat || 0)
    : totalTipBase * ((state.tip.percent || 0) / 100);
  for (const p of state.people) {
    per[p.id].tip = totalTipBase > 0 ? (baseFor(per[p.id]) / totalTipBase) * totalTip : 0;
  }

  // Fee — on grand total (sub+tax+tip), allocated proportionally to that pre-fee total
  const preFeeTotalAll = totalSub + totalTax + totalTip;
  let totalFee = 0;
  if (state.fee.mode === 'percent') totalFee = preFeeTotalAll * ((state.fee.value || 0) / 100);
  else totalFee = state.fee.value || 0;

  for (const p of state.people) {
    const preFee = per[p.id].sub + per[p.id].tax + per[p.id].tip;
    per[p.id].fee = preFeeTotalAll > 0 ? (preFee / preFeeTotalAll) * totalFee : 0;
    per[p.id].total = preFee + per[p.id].fee;
  }

  return { per, totalSub, totalTax, totalTip, totalFee,
           grand: totalSub + totalTax + totalTip + totalFee };
}

// ---------- Rendering: Summary ----------
const summary = document.getElementById('summary');
const summaryEmpty = document.getElementById('summaryEmpty');
const grandTotals = document.getElementById('grandTotals');

function money(n) { return '$' + (n || 0).toFixed(2); }

function renderSummary() {
  const anyAssigned = Object.values(state.assignments).some(a => a && a.length);
  if (!state.people.length || !anyAssigned) {
    summary.innerHTML = '';
    summaryEmpty.style.display = 'block';
    grandTotals.classList.add('hidden');
    return;
  }
  summaryEmpty.style.display = 'none';
  grandTotals.classList.remove('hidden');

  const r = compute();
  summary.innerHTML = '';
  for (const p of state.people) {
    const rec = r.per[p.id];
    if (!rec || (rec.sub === 0 && rec.items.length === 0)) continue;
    const box = document.createElement('div');
    box.className = 'sum-person';
    const itemsTxt = rec.items.map(i => `${escapeHtml(i.name)}${i.shared ? ' (½+)' : ''} ${money(i.share)}`).join(' · ');
    box.innerHTML = `
      <div class="top"><span class="name">${escapeHtml(rec.name)}</span><span class="total">${money(rec.total)}</span></div>
      <div class="sum-line"><span>Items</span><span>${money(rec.sub)}</span></div>
      <div class="sum-line"><span>Tax</span><span>${money(rec.tax)}</span></div>
      <div class="sum-line"><span>Tip${state.tip.mode === 'flat' ? '' : ' (' + state.tip.percent + '%)'}</span><span>${money(rec.tip)}</span></div>
      <div class="sum-line"><span>Fee</span><span>${money(rec.fee)}</span></div>
      <div class="sum-items">${itemsTxt || 'No items assigned'}</div>`;
    summary.appendChild(box);
  }

  document.getElementById('gSub').textContent = money(r.totalSub);
  document.getElementById('gTax').textContent = money(r.totalTax);
  document.getElementById('gTip').textContent = money(r.totalTip);
  document.getElementById('gFee').textContent = money(r.totalFee);
  document.getElementById('gTotal').textContent = money(r.grand);
}

// ---------- Copy summary ----------
document.getElementById('shareBtn').addEventListener('click', async () => {
  const r = compute();
  let txt = '🧾 Check Split\n\n';
  for (const p of state.people) {
    const rec = r.per[p.id];
    if (!rec || rec.total === undefined) continue;
    txt += `${rec.name}: ${money(rec.total)}  (items ${money(rec.sub)}, tax ${money(rec.tax)}, tip ${money(rec.tip)}, fee ${money(rec.fee)})\n`;
  }
  txt += `\nSubtotal ${money(r.totalSub)} · Tax ${money(r.totalTax)} · Tip ${money(r.totalTip)} · Fees ${money(r.totalFee)}\nGrand total ${money(r.grand)}`;
  try {
    await navigator.clipboard.writeText(txt);
    const btn = document.getElementById('shareBtn');
    const old = btn.textContent; btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch (e) {
    alert(txt);
  }
});

// ---------- Reset ----------
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Clear everything and start a new check?')) return;
  state.items = []; state.people = []; state.assignments = {};
  localStorage.removeItem(STORAGE_KEY);
  ocrStatus.textContent = ''; preview.style.display = 'none'; fileInput.value = '';
  state.location = ''; locationInput.value = ''; locResult.classList.remove('show');
  state.taxOverride = null; taxExact.value = '';
  renderAll();
});

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderAll() {
  renderItems();
  renderPeople();
  renderAssign();
  renderSummary();
}

// ---------- Init ----------
load();
syncTaxInputs();
syncTipFeeInputs();
if (state.location) {
  locationInput.value = state.location;
  const res = (typeof lookupTax !== 'undefined') ? lookupTax(state.location) : null;
  if (res) showLocResult(res, state.location); // show the note; keep any saved/edited rates
}
renderAll();
