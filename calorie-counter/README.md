# 🥗 Calorie Counter

Type any food in **plain words** and get an estimate of its **calories, sugar, carbs, and sodium** —
with **something to compare it to** (your daily targets, plus relatable "≈ 3 tsp of sugar" style
equivalents). Log foods through the day and watch your running totals fill up against the recommended
daily amounts.

The whole point: you don't look anything up. Say *"a Jersey Mike's Italian sub, original size"*,
*"a homemade grilled cheese"*, or *"a large handful of sour gummy worms"* and it figures out the numbers.
Estimates are the goal, not lab-grade precision.

Built as a single-page web app — no accounts, no server. Everything runs in your browser and stays on your device.

## What it does

1. **Describe a food** — a restaurant/chain item, a homemade dish, packaged snacks, a vague portion
   ("a handful", "a big bowl"). Several things at once are fine ("2 eggs, toast, and black coffee").
2. **Get an estimate** — calories plus **sugar, carbs, and sodium** shown big, each with a bar showing
   what share of your day it uses. Protein, fat, saturated fat, and fiber are shown too.
3. **Compare it to** — every result includes friendly equivalents like *sugar ≈ 3 tsp*,
   *sodium ≈ 44% of a day's limit*, *carbs ≈ 3 slices of bread*, *≈ 140 min of walking to burn*.
4. **Add to today** — tap to log it. Your day's running totals update, each with a colored progress bar
   (green → amber → red) against your daily targets.
5. **Track it like a pedometer** — a **Trends** view remembers every day and rolls it up by week:
   - a **🔥 streak** of consecutive days you've logged (with your longest-ever streak, plus a
     "days in a row within your target" streak for the selected metric),
   - a **today** headline with an up/down arrow vs. yesterday,
   - a **this‑week** bar chart (Mon–Sun) with your daily‑average, a dashed target line, and how many days landed within target,
   - **this week vs. last week** (daily average, with the % change), and
   - a **by‑week** chart of your daily average over the last 8 weeks.

   Switch the charts between Calories, Sugar, Carbs, and Sodium with one tap. Remove items or clear the day anytime.

## How the "type anything" part works

Open-ended food descriptions (a specific chain sandwich, a homemade recipe, "a large handful of…")
can't come from a fixed list — so the app asks an AI model to estimate them.

- **With a Claude API key** (recommended): the app sends your description to Anthropic's API and gets
  back a nutrition estimate for **anything** you type. Add your key in **⚙️ Settings**. The key is stored
  **only in your browser** and is sent straight to Anthropic — nowhere else. Each lookup costs a fraction
  of a cent.
- **Without a key**: the app still works using a built-in database of ~35 common foods and popular
  items (including the three examples above), so you can try it immediately.

### Getting a key

1. Go to **console.anthropic.com** → **API Keys** → create a key (starts with `sk-ant-…`).
2. Add a little credit to the account (Billing). Lookups are tiny — cents buy hundreds.
3. Paste the key into **⚙️ Settings** in the app and Save.

### Model choice

In Settings you can pick the model:

- **Haiku 4.5** — fast and inexpensive. The default, and plenty good for food estimates.
- **Sonnet 5** — more accurate, a bit slower/pricier.
- **Opus 5** — most accurate.

## Comparing to your day

The "something to compare it to" is your **daily targets**. They default to the U.S. FDA Daily Values for
a 2,000-calorie diet (calories 2,000 · added sugar 50 g · carbs 275 g · sodium 2,300 mg, plus protein/fat/
fiber). Change any of them in Settings to match your own goals — the bars and percentages update everywhere.

## Run it

It's just static files — no build step, no server, no account.

### Easiest: one file, no hosting
Open **`calorie-counter-standalone.html`** — the whole app in a single file. Email or AirDrop it to your
phone, tap it, and it runs in the browser. "Add to Home Screen" and it feels like an app.
(AI lookups need internet; the built-in common-food estimates work fully offline.)

### Free public URL: GitHub Pages
GitHub Pages is free for public repositories. In the repo: **Settings → Pages → Deploy from a branch**,
pick your branch and `/ (root)`, Save. Then open `https://<you>.github.io/<repo>/calorie-counter/` on your phone.
(Your API key still lives only in your own browser — it is never committed or shared.)

### Local
Open `index.html` in a browser (keep `foods.js` and `app.js` in the same folder).

## Files

- `index.html` — layout and styles
- `foods.js` — the built-in food database plus the estimate/parse/compare and day/week aggregation helpers
- `app.js` — the AI lookup, the daily log, totals, comparisons, the day/week Trends view, and settings
- `calorie-counter-standalone.html` — all of the above bundled into one file you can open directly

## Notes & limits

- **Everything is an estimate.** Portions and recipes vary; treat the numbers as a helpful ballpark, not
  a precise measurement. Not medical or dietary advice.
- Your log and settings are saved in the browser's local storage, so a refresh won't lose them.
  "Clear" wipes the current day.
- The **streak is automatic** — nothing to switch on. Log at least one food each day to keep it going;
  you have until midnight, so today doesn't count as broken until the day is over. A missed day resets it.
- The "sugar" target uses the FDA added-sugars limit (50 g); the AI usually reports total sugars, so a
  fruit-heavy day can read high on the sugar bar — that's expected.
