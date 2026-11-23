# 🎬 Trades Tracker

A phone page for Hollywood trade news that keeps only the **business** stories (deals, hires, signings,
castings, agency and management moves) and flags any story that mentions **people you know**.

- **Sources:** Deadline, Variety, The Hollywood Reporter (their RSS feeds), plus a Google News search for each person
  limited to those three sites, which catches names that appear only in the body of an article.
- **How often:** GitHub Actions runs `scripts/hollywood_scan.py` every ~15 minutes
  (`.github/workflows/hollywood-tracker.yml`) and saves the results to `hollywood/data.json`.
- **Alerts:** when someone on your list shows up, the workflow opens a GitHub issue labeled `trades-alert`,
  which GitHub sends to your phone (GitHub app) and email.
- **Your list:** `hollywood/people.txt`, or, to keep it private, a repository secret named `PEOPLE_LIST`
  in the same format (the secret wins if both exist).

List format, one person per line:

```
Jane Doe
Jane Doe | writer, we were on Show X together
Robert Smith | my old manager, aka: Bobby Smith, Rob Smith
```
