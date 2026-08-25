# 🎓 Tutor Desk

Run a tutoring practice from your phone: **students, scheduling, hours, and payments**,
with notes on every session.

Built as a single-page web app — no accounts, no server. Everything runs in your browser
and stays on your device.

## What it does

**Today** — the sessions on today's calendar, what's coming in the next seven days, and a
"needs attention" list: past sessions you never logged, plus every student carrying a balance.

**Schedule** — add a session (student, date, time, length, location, topic), optionally
repeating weekly for up to 24 weeks. Tap any session to mark it **Completed**, **Canceled**,
or **No-show**, and to write up what you covered and what you assigned.

**Students** — rate, grade, focus, parent contact, and standing notes for each student, plus
their full session history and everything billed and paid.

**Hours & pay** — hours taught, amount billed, and amount collected for this month, last month,
this year, or all time; balances by student; and a log of payments received.

## How the money math works

You never type a total. Completed sessions become billable hours automatically:

- **Rate** — a session bills at its own override if you set one, otherwise the student's
  hourly rate, otherwise the practice-wide default in Settings.
- **Amount** — `rate × (minutes ÷ 60)`. A 90-minute session at $120/hr bills $180.
- **Canceled / no-show** — a no-show is charged by default and a cancellation isn't, but each
  session has a "charge for this session anyway" switch, so late cancels are one tap.
- **Balance due** — everything billed for a student minus every payment recorded for them.
  Recording a payment offers the exact outstanding amount so you can settle it in one tap.

**Invoice** — from a student's page, "Invoice" copies a plain-text itemized invoice (every
billable session, the total billed, payments received, balance due) ready to paste into a
text or email.

## Run it

Static files — no build step, no server, no account.

### Easiest: one file, no hosting
Open **`tutoring-standalone.html`** — the whole app inlined into a single file. Email or
AirDrop it to your phone, tap it, and it runs. Fully offline; it never makes a network request.

### Free public URL: GitHub Pages
If the repo is public, **Settings → Pages** → deploy from a branch, folder `/ (root)`. The app
is then at `<your-pages-url>/tutoring/`. Open it on your phone and "Add to Home Screen" — the
manifest and icons make it launch full-screen like a native app.

### Local
Open `index.html` in a browser (keep `app.js` in the same folder).

## Files

- `index.html` — layout and styles
- `app.js` — state, storage, scheduling, and the billing math
- `manifest.json`, `icon-*.png`, `apple-touch-icon.png` — add-to-home-screen assets
- `build-standalone.py` — bundles the above into one file (`python3 build-standalone.py`)
- `tutoring-standalone.html` — the generated single-file build

## Your data

Everything lives in this browser's local storage — nothing is uploaded anywhere, and there's
no account to sign into. That also means **the data belongs to that one browser on that one
device**: clearing site data erases it, and a second device starts empty.

Settings has **Export backup** (a JSON file) and **Import backup**, which is both your safety
net and the way to move between devices. **Sessions as CSV** exports the full session log for
a spreadsheet or a tax return. **Load sample data** fills the app with two example students so
you can look around before entering anything real.

## Notes & limits

- Times are stored as plain local dates and times; there are no time zones and no calendar sync.
- Nothing reminds you or the student about an upcoming session — this tracks your practice,
  it doesn't message anyone.
- The invoice is plain text, not a PDF, and the app doesn't process payments — you record
  money that arrived some other way.
