# Build Brief: Gibbs TD Chase Tracker
### A Clipboard Stats single-stat site — clone of Corbin's Triples for the NFL

Paste this whole doc into your IDE chat as context. It has everything needed to clone the Corbin's Triples foundation and rewire it for Jahmyr Gibbs' touchdown record chase.

---

## 1. The concept

**Site idea:** A single-stat fan tracker for Detroit Lions RB **Jahmyr Gibbs**' chase of LaDainian Tomlinson's single-season touchdown record (31 TDs, set in 2006).

**Why now:** As of Week 5 of the 2026 NFL season (Oct 12, 2026), Gibbs has **9 TDs** — on pace for 31 across the 17-game season. He told reporters on Oct 11 he's "for sure" chasing the record. He also just passed Barry Sanders for most TDs before age 25 in NFL history (58 career). The storyline is live.

**The formula (same as Corbin's Triples):** One player. One exciting stat. Big hero number. Game-by-game log. League leaderboard. Optional SMS alerts. Free site, monetized via donations/ads.

**Suggested tagline direction:** "He scores. You get a text." (mirrors Corbin's "He triples. You get a text.")

**Disclaimer (mirror the Corbin's one):** "Gibbs TD Chase is an independent fan project and is not affiliated with the NFL, the Detroit Lions, or Jahmyr Gibbs."

---

## 2. Foundation: Corbin's Triples repo

**Repo:** `sshb4/CorbinsTriples` (clone this as the starting point)
**Live site:** corbinstriples.com
**Stack:** Vanilla JS single-page app. No framework. No build step. Static hosting.

### File structure
```
index.html          # Page structure, all element IDs the JS hooks into
app.js              # All data fetching, parsing, rendering (~900+ lines)
styles.css          # All styling
alerts.js           # SMS signup frontend logic
alerts-config.js    # Public alert config (Twilio number, API URL, Turnstile key)
analytics.js        # Analytics
notifications/      # Cloudflare Worker backend for SMS alerts (wrangler.jsonc)
sms-privacy.html    # SMS privacy notice page
sms-terms.html      # SMS terms page
```

### How data flows in app.js
1. Constants at top: `MLB_BASE`, `PERSON_ID` (682998 = Corbin Carroll), `AUTO_REFRESH_MS` (5 min)
2. `els` object maps DOM element IDs to variables
3. `fetchJson()` — fetch wrapper with 15s timeout, no-store cache
4. Data fetch functions hit MLB endpoints, parse JSON, render into DOM
5. Auto-refresh timer re-fetches every 5 minutes
6. Kinetic number animation for the hero stat display

### MLB API endpoints used (to be replaced)
| Purpose | MLB endpoint |
|---|---|
| Player profile | `GET {MLB_BASE}/people/{PERSON_ID}` |
| Season stats | `GET {MLB_BASE}/people/{PERSON_ID}/stats?stats=season&group=hitting&season={season}` |
| Career stats | `GET {MLB_BASE}/people/{PERSON_ID}/stats?stats=career&group=hitting` |
| Year-by-year | `GET {MLB_BASE}/people/{PERSON_ID}/stats?stats=yearByYear&group=hitting` |
| Game log | `GET {MLB_BASE}/people/{PERSON_ID}/stats?stats=gameLog&group=hitting` |
| Season leaderboard | `GET {MLB_BASE}/stats?stats=season&group=hitting&season={season}` |
| Career leaderboard | `GET {MLB_BASE}/stats?stats=career&group=hitting` |

MLB API base: `https://statsapi.mlb.com/api/v1` — keyless, no auth.

### Key stat extraction (MLB version)
- Triples come from a flat `stats` object: `splits[].stat.triples`
- Leaderboard: sort all qualified players by triples desc
- Game log: array of per-game entries with date, opponent, triples

---

## 3. New data layer: ESPN NFL API

**No API key needed.** Same as MLB — all endpoints below are public. Verified live Oct 12, 2026.

**Gibbs' ESPN athlete ID:** `4429795`
**Lions team ID:** `8`
**2026 season, regular season type:** `seasons/2026/types/2`

### Endpoints

**Player profile + team:**
```
GET http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/4429795?lang=en&region=us
```
Returns: `fullName`, `displayName`, `jersey`, `position`, `headshot` (image URL!), `team` ($ref), `age`, `college`, etc.
Note: `team` is a `$ref` link, not inline. Follow it or hardcode "Detroit Lions."

**2026 season stats (the big number):**
```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/athletes/4429795/statistics?lang=en&region=us
```
Response shape: `splits.categories[]` → each category has `stats[]` with `name`, `displayName`, `displayValue`, `value`.

**TD extraction — IMPORTANT:** Touchdowns are split across categories. You must sum them:
- Category `rush` → stat `Rushing Touchdowns` (currently 7)
- Category `rec` → stat `Receiving Touchdowns` (currently 2)
- Category `s` (summary) → stat `Total Touchdowns` (currently 9) ← **use this one for the hero number**

The summary category already does the math. But verify it equals rush + rec as a sanity check.

**Career totals:**
```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/4429795/statistics/0?lang=en&region=us
```
Same shape. Summary `Total Touchdowns` = 58 (career through Oct 11, 2026).

**Game-by-game log — NO single endpoint.** ESPN has no NFL gamelog API. Instead:
1. Get Lions schedule: `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/8/schedule?season=2026` → `events[]` with `id`, `shortName`, `date`
2. For each completed game, fetch boxscore: `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={eventId}`
3. In boxscore: `boxscore.players[]` → find team `DET` → `statistics[]` → categories `rushing` and `receiving` → find athlete "Jahmyr Gibbs" → `labels` + `stats` arrays (zip them; `TD` is one of the labels)

Verified Oct 12, 2026 with event `401872991` (DET @ ARI, Oct 11): rushing `{CAR: 25, YDS: 151, TD: 2}`, receiving `{REC: 5, YDS: 56, TD: 0}`. Total: 2 TDs that game. ✓

**2026 season TD leaderboard:**
```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/leaders?lang=en&region=us
```
Returns `categories[]` with `leaders[]` (each has `displayValue`, `value`, `athlete.$ref`). Find the total-touchdowns category. Athlete refs need follow-up fetches for names, or cross-reference IDs.

### Lions 2026 game IDs (first 5, for the game log)
```
401872923  NO @ DET   2026-09-13
401872932  DET @ BUF  2026-09-18
401872954  NYJ @ DET  2026-09-27
401872978  DET @ CAR  2026-10-05
401872991  DET @ ARI  2026-10-11
```
(Get the rest from the schedule endpoint — don't hardcode beyond what's verified.)

---

## 4. MLB → ESPN mapping

| Corbin's Triples (MLB) | Gibbs tracker (ESPN) | Notes |
|---|---|---|
| `MLB_BASE` = statsapi.mlb.com | `ESPN_CORE` = sports.core.api.espn.com, `ESPN_SITE` = site.api.espn.com | Two base URLs now |
| `PERSON_ID` = 682998 | `ATHLETE_ID` = 4429795 | |
| `stats=season&group=hitting` | `seasons/2026/types/2/athletes/{id}/statistics` | Parse `splits.categories` |
| `stat.triples` (flat) | Sum `Rushing Touchdowns` + `Receiving Touchdowns`, or use summary `Total Touchdowns` | TDs are split by phase |
| `stats=gameLog` (1 call) | N boxscore calls via schedule → summary | More requests, same result |
| `stats?stats=season` leaderboard | `seasons/2026/types/2/leaders` | Nested $refs |
| `stats=career` | `athletes/{id}/statistics/0` | Same shape as season |

---

## 5. What to change vs. keep

### Keep (foundation)
- Overall page structure and component pattern (hero number → game log → leaderboard → SMS signup)
- `fetchJson()` wrapper, auto-refresh timer, error handling
- `alerts.js` / Cloudflare Worker SMS system (just needs new trigger stat + new phone config)
- Analytics, sitemap, robots patterns

### Change
- **All API calls** → ESPN endpoints above
- **Stat parsing** → handle ESPN's nested `$ref` structure and split TD categories
- **Branding/styling** → Lions colors (Honolulu blue `#0076B6`, silver `#B0B7BC`) instead of Diamondbacks Sedona red. New hero image, new favicon.
- **Copy** → touchdowns, not triples. Record chase framing: "9 of 31" with countdown
- **New feature to add:** Pace tracker — at current rate, projected final TD total. And a "magic number" (TDs remaining to tie/break the record). Baseball does this; football fans will get it instantly.
- **Record context bar:** "LaDainian Tomlinson — 31 TDs (2006)" as the target line
- **Game log columns:** Date, Opponent, Rush TD, Rec TD, Total TD (instead of MLB's H/AB/3B columns)
- **Disclaimer:** Swap MLB/Diamondbacks for NFL/Lions/Gibbs

### Don't need
- Year-by-year table is less important for a 4th-year player chasing a single-season record — consider replacing with a "pace vs. record pace" chart
- Career leaderboard matters less here; the story is the single-season record

---

## 6. Gotchas

1. **ESPN `$ref` links:** The core API uses HATEOAS-style `$ref` URLs instead of inline objects. You'll need to follow them or extract IDs from the URLs. The site API (`site.api.espn.com`) returns more inline data — prefer it where possible.
2. **http vs https:** The core API works over both; some `$ref` URLs come back as `http://`. Normalize to `https://`.
3. **`lang=en&region=us` params:** Required on core API calls. Don't drop them.
4. **Bye weeks:** The Lions have a bye — the game log loop must skip weeks with no game, not treat them as 0-TD games.
5. **Postseason:** `types/2` = regular season. The record is a regular-season record. Don't include playoff games (`types/3`) in the chase total.
6. **TD definition:** Use total touchdowns (rushing + receiving). Don't include return TDs unless he gets one — the summary `Total Touchdowns` handles this.
7. **Rate limits:** ESPN's public API has no documented key/rate limit, but keep the 5-min refresh and don't hammer it. The game-log loop (one boxscore per game) only needs to run on refresh, and you can cache completed games.
8. **Season rollover:** Hardcode 2026 for now. The chase is this season only.

---

## 7. Quick reference: the record

- **Record:** 31 total touchdowns, LaDainian Tomlinson, 2006 Chargers (16 games)
- **Gibbs 2026 pace:** 9 TDs through 5 games → on pace for ~31 over 17 games
- **Closest since:** 23 (Randy Moss, 2007); RBs closest: 21 (multiple)
- **Gibbs career:** 58 total TDs (most before age 25 in NFL history, passing Barry Sanders)
- **Gibbs quote (Oct 11, 2026):** "For sure, I'm trying to get that."

---

*Brief prepared Oct 12, 2026. All ESPN endpoints verified live. MLB repo structure from sshb4/CorbinsTriples main branch.*
