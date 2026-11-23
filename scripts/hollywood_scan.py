#!/usr/bin/env python3
"""Hollywood trades tracker.

Pulls the latest stories from Deadline, Variety and The Hollywood Reporter,
keeps only the *business* news (deals, hires, signings, castings, agency and
management moves) and flags any story that mentions someone on your list in
hollywood/people.txt.

Runs on GitHub Actions every ~15 minutes (see .github/workflows/hollywood-tracker.yml)
and writes hollywood/data.json, which hollywood/index.html displays.

Standard library only, so the workflow needs no installs.
"""
from __future__ import annotations

import email.utils
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOLLY = os.path.join(ROOT, "hollywood")
PEOPLE_FILE = os.path.join(HOLLY, "people.txt")
DATA_FILE = os.path.join(HOLLY, "data.json")

KEEP_DAYS = 21          # how long stories stay on the page
PEOPLE_KEEP_DAYS = 120  # stories about your people are kept longer
SEARCH_BATCH = 40       # people searched per run (rotates through the list)

FEEDS = [
    ("Deadline", "https://deadline.com/feed/"),
    ("Deadline", "https://deadline.com/feed/?paged=2"),
    ("Deadline", "https://deadline.com/feed/?paged=3"),
    ("Deadline", "https://deadline.com/v/film/feed/"),
    ("Deadline", "https://deadline.com/v/tv/feed/"),
    ("Deadline", "https://deadline.com/v/business/feed/"),
    ("Variety", "https://variety.com/feed/"),
    ("Variety", "https://variety.com/v/film/feed/"),
    ("Variety", "https://variety.com/v/tv/feed/"),
    ("Variety", "https://variety.com/v/biz/feed/"),
    ("THR", "https://www.hollywoodreporter.com/feed/"),
    ("THR", "https://www.hollywoodreporter.com/c/business/feed/"),
]

SITES = {
    "deadline.com": "Deadline",
    "variety.com": "Variety",
    "hollywoodreporter.com": "THR",
}

UA = "Mozilla/5.0 (compatible; trades-tracker/1.0; personal RSS reader)"

# --------------------------------------------------------------------------
# What counts as "business" news. Each tag has phrases; a story gets a tag if
# its headline or summary contains any of them.
# --------------------------------------------------------------------------
TAGS = {
    "Writers & Directors": [
        r"to direct", r"to helm", r"will direct", r"directing", r"set to direct",
        r"to write", r"to pen", r"penning", r"will write", r"writer", r"screenwriter",
        r"scribe", r"showrunner", r"co-showrunner", r"writers'? room", r"script",
        r"adapt(?:ing|s|ation)?", r"rewrite", r"creator", r"director",
        r"helmer", r"filmmaker",
    ],
    "Agents & Managers": [
        r"signs with", r"signs on with", r"inks with", r"\bpacts? with",
        r"\bCAA\b", r"\bWME\b", r"\bUTA\b", r"\bGersh\b", r"\bICM\b", r"\bVerve\b",
        r"\bAPA\b", r"\bParadigm\b", r"\bA3\b", r"\bInnovative Artists\b",
        r"\bAnonymous Content\b", r"\bRange Media\b", r"\bManagement 360\b",
        r"\bEntertainment 360\b", r"\bBrillstein\b", r"\b3 Arts\b", r"\bGrandview\b",
        r"\bCircle of Confusion\b", r"\bMadhouse\b", r"\bKaplan/Perrone\b",
        r"\bWriters Guild\b", r"\bDGA\b", r"\bWGA\b",
        r"agent", r"agency", r"manager", r"management", r"\breps?\b",
        r"represent", r"\bpartner\b", r"promoted", r"\bupped\b", r"ankles",
        r"exits", r"departs", r"poach", r"defects?", r"lit department",
        r"talent department", r"new hire", r"hires", r"names .* (?:head|president|chief|vp|svp|evp)",
        r"\bjoins\b", r"\bexec(?:utive)?s?\b.*\b(?:shuffle|shakeup|promot|named|appoint)",
        r"appoint", r"\bnamed\b",
    ],
    "Casting": [
        r"\bcast\b", r"casting", r"\bcasts\b", r"joins? (?:the )?cast", r"to star",
        r"set to star", r"will star", r"\bstarring\b", r"boards", r"rounds? out",
        r"series regular", r"recurring", r"ensemble", r"lead role", r"co-star",
        r"\badds\b", r"\bjoins\b", r"tapped", r"\btaps\b",
    ],
    "Deals & Projects": [
        r"\bdeal\b", r"overall deal", r"first-look", r"first look", r"\bpact\b",
        r"\binks\b", r"\bsigns\b", r"\blands\b", r"\bnabs\b", r"\bscores\b",
        r"acquires", r"acquisition", r"\bbuys\b", r"picks up", r"pickup",
        r"\boptions?\b", r"\boptioned\b", r"rights", r"greenlit", r"greenlight",
        r"green-lit", r"series order", r"\borders\b", r"pilot", r"in development",
        r"in the works", r"\bsets\b", r"\bpackage\b", r"\bfinanc", r"\bslate\b",
        r"production company", r"banner", r"launches", r"\bbidding\b", r"\bsale\b",
        r"\bsells\b", r"\bsold\b", r"\bdistribution\b", r"\brenew",
    ],
}

# Headlines that are almost never trade/business news.
NOISE = [
    r"box office", r"\breview\b", r"\bdies\b", r"\bdead at\b", r"obituary",
    r"\bR\.I\.P\b", r"trailer", r"first look at", r"teaser", r"red carpet",
    r"\bphotos?\b", r"\bgallery\b", r"\bratings\b", r"viewership", r"oscar predictions",
    r"predictions", r"\bpodcast\b", r"\bquiz\b", r"\bslams\b", r"\bblasts\b",
    r"\bclaps back\b", r"\bfeud\b", r"\binstagram\b", r"\btiktok\b", r"\bslideshow\b",
    r"\bwhat to watch\b", r"\bwhere to (?:watch|stream)\b", r"\brecap\b",
    r"\bspoiler", r"\bfinale explained\b", r"\bexplained\b", r"\bfashion\b",
    r"\bbest-dressed\b", r"\bbirthday\b", r"\bpregnan", r"\bdivorce\b", r"\bdating\b",
    r"\bnfl\b", r"\bnba\b", r"\bsuper bowl\b", r"\bchart\b", r"\balbum\b",
    r"\bbillboard\b", r"\bgrammy", r"\btour\b",
]

TAG_RES = {t: re.compile("|".join(p), re.I) for t, p in TAGS.items()}
NOISE_RE = re.compile("|".join(NOISE), re.I)
STRONG_BIZ_RE = re.compile(
    r"\b(?:signs|inks|boards|joins|taps|tapped|hires|lands|nabs|sets|acquires|"
    r"to direct|to write|to pen|to helm|to star|set to star|deal|pact|promoted|"
    r"upped|exits|ankles|cast|casting|rounds out|series order|greenlit|options?|promotes|names|named|"
    r"appoints|appointed|hired|hiring|adds|partner|partners|launches|exec|executive|showrunner|"
    r"overall|first-look|orders|picks up|renews|exit|departs|moves to|jumps to|poaches)\b",
    re.I,
)


# --------------------------------------------------------------------------
def fetch(url: str, timeout: int = 25) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print(f"  ! {url} ({e})", file=sys.stderr)
            time.sleep(2)
    return None


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_date(s: str | None) -> datetime:
    if s:
        try:
            d = email.utils.parsedate_to_datetime(s)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc)
        except Exception:  # noqa: BLE001
            pass
    return datetime.now(timezone.utc)


NS = {"content": "http://purl.org/rss/1.0/modules/content/", "dc": "http://purl.org/dc/elements/1.1/"}


def parse_feed(raw: bytes, source: str) -> list[dict]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        print(f"  ! parse error for {source}: {e}", file=sys.stderr)
        return []
    out = []
    for it in root.iter("item"):
        title = strip_html(it.findtext("title") or "")
        link = (it.findtext("link") or "").strip()
        desc = strip_html(it.findtext("description") or "")
        body = strip_html(it.findtext("content:encoded", namespaces=NS) or "")
        cats = [strip_html(c.text or "") for c in it.findall("category")]
        author = strip_html(it.findtext("dc:creator", namespaces=NS) or "")
        src = source
        src_el = it.find("source")  # Google News puts the publisher here
        if src_el is not None:
            src_url = src_el.get("url", "")
            for dom, name in SITES.items():
                if dom in src_url:
                    src = name
            title = re.sub(r"\s+-\s+(Deadline|Variety|The Hollywood Reporter|Hollywood Reporter)\s*$", "", title)
        if not title or not link:
            continue
        out.append({
            "title": title,
            "link": link,
            "summary": desc[:400],
            "_body": body,
            "categories": cats,
            "author": author,
            "source": src,
            "published": parse_date(it.findtext("pubDate")).isoformat(),
        })
    return out


def item_id(it: dict) -> str:
    key = re.sub(r"\W+", "", it["title"].lower())[:120]
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def classify(it: dict) -> tuple[list[str], bool]:
    head = it["title"]
    text = f'{it["title"]} {it["summary"]}'
    tags = [t for t, rx in TAG_RES.items() if rx.search(text)]
    noisy = bool(NOISE_RE.search(head))
    is_biz = bool(tags) and (not noisy or bool(STRONG_BIZ_RE.search(head)))
    # Require a strong signal in the headline itself for the general feed, so
    # stories that merely mention a "director" in passing don't sneak in.
    if is_biz and not STRONG_BIZ_RE.search(head) and not re.search(
        r"agent|agency|manager|management|showrunner|overall|first-look|cast|options?|rights|order",
        head, re.I,
    ):
        is_biz = False
    return tags, is_biz


# --------------------------------------------------------------------------
def load_people() -> list[dict]:
    """people.txt: one person per line.  Optional extras after a '|':

        Jane Doe
        Jane Doe | writer, worked together on Show X
        Robert "Bobby" Smith | aka: Bobby Smith, Rob Smith
    """
    people = []
    # A private list in the PEOPLE_LIST repository secret wins over people.txt.
    secret = os.environ.get("PEOPLE_LIST", "").strip()
    if secret:
        lines = secret.splitlines()
    elif os.path.exists(PEOPLE_FILE):
        with open(PEOPLE_FILE, encoding="utf-8") as f:
            lines = f.read().splitlines()
    else:
        return people
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, note = line.partition("|")
        name = name.strip()
        note = note.strip()
        aliases = [name]
        m = re.search(r"aka:\s*(.+)$", note, re.I)
        if m:
            aliases += [a.strip() for a in m.group(1).split(",") if a.strip()]
            note = note[: m.start()].strip(" ,;")
        if len(name) < 4:
            continue
        people.append({"name": name, "note": note, "aliases": aliases})
    return people


def name_regex(alias: str) -> re.Pattern:
    parts = [re.escape(p) for p in alias.split()]
    # allow any whitespace / non-breaking space between name parts, and possessives
    return re.compile(r"(?<![\w-])" + r"[\s ]+".join(parts) + r"(?:'s|’s)?(?![\w-])", re.I)


def match_people(it: dict, people: list[dict], regexes: dict) -> list[str]:
    hay = f'{it["title"]} {it["summary"]} {it.get("_body", "")}'
    return [p["name"] for p in people if any(regexes[a].search(hay) for a in p["aliases"])]


def google_news_url(name: str) -> str:
    q = f'"{name}" (site:deadline.com OR site:variety.com OR site:hollywoodreporter.com)'
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": q + " when:30d", "hl": "en-US", "gl": "US", "ceid": "US:en"}
    )


# --------------------------------------------------------------------------
def main() -> int:
    now = datetime.now(timezone.utc)
    people = load_people()
    regexes = {a: name_regex(a) for p in people for a in p["aliases"]}
    print(f"{len(people)} people on the list")

    old = {"items": [], "search_cursor": 0, "alerted": []}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, encoding="utf-8") as f:
                old.update(json.load(f))
        except Exception:  # noqa: BLE001
            pass
    items = {i["id"]: i for i in old["items"]}
    alerted = set(old.get("alerted", []))

    fresh: list[dict] = []
    feed_status = {}
    for source, url in FEEDS:
        raw = fetch(url)
        got = parse_feed(raw, source) if raw else []
        feed_status[url] = len(got)
        print(f"  {source:9} {len(got):3} items  {url}")
        fresh += got

    # Per-person search (catches stories where the name is only in the body,
    # and anything the main feeds rolled past). Rotates through the list.
    cursor = int(old.get("search_cursor", 0))
    batch = people[cursor:cursor + SEARCH_BATCH] if people else []
    if len(people) > SEARCH_BATCH and len(batch) < SEARCH_BATCH:
        batch += people[: SEARCH_BATCH - len(batch)]
    for p in batch:
        raw = fetch(google_news_url(p["name"]))
        got = parse_feed(raw, "Google News") if raw else []
        got = [g for g in got if g["source"] in SITES.values()]
        for g in got:
            g["_searched_for"] = p["name"]
        fresh += got
        time.sleep(1)
    new_cursor = (cursor + SEARCH_BATCH) % len(people) if people else 0

    new_alerts = []
    for it in fresh:
        iid = item_id(it)
        tags, is_biz = classify(it)
        who = match_people(it, people, regexes)
        if it.get("_searched_for") and it["_searched_for"] not in who:
            # Google News matched the full article text; trust it.
            who.append(it["_searched_for"])
        prev = items.get(iid)
        if prev:
            # merge new info into the stored story
            prev["people"] = sorted(set(prev.get("people", [])) | set(who))
            prev["tags"] = sorted(set(prev.get("tags", [])) | set(tags))
            prev["business"] = prev.get("business") or is_biz
            if "news.google.com" in prev["link"] and "news.google.com" not in it["link"]:
                prev["link"] = it["link"]
            continue
        if not is_biz and not who:
            continue
        rec = {
            "id": iid,
            "title": it["title"],
            "link": it["link"],
            "summary": it["summary"],
            "source": it["source"],
            "author": it["author"],
            "published": it["published"],
            "found": now.isoformat(),
            "tags": tags,
            "business": is_biz,
            "people": who,
        }
        items[iid] = rec

    for rec in items.values():
        if rec.get("people") and rec["id"] not in alerted:
            new_alerts.append(rec)
            alerted.add(rec["id"])

    # prune
    def keep(rec):
        age = now - datetime.fromisoformat(rec["published"])
        return age <= timedelta(days=PEOPLE_KEEP_DAYS if rec.get("people") else KEEP_DAYS)

    kept = sorted((r for r in items.values() if keep(r)), key=lambda r: r["published"], reverse=True)
    kept_ids = {r["id"] for r in kept}
    data = {
        "updated": now.isoformat(),
        # With a private list, publish only how many people are watched, not who.
        "people": ([{"name": "", "note": ""}] * len(people)) if os.environ.get("PEOPLE_LIST", "").strip()
                  else [{"name": p["name"], "note": p["note"]} for p in people],
        "feeds": feed_status,
        "search_cursor": new_cursor,
        "alerted": sorted(a for a in alerted if a in kept_ids),
        "items": kept,
    }
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # Hand new people-matches to the workflow so it can notify you.
    first_run = not old["items"]
    alerts_path = os.environ.get("ALERTS_OUT")
    if alerts_path:
        with open(alerts_path, "w", encoding="utf-8") as f:
            json.dump([] if first_run else new_alerts, f, ensure_ascii=False, indent=1)

    print(f"{len(kept)} stories kept, {sum(1 for r in kept if r['people'])} mention your people, "
          f"{len(new_alerts)} new people-matches{' (first run: no alerts sent)' if first_run else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
