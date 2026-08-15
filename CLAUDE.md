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
| Backend | One serverless function: `api/lead.js` |
| Database | Supabase — project `dfquwxmoidhhcwezgnry` |
| Email | nodemailer over Gmail SMTP as info@kaimcontracting.com |
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
  Something outside this repo drains the queue and actually sends.
- **`message_templates`** — keyed autoreply copy (`lead_biz_hours`,
  `lead_after_hours`). Code falls back to hardcoded strings if the lookup fails.

## Lead flow (api/lead.js)

1. Origin/referer check against an allowlist, then honeypot check
2. Sanitize + validate all fields
3. Read `crm_data`, unshift the new client, write it back
4. Queue owner notification iMessage (immediate)
5. Queue client autoreply iMessage, delayed a random 2–5 min so it reads human
6. Send branded confirmation email to the client

Business hours = 7:00–20:00 America/New_York. Picks which autoreply template runs.

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

## Copy and naming conventions

These come from actual past commits — do not undo them.

- **No dashes in body copy.** They were stripped site-wide on purpose.
- **"Calculator", never "Estimator" or "Tool".** Consistent across Paver, Mulch
  and Pressure Wash. "Tools" as a word made Google's ad classifier read the page
  as equipment rental.
- **"Merrimack Valley", never "Greater Boston."** Changed site-wide before ads launched.
- **Owner voice in about//marketing copy** — first person, plain, not agency-speak.
- **Every lead form gets a Call/Text button pair** next to it.
- Calculators are soft-gated behind an inline lead-capture form.
- Every page carries the GA4 + Google Ads tags, 404 included.

## Working agreements

- The device shell has **no network access** — git commit works locally, but
  `push`/`pull`/`fetch` fail with a 403 from the proxy. Eric pushes manually.
- No Supabase or Vercel connector is attached yet, so dashboards, deploy logs
  and live DB queries are not reachable from a session. Code-level work is fine.

## Log

Append notable decisions here so the next session inherits them.

- **2026-08-15** — Created this file. Repo previously had zero context docs;
  every session started blind and re-derived the stack from scratch.
