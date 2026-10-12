# Gibbs touchdown texts

A separate Cloudflare Worker handles website consent, Twilio webhooks, D1 subscriptions, ESPN polling, and delivery. The frontend remains a static site. **The Gibbs Worker is deployed at `https://gibbs-td-alerts.sashacbates.workers.dev`; the frontend stats connection is configured in `data-config.js`.** Signup and delivery are disabled; the site domain is gibbstouchdowns.com; the SMS webhook URL, phone, Turnstile widget, and database remain unconfigured.

## Data and alert detection

The scheduled poll runs every two minutes when `ALERTS_ENABLED=true`, checks the 2026 Lions regular-season schedule, and fetches summaries for live/final games with kickoff in the past 24 hours. It joins `scoringPlays` to drive plays by play ID: scoring plays confirm the scoring team and touchdown type, drive plays provide the actual wallclock occurrence time. It matches Gibbs as scorer (ESPN uses `J.Gibbs` or `Jahmyr Gibbs`), excluding him as passer and nullified plays. ESPN does not include an athlete ID in these summary scoring plays; name parsing may need adjustment if ESPN changes its play descriptions. Plays with missing timestamps are skipped rather than assigned a synthetic time.

Two touchdowns in one game have separate IDs (`game:play`). Duplicate polls cannot repeat a delivery. Plays before activation, before a subscriber confirmed, older than six hours, from other seasons, or from playoffs are excluded. No historical backlog is sent. Scoring corrections cannot retract a delivered text. Provider and data delays can miss or delay alerts.

The existing consent and outbox protections remain: website-only affirmative consent, US numbers, Turnstile verification, confirmation via YES within 15 minutes, signed Twilio webhooks, STOP cancellation, START/UNSTOP never silently reenrolling, atomic delivery claims, ambiguous submissions not retried, capacity/budget limits, and retention cleanup while paused. The monthly cap applies to attempted recipient alerts, not confirmations or provider replies. Up to 10 recipients are dispatched per poll.

## Public stats API

The active entry point is `src/worker.js`; the supplied top-level Worker, detector, and message files re-export the consolidated, tested source modules. The original boxscore-diff approach was replaced because detection timestamps can send stale scores to newly confirmed subscribers. Migration `0004_td_state.sql` supplies its requested baseline table (`game_key`, `td_total`, `updated_at`) for future use; the active play-based detector uses the existing events/outbox tables instead.

`GET /api/nfl/season`, `/api/nfl/career`, `/api/nfl/leaders`, `/api/nfl/schedule`, `/api/nfl/summary?event=...`, and `/api/nfl/athlete?id=...` proxy only predefined ESPN resources. Public responses allow cross-origin browser reads and cache for 60 seconds. Errors return 502 and are not cached. These routes need no credentials or database. A stats-only Worker can be deployed with the current config and alerts disabled; set the returned origin in `../data-config.js` or route `/api/nfl/*` on gibbstouchdowns.com to the Worker. Deploying the static site without this API leaves stats unavailable.

## Configure a new Gibbs service

1. `SITE_ORIGIN` is configured as `https://gibbstouchdowns.com`, matching the CNAME, canonical URLs, and sitemap. Hosting has not been deployed.
2. Create a **separate Gibbs D1 database** and Worker; do not reuse Corbin's subscribers or deployment settings.
3. Configure a Twilio sender and Messaging Service for the Gibbs program. Set `TWILIO_PHONE_NUMBER` and `SUPPORT_EMAIL` consistently in Worker vars, frontend config, and provider configuration.
4. Create a Turnstile widget for the Gibbs domain; put its site key in `../alerts-config.js` and its secret in Worker secrets.

```sh
npm ci
npx wrangler login
npx wrangler d1 create gibbs-td-alerts
```

Add `d1_databases` to `wrangler.jsonc` with binding `DB`, database name `gibbs-td-alerts`, the returned `database_id`, and `migrations_dir: "migrations"`. The checked-in configuration deliberately has no database binding, so stats-only deployment is possible. Then apply all migrations to the new database:

```sh
npx wrangler d1 migrations apply gibbs-td-alerts --remote
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_MESSAGING_SERVICE_SID
npx wrangler secret put TURNSTILE_SECRET_KEY
npm run deploy
```

Set `PUBLIC_URL` to the deployed Worker origin without a trailing slash. Set Twilio incoming messages to POST to `/sms`. Outbound requests supply per-message `/status?id=...` callbacks; preserve the query string for signature verification. Keep credentials in Worker secrets, never in public JS.

Configure Advanced Opt-Out with START/UNSTOP for carrier unblocking and standard STOP keywords. Remove YES from provider-handled keywords; YES belongs to this app's confirmation flow. Forward opt-out webhooks to the Worker. HELP must use the Gibbs support contact. START unblocks messages but does not enroll anyone.

## Enable and verify signup

Fill `../alerts-config.js` with the Gibbs Worker URL, phone and public Turnstile key. Set `SIGNUPS_ENABLED=true`. `SIGNUP_MODE=waitlist` stores consent without sending or enrolling. `SIGNUP_MODE=sms` sends the confirmation text and requires Twilio configuration. Update homepage copy to describe the chosen mode before enabling signup. Saved waitlist entries need a separate, deliberate confirmation step; switching modes never enrolls or sends to them automatically.

Keep `ALERTS_ENABLED=false` while testing with a consenting phone:

- Leave consent unchecked: no request or number is submitted.
- Submit with consent and Turnstile: receive a confirmation in SMS mode, reply YES, verify active enrollment.
- Reply HELP, then STOP: verify opt-out and cancellation of pending deliveries.
- Reply START and YES after stopping: verify neither silently reenrolls.
- Verify signed status callbacks and a clearly identified test message with the provider.

When ready, set `ALERTS_START_AT` to the current UTC timestamp, then `ALERTS_ENABLED=true`. Real carrier delivery and a live Cron Trigger must be verified independently; mocked tests do not establish either.

## Local checks

```sh
npm test
npm run check
npx wrangler d1 migrations apply gibbs-td-alerts --local
npm run dev
```

Node 22.13+ is required. Tests use SQLite with the real schema and a reduced ESPN fixture from October 11, 2026. No test sends real texts. Local secrets belong in `.dev.vars`, which is ignored by Git.

To pause delivery, set `ALERTS_ENABLED=false`; to pause signup, set `SIGNUPS_ENABLED=false`. Incoming STOP handling and retention cleanup continue. Pending alerts expire after six hours. Inspect uncertain/stale delivery rows against Twilio logs before deciding on a manual retry.
