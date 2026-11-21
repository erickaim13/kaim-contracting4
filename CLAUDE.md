# Kaim Contracting — project context

Context file for AI sessions. Read this first. Update it when something here goes stale.

## The business

Kaim Contracting LLC — local paver, hardscaping, landscaping, drainage and
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
an hourly `pg_cron` job inside Supabase itself (job `queue-health-hourly`, runs at
:07 past every hour, uses `pg_net` to GET the URL). The Supabase job was added
2026-10-19 so the check does not depend on Claude, Claude usage limits, or the
Vercel plan's once-a-day cron rule. Inspect it with `select * from cron.job;` and
recent fires with `select * from cron.job_run_details order by start_time desc
limit 20;`. The endpoint is GET-only, public, and safe to hit manually:
https://kaimcontracting.com/api/queue-health

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

- **2026-09-29 (later still)** — Eric on the dialed-back version: "no i kinda
  liked the wavy transitions, and i liked how it brightened up the website, i
  liked how it looked originally more." The dial-back commit is reverted; the
  branch is the first pro version again (ringed circles, waves, uppercase
  headlines, navy bands). Take-away: he wants the brighter, more structured
  look; do not strip the visual devices, only polish.

- **2026-09-29 (v4 on the branch)** — Eric: "start from the original, make
  things look more professional sized, better wordage and more bright, and
  change out the different sections on the home page but not the whole
  website." So: `css/site.css` is main's again (floating pill header, same
  footer, no site-wide change). Homepage keeps the live hero (fire pit photo,
  "Make your house the envy of the neighborhood", the estimate card) with a
  wave under it and two ringed circle doors, then the brighter block sections
  from the pro pass: about + checklist, navy services band of 8 circles,
  why-us, wash-it-yourself demo, real results, 3 step cards, FAQ, map,
  referral, and a navy contact band with the v2 form (source "Homepage
  Contact Form" as before). Copy tightened throughout.

- **2026-09-29 (v5 on the branch)** — Eric: "the hero is way too small and
  the pic needs to change, the plain white background is almost too plain,
  add the herringbone pattern but white not navy." Hero is now min-height
  max(680px, 88vh) with a 68px headline and the big house photo
  (`faq-hero.webp`) instead of the fire pit. New `images/herringbone-light.svg`
  (same tile, navy strokes at 10%) sits behind every white section. The doors
  section had 1px top padding added so its negative margin no longer collapses
  over the hero wave.

- **2026-09-29 (v6 on the branch)** — Eric: the herringbone is his PNG
  (`images/herringbone-pattern.png`, same file in Downloads and the stock
  photos folder) and it "needs to go all the way behind the sections top and
  bottom." So the pattern is now the `body` background (white-washed to about
  half strength, 440px tile), every white section is transparent, and the
  navy sections (hero bottom, services band, wash demo, service-area map top)
  are cut with CSS `mask-image` waves instead of separate wave divs, so the
  pattern shows through the curves with no seams. `herringbone-light.svg`
  removed. Masks are inline data-URI SVGs in the page CSS.

- **2026-09-29 (v7 on the branch)** — Eric: "a lot of the pavers dont line up
  in different areas." The 1200px herringbone PNG does not repeat on a whole
  pixel (period 145.5 x 60.75), so it seamed when tiled. New
  `images/herringbone-tile.png` (438x244): the PNG resampled so the period is
  exactly 146x61, then cropped to 3x4 periods, so it tiles with no seam. Body
  uses it at 164px wide (120px on phones). Also per Eric: the three trust
  points under the hero headline are gone, hero copy is pure white with a
  stronger shadow, and body text on the pattern is darker (`--ink2`).

- **2026-09-29 (v8 on the branch)** — Eric's batch: (1) whole page reads a
  size larger (headings, lead copy, buttons, circles, cards all bumped); (2)
  why-us photo is the fire pit patio (`hero-firepit.webp`); (3) Real Jobs is
  three framed job cards (before/after pair on a navy frame, navy caption bar
  with gold title); (4) From First Call is three white cards with gold number
  badges on a dotted gold path and an icon each; (5) a gold wavy line
  (`.gwave` SVG stroke) runs along every wave edge; (6) the topo map
  (`.topo-bg`) sits behind the services band and the wash demo as well as the
  service area map; (7) the referral band is OFF the homepage and now lives on
  `about.html` above the footer, and every page's footer "Refer & Earn $50"
  link points at `/about#referral`; (8) the bottom form is gone, replaced by a
  navy call-to-action band with Get Free Estimate (to /quote) and Call. The
  homepage no longer loads `kc-form.js`.

- **2026-09-29 (v9 on the branch)** — Eric: wave between the map and the
  bottom band (done: map section is masked top and bottom, the bottom band is
  masked on top, gold lines on both, small pattern gap between); one more
  notch of zoom across the page; the 1-2-3 section rebuilt as a navy band
  with big gold numerals and hairline dividers (topo behind it, gold waves
  either side); copy made brand-forward with "Kaim" in most headings and a
  "#1 Pressure Washing Company in the Merrimack Valley" kicker over the hero
  headline (Eric asked for it; it is a puffery-style claim, not a verified
  ranking, and should stay off Google Ads copy where unverifiable
  superlatives get disapproved).

- **2026-09-29 (v10 on the branch)** — Eric's screenshots (which DO arrive
  when he gives the file path on his Desktop): the map heading sat inside the
  top wave (the padding rule targeted the old `.wavy-top` class after the
  section became `.wavy`; fixed) and the bottom joint had two gold lines
  crossing in a thin gap (the gap now lives on the gold line before the CTA
  band, `.serving+.gwave.bot+.gwave.top`, so the line hugs the wave).
  Headings are single color now, no gold word inside a white or navy heading
  ("looks cheesy"). Verified at 1280, 2560 and 3800 wide.
- **2026-09-29 (v11)** — Eric: the pattern strip between the map and the
  bottom band "shouldnt be there." Map section is masked on top only; the
  bottom band overlaps its last 70px with a top wave and one gold line, so the
  two navy sections meet on a single wave.
- **2026-09-29 (v12)** — Hero legibility: darker left-side gradient over the
  photo, a radial dark scrim behind the text block, heavier text shadows,
  sub-line at weight 600.
- **2026-09-29 (v13)** — Hero scrim edge was visible (the radial gradient was
  still ~30% dark where its box ended). Now `closest-side` with a stop at 0
  at 100%, box enlarged, so it fades to nothing before every edge.
- **2026-09-29 (v14)** — Eric wanted a badge row like the competitor's
  (Inc 5000, OSHA, PWNA, HomeAdvisor). Told him those are other people's
  marks and cannot be shown without being a member. Built our OWN seal row
  (`.pro-trust` / `.seal`) under the two doors with only true claims:
  Licensed & Insured MA and NH, Family Owned Methuen, Free Estimates,
  Satisfaction Guaranteed (already on about.html), Fast Reply within the
  hour (site copy). No third-party logos. Real badges he could earn: Google
  reviews (free), Angi/HomeAdvisor screened, BBB, PWNA/UAMCC membership,
  OSHA 10 card.
- **2026-09-29 (v15)** — Seal row removed, Eric: "looks ai." He will earn real
  badges (Google reviews, Angi/HomeAdvisor, OSHA 10, PWNA, BBB) and we add
  those when he has them. Do not add home-made badge rows again.
- **2026-09-29 (v16)** — Header pill is 88px tall with a 60px logo while the
  page is unscrolled (desktop only); it eases back to the 72px flush bar on
  scroll. Rule lives in `css/site.css` under the nav-logo rule.
- **2026-09-29 (v18)** — Nav is now Home / Pressure Washing (dropdown: all
  washing + 7 services + PW calculator) / Paver Sealing (plain link) / About
  Us (dropdown: About, Service Areas, FAQ, Blog, Calculators). Mobile menu
  mirrors it. Replaced on all 26 pages by the scratchpad `nav2.py` (the nav
  block must stay byte-identical across pages).
- **2026-09-29 (v19)** — Heading font is **Montserrat** (500/600/700/800)
  site-wide; Source Sans 3 stays for body. Every page, `css/site.css`,
  `js/kc-form.js` and the homepage builder source updated; Oswald preloads
  removed. Montserrat is wider than Oswald, so display sizes came down a step
  and tracking tightened (rules at the end of `site.css` and in the homepage
  CSS). The homepage builder now copies the shared nav from `about.html` on
  every build so the homepage cannot lag the other pages. Phone check done on
  home, pressure washing, paver sealing, house washing, quote, about,
  calculator: all clean.
- **2026-09-29 (v20)** — Call buttons removed everywhere except quote.html:
  header phone pill, mobile-menu phone, sticky-bar call (bar is now one full
  width Get Free Estimate), hero-card Call buttons, deal-card call links,
  about page call CTA, homepage bottom band call. Footer keeps the phone
  number as contact info; inline "or call 978..." text mentions stay. Script:
  scratchpad `nocall.py`. The expired "10% off by September 15" offer section
  is deleted from paver-sealing.html (the whole `.pw-offers` block, it held
  nothing else). GBP: no connector, Eric checks the Offers/Updates tab himself.

- **2026-09-29 LIVE** — `claude/pro-refresh` merged to main and deployed
  (merge commit + stamp bump `0be2802`). Pool deck before/after
  (`images/ba-pool-*.webp`, from Eric's phone) added to patio-cleaning.html,
  the homepage Patio & Pool Deck circle and a fourth Real Jobs card. Post
  deploy check: all 23 live pages 200 (drainage/landscaping/mulch/pavers/
  paver-calculator 308 to their redirects, as configured), GA4 + Ads + Meta
  pixel on every page, new nav on every page, Montserrat everywhere, every
  nav/footer link 200, kc-form.js v11 + all new images 200, quote form
  renders on phone with 9 fields + honeypot, /api/lead answers 405 GET and
  403 for a foreign origin (allowlist working), queue-health OK. Only
  index/quote/paver-sealing-calculator carry a `deploy-bust` comment; the
  other pages never had one, so a stamp check on them reads empty, not stale.
  Headless mobile emulation reports a 452px layout viewport on
  paver-sealing-calculator even with every section hidden: emulator artifact,
  not real overflow.
- **2026-09-29 (post launch)** — Homepage scroll reveals: `.rv` classes
  (`rv-up`, `rv-left`, `rv-right`, `rv-pop`, `rv-zoom`, delays `rv-d2/3`)
  plus `.rv-stagger` / `.rv-stagger-right` for child lists, driven by an
  inline `kcReveal` script (IntersectionObserver + a scroll sweep that also
  reveals anything the viewport already passed, so anchor jumps and fast
  flicks never leave a section invisible). Hidden state only applies once
  `<html class="rv-on">` is set by JS; reduced-motion users get no motion.
  Nav links now sit beside the Get Free Estimate button on desktop
  (`css/site.css`, last rule).
- **2026-09-29 (REVERTED)** — The interior-page pass above went live for a
  few minutes and Eric pulled it: "the pages all look messed up... looks like
  ai slop." Reverted on main (nav centring kept). The work continues on
  branch `claude/interior-refresh`, to be compared page by page against the
  homepage in a real browser before it goes anywhere near main.
- **2026-09-29 (mobile pass on the live homepage)** — Eric: phone view was
  "wonky". On phones the hero is just the headline and the estimate card
  (kicker + lead hidden), the two service circles sit fully below the hero
  wave (they overlapped it and read as ovals), and the mobile header is
  taller with a bigger logo (`--nav-h` 84, logo 64, hamburger 50).
- **2026-09-29 (mobile pass 2, homepage)** — Eric: on phones show the "#1"
  kicker centred, the hero shows only the Get Free Estimate button (the glass
  card, its title, sub-line and fine print are hidden), and the sticky bottom
  bar is hidden on the homepage only (`body.pro .kc-bar`). Hero text is
  centred on phones.
- **2026-09-29** — Lead auto-text now waits 120s (`LEAD_AUTOREPLY_HOLD_MS` in
  `api/_lib/intake.js`, was 2-6s). Reason: the quote page's booking step comes
  right after the form, and `api/estimate-visit.js` cancels the pending
  auto-reply when the lead books, so a lead who books gets ONE confirmation
  text instead of two texts back to back. Owner notify is still immediate.

## 2026-09-29 to 10-02 (LIVE 2026-10-02): every interior page matches the homepage
- Body class `pro-int` puts the white herringbone behind every page. Sections alternate strictly: `sec-light` (transparent, dark text) and `sec-navy` (navy with the topo map, white text), with a gold `.gwave` line and a `wavy`/`wavy-top`/`wavy-bot` mask at every light-to-navy edge. A navy "Get your free estimate" band (`.pi-cta`) closes pages that would otherwise end light.
- page-body pages (FAQ, blog, calculators, tools, service areas) are split into alternating chunks at their `inc-section`/`proc-section`/calculator boundaries; the nine washing pages carry the why grid, FAQ cards and numeral steps band from the v2 refresh, reordered as hero, free sections, why, package band, FAQ, steps. The old final CTA section is folded into the steps band (`.pi-final-h`), so every washing page ends navy into the footer with one CTA.
- Leftover call wording is gone: the orphan `<span class="cta-or">or</span>` next to the removed Call buttons, "Call or send the form", "call or text", "First Call", "One call to Kaim", the FAQ and service-area phone prompts. Meta descriptions still say "Call 978-351-2195" (not visible).
- Footer on phones: brand block centred, Services and Company in two columns with gold rules, Hours beside Payments, centred bottom row.
- Tooling lives in the scratchpad (`interior3.py`, `interior2.py`, `alt_washing.py`, `reorder_washing.py`, `normalize.py`); `normalize.py` rederives every wave from the section classes and is safe to rerun. Bump the deploy-bust line on merge.
- Final shape (Oct 2): washing pages run hero, light section, then alternate; every washing page has the live "Good Hands" block on navy (centred heading, 3 checks, "Services We Offer" accordion with one `.acc-featured` Most Requested item) and a light FAQ with solid navy cards; the package band folds into the navy steps band (`.pkg-inline`) where it would otherwise sit alone; scroll reveals auto-tagged in `js/site.js` (`body.pro-int` only); bigger logo while the header is expanded; mobile menu groups start closed; `html{overflow-x:hidden}`; no bars under footer headings. Front patio photos (`ps-front-*`) are cleaned and re-sanded, not sealed; say so.


- **2026-10-02 (form)** — Leads were arriving with no town ("18 Pine Street",
  "10 Robandy Rd"): people typed the street and submitted without tapping an
  address suggestion, and the form accepted any non-empty text. `js/kc-form.js`
  now has a required **Town** field under the street field. Tapping a
  suggestion fills it; on submit the town is appended to `address` unless it
  is already there after the street. Payload shape unchanged, `?v=12`.

- **2026-10-02 (calculator)** — Eric: no form fill on the Sand & Seal
  Calculator, just the Get Free Estimate button. The embedded `kc-form` slot
  is gone; both buttons go to `/quote?service=Paver Sealing&src=paver-sealing-calculator`.
  Calculator answers no longer ride along with the lead. `/quote` is the only
  page that loads `kc-form.js` now.
- **2026-10-02 (calculator, later)** — Eric: no price per sq ft on the Sand &
  Seal Calculator, and "Which Finish Is Right For You?" offers only Natural
  Look and Wet Look (Semi Gloss and the three `$ / sq ft` lines removed, grid
  is two cards). The calculator buttons already offered only those two.
- **2026-10-02 (booking)** — Self-booking slots follow the same rules as the
  AI scheduler (`kaim-crm/mac/slots.py`): weekdays from 5:00 PM, Saturdays
  from 12:30, a visit starts at least 30 minutes before sunset in Methuen
  (`sunsetMinutes` in `api/_lib/booking.js`), and two estimate visits are at
  least 60 minutes apart whatever their exact times (it used to block only an
  identical time, so a 6:30 visit left 6:00 "open"). After the clocks change
  in November there is no weekday daylight after 5, so only Saturdays are
  offered until spring unless Eric opens earlier weekday times.
- **2026-10-02 (copy and pricing)** — Eric is moving away from "family run":
  the phrase is gone from every footer, meta description, schema block, the
  about page and the trust rows ("Locally Owned" now). Do not bring it back.
  House washing starts at **$450** everywhere (was $350): service pages, FAQ
  and its schema, blog, calculators page, and the PW calculator's smallest
  house tier is 450 to 550. The PW calculator's bottom lead form is replaced
  by the Get Free Estimate button (`/quote?src=pressure-washing-calculator`),
  so `/quote` is the only form on the site. Calculators page: Driveways is
  listed under the Sand & Seal Calculator, not the Pressure Wash one.

- 2026-10-19: Added `help-wanted.html` (kaimcontracting.com/help-wanted), an unlisted "Work With Me" page Eric texts to people he might hire: the work, $25 to $30 an hour, honest hours (not steady yet, snow on call), what he needs and what they can expect, Text and Call buttons. `noindex, nofollow`, not in nav or sitemap, no form. Built from the about.html skeleton (same nav, footer, tags). Left uncommitted here on purpose alongside Eric's own CLAUDE.md edits.

- 2026-11-02 (internal linking pass, GSC showed only 3 of 20 pages indexed): the
  footer, nav dropdown and mobile menu already carried every page as plain
  server rendered links, so the real gaps were small. Footer now has a
  Calculators group (Pressure Wash Calculator, Sand & Seal Calculator, All
  Calculators) above Hours on every page; `/paver-sealing-calculator` went from 2
  inbound pages to 28. The footer email is a real `mailto:` link with visible
  text (it was an empty anchor filled by `js/site.js`, which still runs and is
  now a no-op). Every homepage service card shows "Learn more". The 9 service
  pages got a "Related Services" pre-footer row (`.rel-svcs`, 3 text cards, CSS
  at the end of `css/site.css`). house-washing's footer `wavy-top` moved onto that
  row so the wave still sits between the light section and the navy. Audit
  script: parse every page's anchors, count internal links and empty text
  anchors; zero empty anchors remain. Deploy bust bumped on all 28 pages.

- 2026-11-14: NEW `gutter-cleaning.html` (/gutter-cleaning). Eric noticed the site only had Gutter Brightening; the Google Ads Gutters ad group had spent about $374 in 30 days on gutter cleaning searches with zero leads because its ad landed on /gutter-brightening, which tells people it is not a gutter cleanout. Built from the gutter-brightening skeleton by a scratchpad script; no price on the page (flat written price at the estimate, same as brightening). `Gutter Cleaning` added to `SERVICE_OPTS` (api/lead.js) and `SERVICES` (js/kc-form.js, `?v=14`), nav dropdown, mobile menu and footer on all 29 pages, sitemap, the package builder chips on pressure-washing and house-washing (`?pkg=gutter-cleaning`), and cross links from gutter-brightening and roof-cleaning. Not on the /pressure-washing photo tile grid (a fifth small tile breaks the last row). The page does NOT mention gutter guards, though the Gutters ad still advertises guard installation: Eric to say whether he installs them.

- 2026-11-14 (Meta click ids): the attribution script on line 7 of every page now also keeps `fbclid` and sends `fbclid`, `fbc` (the `_fbc` cookie, else built from the click id) and `fbp` (the `_fbp` cookie) with every `/api/lead` post, even on a visit with no stored source. `api/lead.js` whitelists them, `intake.js` stores them on `client.attribution` and notes "Came from a Facebook or Instagram ad click". The CRM's `api/_lib/capi.js` passes `fbc` / `fbp` to Meta with the Purchase event. Nothing reaches Meta until `META_CAPI_TOKEN` is set in the CRM's Vercel project.

- 2026-11-14 (about page): Eric said the sections "repeating the same pattern looks glitchy". Meet the Owner and Where We Work were two light sections back to back. Order is now hero, Meet the Owner (light), Refer & Earn (navy, `wavy` both edges), Where We Work (light), the standard `.pi-cta` estimate band (navy), footer. No copy changed.

- **2026-11-14** — Audit pass (headless Chrome over every page at 393 and 1280 wide, plus an API review).
  (1) Form photos are uploaded to the public Supabase bucket `client-photos` by `storePhotos()` in
  `api/_lib/intake.js` and the lead keeps only the link in `attachments[].data` (they were base64 inside
  `crm_data`: 1.0 MB of a 1.45 MB CRM). If storage fails the photo stays inline and the CRM moves it later.
  Upload names lose quote and angle characters in `api/lead.js`. (2) `api/blog.js` throws on a database error
  so a blip answers 500 uncached instead of a cached empty blog or 404. (3) `api/estimate-visit.js` cancels the
  pending arrival reminder of a visit that is re-booked. (4) Dark cards inside a light section: `site.css`
  paints everything in `.sec-light` navy unless the card is on its exclusion list, so unlisted dark cards went
  navy on navy (FAQ "Still have a question", the 10% bundle strip, the blog author box, the deal card's
  "from"). Tag a dark card with class `on-dark`; do not grow the list. (5) Both calculators had a reveal script
  with no opening script tag printing as text under the footer. (6) Paver sealing accordion: the featured item
  swallowed the next two. (7) Quote page H1 cleared from under the fixed header on phones (116px). (8) 28
  small before / after and circle images got 560px versions with `srcset` / `sizes`; phones preload
  `faq-hero-800.webp`. Regenerate a `-560.webp` when one of those photos is replaced. (9) Homepage footer
  referral link, quote favicon, "Calculators" naming, two em dashes in the paver sealing post.
  Left alone, Eric decides: town count 26 vs 24 listed on service-areas, old landscape / drainage wording
  there, cramped footer Hours column on phones, two X icons in the open mobile menu, quote form errors are
  red outlines with no text, "Reserve your summer spot" on the calculators off season, help-wanted has two H1s.

- 2026-11-14: Sand and Seal calculator sideways pan on phones (open since Sep 28) was the scroll reveal: `.rv-right` / `.rv-left` / `.rv-zoom` park a card past the screen edge until it scrolls in. Under 640px they rise instead (`css/site.css`, right after the reveal rules). Checked all live pages at 393px with headless Chrome.

- 2026-11-16 (blog): the 7 hidden duplicate posts are deleted from `blog_posts`; their old addresses forward from `vercel.json` now (the `redirect_to` path in `api/blog.js` still works but no row uses it). `/blog` index rebuilt: the cards were navy text on navy cards inside a light section. Now light photo cards (`indexCard` in `api/blog.js`, `.kbx-*` CSS in `blog-index-template.html`): newest post wide with its photo beside it, the rest two across, one column on phones, cover photo, category pill, read time. The post page's "More from the blog" cards (`card`, `.kb-card`, on navy) are unchanged. The two static posts carry a cover in `STATIC_POSTS`.

- 2026-11-16 (newsletter sign-up): Eric: "should have something setup to signup for a newsletter". A sign-up box (`SIGNUP` in `api/blog.js`, styles `.kbn` at the end of `css/site.css`) sits under the post list on `/blog` and under every post. It posts to the new `api/subscribe.js`, which saves the address in Supabase table `newsletter_subscribers` (email unique, source, `unsub_token`, `unsubscribed_at`; service key only, RLS on with no policies). `GET /api/subscribe?u=<token>` is the unsubscribe link any future email must carry. NOTHING is sent yet: no welcome email, no newsletter. The box promises only "sent when there is something worth knowing". Sending (for example an email when he publishes a post) is not built and needs his say on what goes out. The blog intro no longer says the photos are from our own jobs, because the writer may now use stock photos (kaim-crm CLAUDE.md, "Blog photos").

- 2026-11-16 (/build): NEW unlisted page `build.html` (kaimcontracting.com/build), `noindex, nofollow`, not in the nav or sitemap. It is for people in their first years of a local service business, NOT homeowners: Eric wants to grow an audience that could later join a paid Skool group, and has not settled the exact topic ("starting a service business or something"). The page promises real job numbers, where leads come from and the system he runs on, by email. Its form posts to `api/subscribe.js` with `list: 'build'`; `newsletter_subscribers.list` is `blog` or `build` (unique on email + list) and blog post emails only go to `blog`. Nothing is sent to the build list yet. Built from the blog index shell by a scratchpad script; no sticky estimate bar on it. The copy does not say "no course", on purpose.

- 2026-11-16 (water treatment, NEW service being tested): NEW `water-treatment.html` (/water-treatment), built from the gutter-cleaning skeleton by a scratchpad script. It is the landing page for a separate, PAUSED Google Ads campaign. In the sitemap, but NOT in the nav, mobile menu or footer on purpose until Eric decides this is a real service line. Positioning from the research (report at `C:\Users\erick\reports\Water treatment business MA NH RI.md`): test first, fix only what is wrong, written price, no sales pressure, standard equipment anyone can service; aimed at Southern NH well owners first. No prices on the page (Eric has no price sheet yet) and no numbers about contaminants. Legal facts the copy depends on: Massachusetts requires a licensed MA plumber plus a permit for any softener or filter tied into the water lines, so the page says a licensed plumber does that part; New Hampshire exempts water treatment installs from the plumbing license. Do not write copy that says Kaim installs these in Massachusetts itself. `Water Treatment` is in `SERVICE_OPTS` (api/lead.js); `js/kc-form.js` (`?v=15`) adds it to the dropdown ONLY when the visitor arrives with `?service=Water Treatment`, so everyday visitors do not see it, and counts the lead at $400 for Google Ads.

- 2026-11-19 (Yelp + Nextdoor): Eric's Yelp page (yelp.com/biz/kaim-contracting-llc-methuen) and Nextdoor page (nextdoor.com/pages/kaim-contracting-llc-methuen-ma/) were created today. Both are linked from the footer social row on every page (`sf-yelp`, `sf-nd`, after TikTok; the Nextdoor icon is a plain house shape, not their logo) and listed in the homepage schema `sameAs`. Street address is hidden on both listings, same as Google.

## 2026-11-19: instant gutter cleaning price (split test, off until Eric turns it on)

Eric wants to see whether an instant price converts better than the normal form. Gutter cleaning only.

- **Flow for a visitor in the instant group:** quote form with "See My Price" -> `POST /api/instant-quote` saves the lead (same `intakeLead()` path) and, when the house can be priced, a real CRM quote -> the form shows the price with an "Add gutter brightening" add-on -> "Review and Book" opens the CRM's normal quote page (`settings.publicBase` + `/?approve=<token>`) -> they approve it there and pick the job day (that half is kaim-crm `api/portal.js` `instant_days` / `instant_book`).
- **Price rule** (`api/_lib/instant.js`, tests `node --test test/instant.test.mjs`, `LIVE=1` also hits the real lookups): house living area x a rate by story count, between a minimum and a maximum, rounded to $25. Eric's numbers are read from the CRM (`settings.pq.iq*`, edited in the CRM under Price & Quote > My numbers); `IQ_DEFAULTS` are only the starting values and must match `IQ_DEF` in kaim-crm `lib/pq.js`.
- **House lookup:** Census geocoder (where the address is) + the MassGIS property tax parcel layer searched by house number and street name (an attribute search, under a second; searching the layer by map area took 10+ seconds). The record must be within 2 miles of the geocoded point, the only record at that address, and use code 101 (single family). The zip is dropped before geocoding because the form's address suggestions sometimes carry a neighbouring town's zip. No record, a condo or multi family, NH, over the size limit or 3 stories -> `{ instant:false }`: the lead is saved the normal way (welcome text, confirmation email) and the form shows the usual booking step.
- **Split:** `GET /api/instant-quote` returns `share` (percent, from the CRM; 0 = off, the default). `js/kc-form.js` deals each visitor 'a' or 'b' once (localStorage `kc_iq`) when share > 0. Group 'a' gutter cleaning leads post `iq: 'a'` to `/api/lead`; group 'b' post to the instant endpoint. Both land on the client as `client.iq`, which the CRM scoreboard reads. `?instant=1` forces the instant flow for a look and is tagged `preview`.
- **Texts:** a priced lead gets no "what day works for an estimate" welcome text and no confirmation email. Instead one text with the quote link (`instant_quote_link`) is queued 5 minutes out; the CRM cancels it if they approve first. Eric's new-lead text says what price was shown.
- **Gotchas:** the instant POST goes to `/api/instant-quote?via=/api/lead` on purpose: the attribution script in every page head only attaches the ad click ids to requests with `/api/lead` in the address. If the instant endpoint fails, the form falls back to `/api/lead` so the lead is never lost. `intakeLead()` gained three options for this: `onDb(db, client, now)` (runs inside the save loop), `autoReply`, `ownerExtra`.
- Checked: unit tests, real lookups on 10 of Eric's client addresses, the form + price screen in headless Chrome with the API stubbed. NOT yet run end to end on the live site.
- **Later 2026-11-19:** the CRM switch is now Off / Split test / Everyone on its Lead Sources page (`share` 0 / 50 / 100). A split test is every other visitor, not a coin flip: `GET /api/instant-quote?assign=1` returns `group` from the Postgres sequence behind `iq_next()` (odd = 'b'), asked once per visitor the first time Gutter Cleaning is picked (`iqDeal` in kc-form.js v17) and remembered in localStorage `kc_iq`. At 100 every visitor is 'b', whatever was stored.
- **Later 2026-11-19 (kc-form.js v18): brightening on both sides of the test.** Eric wanted the normal form to offer brightening too "so that stays even", and the before / after photo plus selling words on the instant side. `BRIGHT_PITCH` (images/ba-gutter-before.webp + after, his wording: years of asphalt shingle runoff, specialized cleaner, "back to their former white glory") is one block used in both places. Normal form: the box `brbox` shows when Gutter Cleaning is picked and the visitor is not on the instant price; ticking it adds "- Also wants a price for: Gutter Brightening" to the lead notes. Price screen: the same block sits above the add-on with its price. Change the words or photos in that one constant.
- **Later 2026-11-19 (kc-form.js v19):** no self booking. The price screen button is "Review and Approve" and the fine print says Eric will text to set the day; after approving on the CRM quote page the visitor sees the normal approved page and Eric schedules the job himself. The pick-a-day code in kaim-crm stays behind `settings.pq.iqSelfBook` (off).
- **Later 2026-11-19 (kc-form.js v20): ads land on the quote page.** Eric switched the instant price to everyone and wants Meta and Google gutter ads to go straight to it. The ad link is `/quote?service=Gutter%20Cleaning&src=<tag>` (plus utm tags for Meta). quote.html now has two intros: `.qp-std` (the normal one) and `.qp-iq` ("See Your Price Now", shown by `iqSync` in kc-form.js whenever the instant price is on for this visitor).

## Instant gutter price: review fixes (Nov 19 2026, late)

- **No instant price for New Hampshire or the wrong town.** `lookupHouse` refuses an 03 zip, and a town name both states have (Salem, Hudson, Kingston, Bedford...) unless the address says MA or carries an 01/02 zip (`state_unclear`). `sameTown()` drops assessor records from a town that is neither the geocoder's nor one the visitor typed. All ten live test addresses still price (`LIVE=1 node --test test/instant.test.mjs`).
- **Photos** now go through `/api/instant-quote` to `intakeLead` (they were dropped).
- **One lead per submission.** The form sends `sid`; `intakeLead({ webKey })` stores it as `client.webSubmitId` and answers `duplicate` on a repeat, so the fallback post to `/api/lead` after a lost answer cannot make a second lead.
- **The quote link text obeys the Automated Lead Texting switch** (`intakeLead` returns `autoTexts`).
- **Brightening add-on:** the save is checked and retried three times; on failure the button says Try again instead of opening a cheaper quote. Unticking is saved too. The button works again after Back on an iPhone (`pageshow`).
- Run the test file by name. `node --test test/` fails on its own, before and after these changes.

## 2026-11-19 (late): /gutter-price, the instant gutter price as its own page

Eric did not like the instant price living inside the normal lead form ("it should be doing something different and showing a loading screen type of deal to build a illusion", and a plain "+$200 brightening" box "isnt gonna make anyone say hell yeah").

- **`gutter-price.html` + `js/gutter-price.js`** (bump its `?v=` on edits). The page head, nav and footer were copied from quote.html; if the shared nav or footer markup changes, paste it here too. Steps: address -> "finding your home" (the state's 2025 aerial photo of the lot from MassGIS map tiles, then the town record facts ticking in, about 6 seconds) -> name and phone to see the price (the lead is saved here) -> the price, with brightening sold by a drag-to-compare before / after and his wording -> "See My Full Quote".
- **The quote opens over the page** in an overlay (an iframe of the CRM quote page) with a "Back to my price" button; Esc and the phone's back button close it too. Eric: being stuck on the quote with no way back was "a annoying bug". The CRM quote page posts a message when it is approved, and closing the overlay then shows "You are all set". The price screen is also kept in sessionStorage (`kc_gp_state`, 2 hours), so a reload or coming back lands on the price, not the address step.
- **`POST /api/instant-quote { action:'lookup', address }`** returns the house facts and the lot centre for that screen, never a price. The price only comes back from `action:'quote'` with a name and phone.
- **Where the instant price now lives:** only on /gutter-price. `js/kc-form.js` (v21) no longer shows a price: a visitor who should get the instant price is sent from /quote to /gutter-price (ad tags kept). /gutter-price sends a visitor back to /quote when the CRM switch is Off or they are on the normal-form side of a split.
- A house the town record cannot price: the scan says "this one needs a quick look from me", the same name and phone step saves a normal lead, and Eric prices it.
- /gutter-cleaning buttons now read "Get an Instant Price" and go to `/gutter-price?src=gutter-cleaning` (hero card, sticky bar, bottom call to action).
- Copy rule learned here: only claim what his quotes already say (leaves and debris cleared, downspouts flushed and tested). I had written "by hand" and "debris bagged and hauled away" and took them out.
- Checked in headless Chrome and in real Chrome on a local copy with the API stubbed (scan, gate, price, add brightening, open quote, close, reopen, reload). NOT yet run end to end on the live site or on a phone.
- **Later (kc-form.js v22):** the regular quote form can be filled out for gutter cleaning. A visitor who ARRIVES with Gutter Cleaning already picked (an ad, a site button) still goes to /gutter-price. One who picks Gutter Cleaning from the list themselves stays on the form: a gold line "Want your price right now? Instant price" links to /gutter-price, the brightening box shows, and submitting sends a normal lead. The form itself never shows a price any more (`instant = false`).
- **Later (gutter-price.js v2):** Eric wanted the address step to look "like u were filling it out for google or amazon" and name, number and email captured before the price. Address step is now a labelled checkout-style form (street with suggestions that fill every field, apt / unit, city, state MA or NH, ZIP) with browser autofill names. The step before the price asks first name, last name, mobile number and email, all required. The address is sent as "7 Alpine Dr, Haverhill, MA 01830" (the lookup drops the zip itself); a unit goes in the lead notes.
- **Later (gutter-price.js v3): no blurred price.** Eric: "i dont like the price being blurred like that it should gather info then a loading bar acting like its calulating". Order is now address -> who the quote is for (first, last, mobile, email, all required) -> the calculating screen (aerial photo of the lot, five steps ticking, a progress bar with a percent; the lookup and the real quote both run while it plays, about 7 seconds) -> the price with the brightening add-on and "See My Full Quote". He approves-and-schedules: they approve in the quote overlay, get the normal thank-you text, he reaches out to schedule. A send that fails completely returns to the contact step with the form intact.
- **Brightening is the upsell and always comes out under the cleaning price:** `priceHouse` caps it at the cleaning price minus $25 whatever the CRM numbers say (test in instant.test.mjs).
- **Later (gutter-price.js v4): no price screen.** Eric: "i just want the real quote i normally send customers for them to see the number and approve it". The calculating screen now ends by opening the real CRM quote page itself (a full page load of `res.url`, not the overlay): the number and the approve button are there. The price screen, the brightening before / after add-on, the overlay and "text me the quote" are gone from the page (the server `addon` action is still there, unused). Coming back from the quote (back button, reload) shows one card, "Your quote is ready" with See My Quote. The follow-up quote link text no longer says "grab a day". Checked at Instagram in-app size (393 x 660) in headless Chrome.

## 2026-11-20: instant gutter price for two family houses and New Hampshire

Eric, after a two family lead got no price: open it up to two families "and nh".

- **Two family (Massachusetts):** `pickParcel` takes use code 104 with up to 2 units, priced by the same rule. Three families and up, condos, two records at one address: still no price. His new-lead text says "two family".
- **New Hampshire:** the state has no town record with the house size, so the house is measured (`lookupHouseNH` in `api/_lib/instant.js`, `api/_lib/laserhouse.js`): NH GRANIT lot record (town + street address, land use 11 = single family; 12 is "2 to 4 units", so NH two families are NOT priced) -> FEMA USA Structures building outline (biggest building whose middle is on the lot) -> USGS airplane laser scan over that outline. Roof height per square metre gives the floors under it; floors x outline = living area, share of roof at two story height = 1 or 2 story. Then the normal `priceHouse`. About 4 to 5 seconds; gives up at 9 (`lookup_slow`) and the lead goes in the normal way. `laz-perf` (reads the scan files) is the third dependency. An address is New Hampshire when it says NH or has an 03 zip; a two-state town name with no state is still `state_unclear`.
- **How good it is:** the numbers in `RULE` were fitted on 125 Massachusetts single family houses where the town record gives the real answer. Price off the laser vs price off the record: same on 7 in 10, within $25 on about 8 in 10, $75 or more apart on about 1 in 8 (half high, half low). Eric was told. If he wants it off: return `{ ok:false, why:'not_ma' }` at the top of the NH branch in `lookupHouse`.
- The loading screen says "Measuring your home" and "About 1,100 sq ft · measured from the air" for New Hampshire; there is no aerial photo there (the photo tiles are Massachusetts only). `gutter-price.js?v=5`.
- Tests: `node --test test/instant.test.mjs` (no network, no install needed); `LIVE=1` needs `npm install --no-package-lock` first for `laz-perf`.

- 2026-11-21 (instant quote email): a priced instant gutter quote is now also emailed to the customer right away (`sendQuoteEmail` in `api/_lib/intake.js`, called and awaited at the end of `handleQuote` in `api/instant-quote.js`): price, a "View and Approve My Quote" button, first person from Eric. Eric wanted the conversation out of the Instagram / Facebook app. The 5 minute quote link text, and the CRM's day 3 and day 10 quote follow-ups, are unchanged. Not yet seen in a real inbox.

- 2026-11-21 (gutter cleaning prices down): Eric was quoted $149 for his own house by a competitor and said "ill do it for 199". `IQ_DEFAULTS`: cleaning lowest $199 (was $250), $0.08 / $0.095 per sq ft for 1 / 2 story (was $0.10 / $0.12), highest $350 unchanged; kaim-crm `IQ_DEF` changed to match. `clamp` now returns the lowest price itself when the rounded price is at or under its $25 step, so it reads $199, never $200. The brightening cap is `round25(clean) - 25` ($175 beside a $199 cleaning).

- 2026-11-21 (Meta gutter question form): Eric wants a second Meta gutter campaign that asks "cleaning, brightening, or both" in a form inside Facebook / Instagram, run beside the /gutter-price campaign. `api/meta-lead-webhook.js` now reads Meta's address fields (street_address, city, state, zip_code) and any question whose key contains "gutter" (`parseFields`, `formAddress`, `gutterChoice`; tests `node --test test/metaform.test.mjs`). Cleaning or Both: `intakeGutterLead` prices the house from the address exactly like /gutter-price, saves the real CRM quote with the lead (Both adds the brightening line), queues the quote link text one minute out (`instant_quote_link`) and emails the quote (`sendQuoteEmail`). Brightening alone, no address, or a house that cannot be priced: a normal lead with the usual welcome text. Lead source "Meta gutter form", `client.iq.v = 'form'`. NOTHING arrives until the three webhook keys are in Vercel and the Page is subscribed (see the env vars at the top of that file); not run end to end.

- 2026-11-21 (/privacy): NEW `privacy.html` (kaimcontracting.com/privacy), built from build.html by a scratchpad script. Meta's lead forms will not publish without a privacy policy link and the site had none. Plain policy: what the forms collect, public property records used for pricing, texts (reply STOP), no selling, how to ask for deletion. Not lawyer-read. NOT linked from the footer or in the sitemap yet (the footer block must stay identical on every page; add it to all of them in one pass if Eric wants it there). The Meta gutter form asks street, city and ZIP only; `formAddress` takes the state from the ZIP (01 / 02 = MA, 03 = NH).
