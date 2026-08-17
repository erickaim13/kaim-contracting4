# Kaim Contracting — project context

Context file for AI sessions. Read this first. Update it when something here goes stale.

## The business

Kaim Contracting LLC — family-run paver, hardscaping, landscaping, drainage and
pressure washing contractor. Based in Methuen, MA. Owner: Eric Kaim.

- Site: https://kaimcontracting.com
- Phone: (978) 351-2195 · info@kaimcontracting.com
- Service area: Merrimack Valley + Southern NH (Methuen, Andover, N. Andover,
  Lawrence, Haverhill, Lowell, Salem NH). Hudson NH and Auburn NH were
  deliberately dropped — too far out.

## Stack

Deliberately plain. No framework, no build step, no bundler.

| Layer | What |
|---|---|
| Frontend | Flat static HTML at repo root, one file per page. Inline CSS/JS. |
| Hosting | Vercel. `cleanUrls: true`, `/index.html` → `/` permanent redirect. |
| Backend | Two serverless functions: `api/lead.js`, `api/queue-health.js` |
| Database | Supabase — project `dfquwxmoidhhcwezgnry` |
| Email | nodemailer over Gmail SMTP as info@kaimcontracting.com |
| Texting | Eric's CRM app on an old MacBook at his house, running 24/7 |
| Analytics | GA4 `G-8HBEMX0PPR` + Google Ads `AW-18069179134` |

Only two dependencies: `@supabase/supabase-js` and `nodemailer`.

### Env vars (set in Vercel, never in the repo)

- `SUPABASE_SERVICE_ROLE_KEY`
- `GMAIL_APP_PASSWORD`

## Supabase tables

- **`crm_data`** — the whole CRM lives in a single JSONB blob at `id = 1`.
  Shape: `{ clients, estimates, invoices, messages, activity, settings, jobs,
  _nc, _ne, _ni }`. The `_nc`/`_ne`/`_ni` keys are next-ID counters.
  Read-modify-write on every lead. Not normalized, and that is intentional.
- **`imessage_queue`** — outgoing iMessages. Columns include `phone`, `body`,
  `direction`, `status`, `client_name`, `trigger_type`, `send_after`.
  The old MacBook drains the queue and actually sends.
- **`message_templates`** — keyed autoreply copy. The live shared path
  (`_lib/intake.js`) uses key `lead_autoreply`; code falls back to a hardcoded
  string if the lookup fails.

## Lead flow (api/lead.js + api/meta-lead-webhook.js -> _lib/intake.js)

Both the website form (`api/lead.js`) and the Meta Lead Ads webhook
(`api/meta-lead-webhook.js`) handle their own HTTP concerns (CORS/origin
allowlist, honeypot, validation), then hand off to the ONE shared automation
`intakeLead()` in `api/_lib/intake.js`. There is exactly one lead-handling path
— change it there, never in two places.

`intakeLead()` does:
1. Read `crm_data`, unshift the new client, write it back — as a
   compare-and-swap loop keyed on `updated_at`, retried up to 4 times, so two
   simultaneous leads (or a lead landing while the Mac writes a reply) can no
   longer overwrite each other.
2. Queue owner-notification iMessage (immediate).
3. Queue client autoreply iMessage a few seconds later, gated by the
   `settings.aiScheduler` master switch. Template key `lead_autoreply`.
4. Send the branded confirmation email to the client (awaited).

## Queue watchdog (api/queue-health.js)

Checks `imessage_queue` for pending texts more than 25 minutes past their send
time. Anything stuck almost always means the old MacBook stopped sending. When
it finds stuck rows it emails erickaim13@gmail.com (cc info@) telling Eric to
check the machine, and keeps emailing on every check until the queue drains.

Triggered two ways: a daily Vercel cron at 11:00 UTC (see `vercel.json`), and
an hourly scheduled Claude task that fetches the URL and pushes a phone
notification if the response reports stuck messages. The endpoint is GET-only,
public, and safe to hit manually: https://kaimcontracting.com/api/queue-health

## Gotchas that have bitten before

- **`SERVICE_OPTS` is a server-side whitelist.** Adding a service to a dropdown
  in the HTML without adding the exact same string to `SERVICE_OPTS` in
  `api/lead.js` makes the form return 400. Change both together.
- **The confirmation email must stay `await`ed.** Vercel freezes the function
  the moment the handler returns, and SMTP takes 1–2s. Fire-and-forget means the
  email silently never sends. The iMessage inserts are intentionally not awaited.
- **CORS is locked to the live domains.** Testing a form from localhost or a
  preview URL gets a 403. That is the allowlist working, not a bug.
- **Vercel's CDN holds stale HTML.** Fix is the `<!-- deploy-bust:TIMESTAMP -->`
  comment on line 2 of the page — bump it to force a real rebuild.
- **Honeypot field is `kc_hpot_xyz`.** Deliberately obscure so autofill skips it.
  If filled, the API returns a fake 200 so bots do not probe further.
- **The CRM write is a compare-and-swap.** `lead.js` only applies its UPDATE if
  `updated_at` still matches what it read, retrying on conflict. Any new code
  that writes `crm_data` must do the same, and must always bump `updated_at` —
  a writer that leaves it unchanged silently defeats everyone else's check.

## Copy and naming conventions

These come from actual past commits — do not undo them.

- **No dashes in body copy.** They were stripped site-wide on purpose.
- **"Calculator", never "Estimator" or "Tool".** Consistent across Paver, Mulch
  and Pressure Wash. "Tools" as a word made Google's ad classifier read the page
  as equipment rental.
- **"Merrimack Valley", never "Greater Boston."** Changed site-wide before ads launched.
- **Owner voice in about/marketing copy** — first person, plain, not agency-speak.
- **Every lead form gets a Call/Text button pair** next to it.
- Calculators are soft-gated behind an inline lead-capture form.
- Every page carries the GA4 + Google Ads tags, 404 included.

## Working agreements

- The device shell has **no network access** when the session runs in the
  cloud — git commit works locally, but `push`/`pull`/`fetch` fail with a 403
  from the proxy. Eric pushes manually. Running the task on his computer
  removes this limit.
- No Supabase or Vercel connector is attached yet, so dashboards, deploy logs
  and live DB queries are not reachable from a session. Code-level work is fine.
- Eric also has the `kaim-brain` plugin installed (master brain + website,
  leads, ads, quotes helpers). This file is the per-repo layer under it.

## Log

Append notable decisions here so the next session inherits them.

- **2026-08-15** — Created this file. Repo previously had zero context docs;
  every session started blind and re-derived the stack from scratch.
- **2026-08-15** — Added `api/queue-health.js`, the dead-MacBook watchdog:
  emails Eric when texts sit stuck in `imessage_queue`. Wired a daily Vercel
  cron in `vercel.json`.
- **2026-08-17** — Put the simultaneous-leads overwrite fix in the RIGHT place:
  the compare-and-swap on `updated_at` (up to 4 retries) now lives in the shared
  `api/_lib/intake.js`, so it protects BOTH website and Meta leads at once. An
  earlier draft had rewritten `api/lead.js` from a stale copy, which would have
  dropped `Paver Sealing` from `SERVICE_OPTS`, lost calculator notes, and killed
  Google Ads attribution — that rewrite was discarded in favor of fixing
  `intake.js` on top of the current code. Verified the retry path with a
  simulated collision (saves exactly one lead, no duplicate).
