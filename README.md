# Gibbs TD Chase

He scores. You get a text.

A vanilla JS fan tracker for Jahmyr Gibbs' **2026 regular-season** chase of LaDainian Tomlinson's 31-touchdown record (2006, 16 games). ESPN supplies live data; no API key or frontend build step is required. A small Worker API proxies ESPN to avoid browser CORS restrictions.

The page shows total, rushing, receiving and other TDs; career TDs; a 17-game projection; TDs needed to tie and break the record; the game log; cumulative pace chart; and the NFL scored-touchdown leaderboard. Passing touchdowns and postseason games do not count.

## Run locally

```sh
npm run dev
```

Open http://localhost:8080. Serve over HTTP rather than opening `index.html` directly because the app uses JavaScript modules and same-origin API routes. The local server includes the ESPN proxy.

## Data integration

`nfl-data.mjs` contains pure parsers and record calculations. `app.js` fetches the Gibbs stats API; the API fetches ESPN over HTTPS, normalizes `$ref` URLs, retains `lang=en&region=us` on core requests, and refreshes every five minutes while visible. Network requests have a 15-second timeout and boxscore/name lookups use at most four simultaneous requests.

- Season: `sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/athletes/4429795/statistics`
- Career: `sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/4429795/statistics/0`
- Schedule: `site.api.espn.com/apis/site/v2/sports/football/nfl/teams/8/schedule?season=2026&seasontype=2`
- Boxscore: `site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=EVENT_ID`
- Leaders: `sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/leaders`

The scoring category's total is authoritative. Career payloads repeat zero totals in other categories, so the parser prioritizes scoring. Rushing + receiving + returns is checked against the total; discrepancies are shown. Missing totals are errors, not zero. Completed boxscores are cached in memory for one hour to reduce traffic while allowing scoring corrections; names for one day. Live games are fetched on every refresh. Missing games remain visible and suppress the cumulative chart until complete.

The projection uses Gibbs' appearances, while the chart uses completed Lions games. Bye weeks create no game entries. Live totals may lead the completed-game chart. The season is deliberately fixed to 2026 and rejects ESPN silently returning another season.

## Checks

Use Node 22.13+ (tests use `node:sqlite`):

```sh
npm ci --prefix notifications
npm test
npm --prefix notifications run check
```

Parser and SMS tests use reduced fixtures captured from ESPN on October 12, 2026, including the October 11 Arizona boxscore and touchdown plays. Provider calls are mocked; tests send no SMS.

## Hosting and SMS status

The site domain is configured as **gibbstouchdowns.com** in CNAME, canonical URLs, and sitemap. Hosting has not been deployed. Analytics awaits a separate Gibbs property. `data-config.js` connects to the deployed stats Worker at `https://gibbs-td-alerts.sashacbates.workers.dev`. The static site can use that origin directly; no same-origin API route is required. `alerts-config.js` has empty signup Worker, phone, and Turnstile values. The signup form explains that signup is closed and collects nothing. Do not connect this project to Corbin's existing Worker or subscriber database.

The public API routes are `GET /api/nfl/season`, `/career`, `/leaders`, `/schedule`, `/summary?event=EVENT_ID`, and `/athlete?id=ATHLETE_ID` (all under `/api/nfl`). Responses allow browser access, cache for 60 seconds, and return 502 on upstream failure. They work without D1 or Twilio; arbitrary URL proxying and write requests are rejected.

See [notifications/README.md](notifications/README.md) for the Gibbs Worker setup. The stats Worker is deployed. Static-site hosting and live SMS have not been verified.

Stats and player headshot: ESPN. Gibbs TD Chase is an independent fan project and is not affiliated with the NFL, the Detroit Lions, or Jahmyr Gibbs.
