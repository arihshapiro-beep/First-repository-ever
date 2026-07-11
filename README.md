# 🧾 Check Splitter

Split a restaurant bill by **who ordered what**, with **location-aware tax** (food vs. alcohol),
flexible **tip** (on the pre-tax subtotal *or* the taxed total), and a **credit-card / service fee** line.
Snap a photo of the receipt and the app reads the items for you.

Built as a single-page web app — no accounts, no server. Everything runs in your browser and stays on your device.

## What it does

1. **Scan the receipt** — take/upload a photo. On-device OCR (Tesseract.js) reads the text and auto-fills the line items.
2. **Items & categories** — review the auto-filled list, fix anything, and tag each item **Food / Alcohol / Other**. Tax is applied per category.
3. **People** — add everyone splitting the check.
4. **Assign** — tap who ordered each item. Shared items split evenly among everyone tapped.
5. **Tax, tip & fees**
   - Per-category tax rates with presets (Evanston, IL is the default).
   - Tip as a %, computed on the **pre-tax subtotal** or the **taxed total** — your choice.
   - Credit-card / service fee as a **percent** or **flat dollar** amount.
6. **Per-person breakdown** — each person's items, tax, tip, and fee share, plus the grand total. One tap to copy a text summary.

## Tax by location — you don't look rates up, the app does

In Step 5, type a **city, ZIP code, or state** and the app fills in the food, alcohol, and "other"
tax rates for you. It understands formats like `Evanston, IL`, `evanston`, `60201`, `chicago il`,
`washington dc`, or just `Illinois`.

Each result is labeled with a confidence:

- **exact** — a hand-verified local rate, including places where alcohol is taxed differently from
  food. Examples: **Evanston, IL** (food 10.25% / alcohol **16.25%** with the city's 6% liquor tax),
  **Washington, DC** (10% meals tax), plus ~35 major cities.
- **typical** — for anywhere without a special entry, the app uses that **state's typical combined
  restaurant tax**. It's a close estimate; the exact rate can vary by street address.

Everything the lookup fills in stays **editable**, so you can always correct a rate by hand.

> ⚠️ Tax law changes and local surcharges vary. Treat the numbers as a strong starting point and
> confirm anything important. Sources: Tax Foundation state & local sales-tax data; City of Evanston
> home-rule liquor tax; DC Office of the CFO; Illinois Dept. of Revenue.

## Run it

It's just static files — no build step, no server, no account.

### Easiest: one file, no hosting
Open **`checksplitter-standalone.html`** — the whole app inlined into a single file. Email or
AirDrop it to your phone, tap it, and it runs in the browser. Nothing to sign up for.
(OCR still needs internet to load the text-recognition library the first time; typing items in by
hand works fully offline.)

### Free public URL: GitHub Pages
GitHub Pages is **free for public repositories** (private repos require a paid plan). If you're fine
with the code being public — it's just a calculator, no secrets or personal data — then:

1. Repo → **Settings → Change visibility → Make public**.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → pick your branch, folder
   `/ (root)` → **Save**.
3. Wait ~1 minute for the URL, open it on your phone, and "Add to Home Screen" so it feels like an app.

### Local
Open `index.html` in a browser (keep `app.js` and `taxData.js` in the same folder).

## Files

- `index.html` — layout and styles
- `taxData.js` — the built-in location → tax-rate database and lookup logic
- `app.js` — OCR, receipt parsing, assignment, and the tax/tip/fee math
- `checksplitter-standalone.html` — all of the above bundled into one file you can open directly

## Notes & limits

- OCR quality depends on the photo. Good lighting and a flat receipt help; always double-check the parsed items.
- Item categories are auto-guessed (e.g. "IPA" → alcohol) but you should verify each one.
- Your check is saved in the browser's local storage so a refresh won't lose it. "Start over" clears it.
