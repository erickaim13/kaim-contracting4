# Front-end redesign: shared header and footer, sticky phone bar, homepage, two-step quote form

Branch `claude/zen-cerf-f4a595`. Nothing under `api/` changed. Every page keeps its title, meta description, canonical, structured data, image alt text, form field names and the honeypot.

## Audit findings (index.html, quote.html, house-washing.html, before)

**Typography**
- Three font families (DM Serif Display, Oswald, Source Sans 3) with no real fallback stacks. Serif hero plus condensed caps everywhere read as two brands.
- Uppercase Oswald on nearly every label, eyebrow, button and heading. Eyebrows on 8 of 9 homepage sections.
- Body and helper copy in saturated blue `#5a90bb` on navy, about 4:1 contrast, fails AA for small text.

**Color and surfaces**
- Two accents in practice (gold plus the blue muted text), and brand-colored social icons added a third and fourth.
- A 3px gold gradient bar on top of almost every section, a gold divider under every h2, a gold footer border. Repeated until it meant nothing.
- Border radii drifted from 3px to 22px with no rule.

**Layout and navigation**
- On phones the nav ate 104px: a 62px bar plus a fixed 42px gold call bar under it. That bar covered content, and on the calculator pages it hid the H1. Every page carried padding hacks to dodge it.
- Hamburger hit area about 32px. Mobile menu rows 40 to 44px.
- Desktop nav carried the email, a tagline and a "Get Started" button: cluttered, weak CTA label.
- Seven labels for the same intent across the site: Get Started, Request Estimate, Request Free Estimate, Get Free Estimate, Get My Free Estimate, Get My Free 24 Hour Quote, Send Me My Quote.
- "Tools" in the nav broke the "Calculator, never Tool" rule in CLAUDE.md.
- Homepage hero never said what the company does or where.
- Homepage "What we do" was two equal cards with hand-drawn icons while nine real job photos sat unused. No services grid, no before/after pairs beyond the scratch-off demo.
- How It Works was three boxed cards with "Step 1 / 2 / 3" chips and a 104px ghost number.
- Footer was a four-column farm with dashes in the hours and no service links.
- quote.html had no nav, no footer, its own one-off header, and an eyebrow that wrapped to two lines on a phone.

**Forms**
- Eight fields visible at once, placeholder-as-label, no progress, errors were a red border with no message. Inputs were already 16px and 50px tall.

**Content**
- No reviews or ratings exist anywhere in the repo, so none were added.

## What changed

1. **Shared chrome on all 26 pages** from `css/site.css` + `js/site.js`: sticky in-flow header (72px desktop, 64px phone), 44px hamburger and phone button, slide-in menu with 48px rows and Escape/click-outside close, a fixed bottom bar on phones with Call and Get Free Estimate, and one footer with service links, company links, hours (no dashes) and payment marks. Old floating nav, top gold call bar and their padding hacks removed from every page.
2. **Fonts**: Oswald + Source Sans 3 only, real fallback stacks. Hero headlines moved from DM Serif to Oswald 600 sentence case with gold emphasis.
3. **Palette**: gold is the only accent. Muted text lightened to `#a9b7c9` (AA). Gold section bars, dividers and footer border removed. Social icons monochrome. Radius rule: 10px controls, 16px cards.
4. **Homepage**: subline saying what and where, "Free in-person estimate" card in owner voice, a service-area line, a photo services grid (8 real photos, price anchors from the service pages), three before/after pairs after the scratch-off demo, How It Works without card chrome.
5. **Quote form** (`js/kc-form.js` v3): step 1 is the job (service, address, note, photos), step 2 is contact (name, phone, email). Visible labels, "Step 1 of 2" progress, inline error messages, owner-voice reassurance. Payload is byte-for-byte the same shape as v2 (verified by stubbing fetch and submitting: `first, last, phone, email, address, service, message, contactPref, source, kc_hpot_xyz, attachments`). `?service=` preselect, `?src=` tagging and `?offer=` banners still work.
6. **Service pages**: consistent hero spacing now that the nav is in flow, subtext visible on phones (it carries the price anchor), eyebrows and gold bars gone, deal cards and buttons on the radius rule.
7. **Calculators**: option buttons are sentence case, 50px tall, with a clear selected state; inputs 52px; results card restyled; the long intro paragraph on the pressure washing calculator now sits below the tool instead of above it on phones. Math untouched.
8. **CTA labels**: "Get Free Estimate" everywhere. Nav "Tools" is now "Calculators" (URL unchanged).
9. 404 page gets the shared header and footer and clean URLs.

## Verification

- `node --check js/site.js js/kc-form.js`: clean.
- Internal link check over all 26 pages (2325 hrefs and srcs, clean URLs, anchors, images): no broken links.
- Quote form submitted end to end against a stubbed `/api/lead` with `?service=Roof%20Cleaning&src=roof-cleaning`: validation messages shown on both steps, payload captured and compared to v2.
- Pages checked in the browser at 390px and 1440px: home, quote, house-washing, paver-sealing, both calculators, 404, mobile menu open and closed.

## Before / after

Phone (390px) and desktop captures live in `docs/redesign-2026-09/` on this branch.

| Page | Before | After |
|---|---|---|
| Home, phone | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/home-phone-tall-before.jpg) | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/home-phone-tall-after.jpg) |
| Quote, phone | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/quote-phone-tall-before.jpg) | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/quote-phone-tall-after.jpg) |
| House washing, phone | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/house-washing-phone-tall-before.jpg) | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/house-washing-phone-tall-after.jpg) |
| Pressure washing calculator, phone | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/pw-calculator-phone-tall-before.jpg) | ![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/pw-calculator-phone-tall-after.jpg) |

Desktop, home:

![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/home-desktop-before.jpg)
![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/home-desktop-after.jpg)

Desktop, quote:

![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/quote-desktop-before.jpg)
![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/quote-desktop-after.jpg)

Desktop, house washing:

![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/house-washing-desktop-before.jpg)
![](https://raw.githubusercontent.com/erickaim13/kaim-contracting4/claude/zen-cerf-f4a595/docs/redesign-2026-09/house-washing-desktop-after.jpg)

## Not done, on purpose

- No reviews section: there are no reviews in the repo to show, and inventing them was not an option.
- The per-page inline CSS for the old nav and footer is still in each file (now overridden by `css/site.css`). Deleting it page by page is a safe follow-up.
- Landscaping, drainage, pavers, paver-calculator and mulch-calculator pages are redirected away in `vercel.json`; they got the shared chrome so nothing on them breaks, nothing more.

## Deploy note

`index.html` has a fresh `deploy-bust` stamp. If Vercel serves stale HTML on other pages after merge, bump line 2 on the page in question (see CLAUDE.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
