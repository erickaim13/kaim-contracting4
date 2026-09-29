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
| Frontend | Flat static HTML at repo root, one file per page. Page styles inline; the shared header, mobile menu, sticky phone bar, footer and design tokens live in `css/site.css` + `js/site.js`, loaded last on every page. |
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
- **Nav and footer markup is identical on every page** (generated once, pasted
  everywhere). Change it on one page and copy the `<nav class="site-nav">` and
  `<footer class="site-footer">` blocks to all the others, or the site drifts.
  Styling for both is in `css/site.css`, not in the pages.
- **Two font families only: Oswald and Source Sans 3.** DM Serif Display was
  dropped in the 2026-09 redesign. Fallback stacks are spelled out in the CSS.
- **The quote form is the classic single screen** (`js/kc-form.js` v2, the
  pre-redesign file restored 2026-09-29). Field names, the honeypot and the
  POST payload have not changed since v2, so `api/lead.js` never needs to.
  Bump the `?v=` on the script tag when you edit it.

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

- **2026-09-18** — Front-end redesign (branch `claude/zen-cerf-f4a595`). Shared
  header, slide-in mobile menu, sticky bottom Call / Get Free Estimate bar and
  footer now come from `css/site.css` + `js/site.js` on all 26 pages; the old
  fixed floating nav and the top gold call bar (which covered page content on
  phones) are gone. Fonts cut to Oswald + Source Sans 3. Muted text lightened
  for AA contrast, gold is the only accent, gold section bars removed. Homepage
  got a what-and-where subline, a photo services grid with price anchors, a
  service-area line and three before/after pairs. Quote form is two steps with
  labels and inline errors, same payload (verified with a stubbed fetch).
  Nav label "Tools" became "Calculators", every CTA reads "Get Free
  Estimate". Before/after screenshots in `docs/redesign-2026-09/`.

- **2026-09-19** — Eric's pass on the 09-18 redesign. (1) Header is a floating
  pill again (`css/site.css` `nav.site-nav`): 12px inset, rounded, translucent
  at rest, widens to a flush bar on scroll via the existing sentinel observer;
  full-width on phones. (2) Homepage How It Works: the redesign's override that
  stripped the step cards (loose text under a floating rail) is removed, the
  09-02 cards are back. (3) `/pressure-washing` "What Do You Need Cleaned":
  the featured-card + tiny-thumbnail grid is replaced by the homepage's
  `.kc-svc` photo tiles (House Washing 8 wide, six more, bundle band). (4) Sand
  & Seal calculator is one card with every choice visible and a live estimate,
  same feel as the pressure washing calculator; the 5-step wizard, its CSS and
  the expired September 15 offer block are gone. Pricing math unchanged.
  Still open: the "10% off by September 15, 2026" offer copy is live on 13 other
  pages (paver-sealing, every washing page, index seasonal line); Eric decides.

- **2026-09-28** — Eric: "ever since the refresh it has 2 separate bars at the
  top, just keep the old one I had before." The 09-19 pill was `position:sticky`
  (in the page flow), so every page opened with a navy band across the top and
  the pill sitting on it, and each page's leftover hero padding (`hero-content`
  130/78px, `svc-hero-content` 120/96px) stacked more space under that. The
  header is now `position:fixed` like the pre-redesign nav: hero photos run up
  behind the pill again, the existing inline hero padding is what clears it,
  and only `quote.html` (no photo hero) gets a clearance rule in `site.css`.
  Rendered every page type at 1280 and 393 wide (headless Chrome over CDP with
  real wheel scrolling) to confirm nothing sits under the nav.

- **2026-09-28 (later)** — Eric compared the old site (git worktree of 8a7b278
  served locally) with the current one. (1) Homepage "What We Do" is two doors
  again, Pressure Washing and Paver Sealing, as `.kc-svc-grid.two` photo tiles
  in the redesign style; the seven washing sub-services live only on the
  /pressure-washing hub now. (2) `js/kc-form.js` is v4: one screen again
  (older customers, no Continue hurdle), labels and inline errors kept, job
  fields above a "How do I reach you?" block, payload unchanged. `?v=10` on
  index, quote and the sand & seal calculator. (3) Header stays the fixed
  floating pill from the morning commits.

- **2026-09-29** — Eric: "u changed the form fills yesterday, turn them back to
  how i had them a week ago before the ui and ux changes." `js/kc-form.js` is
  the exact pre-redesign v2 file again (`git show e3acdbb:js/kc-form.js`):
  one screen, placeholders instead of labels, no inline error text; the v3
  two-step and v4 labeled versions are gone. `?v=11` on index, quote and the
  sand & seal calculator, and the old button labels are back ("Get My Free
  Estimate" on /quote, "Send Me My Quote" on the calculator). Homepage
  What We Do doors are circles now: 340px photo in a gold ring (260px on
  phones) with the title and blurb under it, `.kc-svc-grid.two` in
  `css/site.css`. Paver Sealing door uses Eric's front walkway job photo,
  new square crop `images/ps-front-after-800.webp` (from ps-front-after.webp,
  which /paver-sealing already uses).

- **2026-09-29 (branch `claude/pro-refresh`, NOT on main)** — Eric: "benjaminspowerwashing.com
  is my biggest comp, make my website look more professional like his, do it
  not on the main site." Studied his homepage headless at 1280 and 393 wide:
  solid navy header with a red CTA, alternating white and navy blocks with
  wave edges, ringed circle photos (some split before/after), big uppercase
  headlines, checklist card, numbered cards, navy FAQ accordions, three
  column footer. Rebuilt `index.html` on the branch in that structure with
  Eric's navy and gold: split hero (headline + v2 form), four ringed doors
  overlapping the hero, about panel + checklist, navy services band with 8
  circles (real before/after splits where we have pairs), why-us with gold
  offset photo, the wash-it-yourself demo, real results pairs, three step
  cards, FAQ, town map, referral band, photo CTA band. Carried the map, demo,
  seasonal and FAQ scripts verbatim from the old page (builder script in the
  session scratchpad, old page saved there as index.old.html). `css/site.css`
  on the branch: header is a solid full-width navy bar with a gold rule
  (`--nav-h` 80, logo 60px), footer headings gold, page-hero pages get
  `--nav-h` clearance. Service pages keep their existing layout under the new
  header. No real review numbers or badges were invented (we have none yet).
  If Eric likes it: merge to main, then carry the treatment to
  /pressure-washing and /paver-sealing.

