// Blog pages served from the database.
//   /blog                -> index (posts from blog_posts + the two original static posts)
//   /blog/<slug>         -> one post
//   /sitemap-blog.xml    -> sitemap of the database posts
// Posts are written by the blog agent on Eric's Mac (kaim-crm/mac/blog_writer.py)
// and land in Supabase table blog_posts as drafts; Eric publishes them in the CRM.
//   /blog/<slug>?preview=1 shows a draft (noindex). A hidden post with
//   redirect_to set answers 301 to that slug. The page shell comes from
// blog-template.html / blog-index-template.html (the site's own markup) so a
// post looks exactly like every other page.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://dfquwxmoidhhcwezgnry.supabase.co';
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE = 'https://kaimcontracting.com';

// The two posts that were hand built as static pages before the agent existed.
const STATIC_POSTS = [
  { slug: '/blog-fall-house-washing', title: 'Wash Your House Before Winter: Why Fall Is the Deadline', category: 'Pressure Washing', published_at: '2026-07-21', cover_image: '/images/ba-siding-after.webp', cover_alt: 'Vinyl siding after a soft wash', read_minutes: 5,
    excerpt: 'Algae and mildew do not die over a New England winter, they spread under the snow. What a fall soft wash protects, the difference between soft washing and pressure washing, and when to book before the schedule fills.' },
  { slug: '/blog-paver-sealing', title: 'Benefits of Sealing a Paver Patio in Massachusetts', category: 'Paver Sealing', published_at: '2026-05-26', cover_image: '/images/ps-real-after-2.webp', cover_alt: 'Paver patio after cleaning, sanding and sealing', read_minutes: 6,
    excerpt: 'Why sealing matters in New England, when to do it, and how to know your paver patio or driveway is ready. The five real benefits, the cost range, and when DIY makes sense vs. when to call us.' },
];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Date-only values (the two static posts) are read as noon so the day does not slip in Eastern time.
const fmtDate = (iso) => new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

let _tpl = {};
function tpl(name) {
  if (!_tpl[name]) _tpl[name] = readFileSync(join(process.cwd(), name), 'utf8');
  return _tpl[name];
}
function fill(html, map) {
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : ''));
}

function card(p) {
  const href = p.slug.startsWith('/') ? p.slug : `/blog/${p.slug}`;
  return `<a href="${esc(href)}" class="kb-card">
    <div class="kb-card-meta">${esc(fmtDate(p.published_at))} &middot; ${esc(p.category || 'Blog')}</div>
    <div class="kb-card-title">${esc(p.title)}</div>
    <p class="kb-card-x">${esc(p.excerpt || '')}</p>
    <span class="kb-card-more">Read Post &rarr;</span>
  </a>`;
}

// Newsletter sign-up box, shown under the post list and under every post.
// Posts to /api/subscribe; styles are .kbn in css/site.css.
const SIGNUP = `<aside class="kbn" id="newsletter">
  <div class="kbn-txt"><h3>Want the next one in your inbox?</h3><p>Seasonal tips for your home from our crew, sent when there is something worth knowing. Unsubscribe any time.</p></div>
  <form class="kbn-form" novalidate>
    <input type="email" name="email" placeholder="Your email" autocomplete="email" inputmode="email" aria-label="Your email" required>
    <input type="text" name="kc_hpot_xyz" class="kbn-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Sign me up</button>
    <p class="kbn-msg" role="status"></p>
  </form>
</aside>
<script>(function(){var box=document.getElementById('newsletter');if(!box)return;var f=box.querySelector('form'),msg=box.querySelector('.kbn-msg'),btn=f.querySelector('button'),busy=false;
f.addEventListener('submit',function(e){e.preventDefault();if(busy)return;var em=(f.email.value||'').trim();
if(!/^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$/i.test(em)){msg.textContent='That email does not look right.';f.email.focus();return;}
busy=true;btn.disabled=true;btn.textContent='Sending...';msg.textContent='';
fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,kc_hpot_xyz:f.kc_hpot_xyz.value,source:'Blog '+location.pathname})})
.then(function(r){if(r.ok){box.classList.add('done');f.innerHTML='<p class="kbn-ok">You are on the list. Talk soon.</p>';try{if(window.gtag)gtag('event','newsletter_signup',{page:location.pathname});}catch(_){}return;}
busy=false;btn.disabled=false;btn.textContent='Sign me up';msg.textContent=r.status===400?'That email does not look right.':'That did not go through. Try again in a minute.';})
.catch(function(){busy=false;btn.disabled=false;btn.textContent='Sign me up';msg.textContent='That did not go through. Try again in a minute.';});});})();</script>`;

// The blog index card: photo on top, light card, used only on /blog.
function indexCard(p, i) {
  const href = p.slug.startsWith('/') ? p.slug : `/blog/${p.slug}`;
  const mins = p.read_minutes || Math.max(2, Math.round((p.word_count || 900) / 220));
  const img = p.cover_image || '/images/ps-hero-after.webp';
  return `<a href="${esc(href)}" class="kbx-card${i === 0 ? ' kbx-lead' : ''}">
    <div class="kbx-img"><img src="${esc(img)}" alt="${esc(p.cover_alt || p.title)}" width="800" height="500" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>
    <div class="kbx-body">
      <span class="kbx-cat">${i === 0 ? 'Newest &middot; ' : ''}${esc(p.category || 'Blog')}</span>
      <h3 class="kbx-title">${esc(p.title)}</h3>
      <p class="kbx-x">${esc(p.excerpt || '')}</p>
      <div class="kbx-foot"><span class="kbx-date">${esc(fmtDate(p.published_at))} &middot; ${mins} min read</span><span class="kbx-go">Read post <i aria-hidden="true">&rarr;</i></span></div>
    </div>
  </a>`;
}

async function renderIndex(res) {
  const { data, error } = await sb.from('blog_posts').select('slug,title,excerpt,category,published_at,cover_image,cover_alt,read_minutes,word_count').eq('status', 'published').order('published_at', { ascending: false }).limit(200);
  if (error) throw error;   // a database blip must answer 500 uncached, never a cached "no posts" / 404
  const posts = [...(data || []), ...STATIC_POSTS].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Kaim Contracting Blog', url: `${SITE}/blog`,
    publisher: { '@type': 'Organization', name: 'Kaim Contracting LLC', url: `${SITE}/` },
    blogPost: posts.slice(0, 50).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: p.slug.startsWith('/') ? SITE + p.slug : `${SITE}/blog/${p.slug}`, datePublished: p.published_at, author: { '@type': 'Person', name: 'Eric Kaim' } })) };
  const html = fill(tpl('blog-index-template.html'), {
    LDJSON: JSON.stringify(ld),
    POSTS: posts.map(indexCard).join('\n'),
    COUNT: String(posts.length),
    SIGNUP,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

async function renderPost(res, slug, preview) {
  const { data: row, error } = await sb.from('blog_posts').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;   // a database blip must answer 500 uncached, never a cached "no posts" / 404
  // A hidden duplicate sends its old address to the post that replaced it.
  if (row && row.status !== 'published' && row.redirect_to && /^[a-z0-9-]{1,80}$/.test(row.redirect_to)) {
    res.setHeader('Location', `/blog/${row.redirect_to}`);
    return res.status(301).send('');
  }
  // A draft is readable only through the preview link from the CRM, and never indexed.
  const isDraft = !!(row && row.status === 'draft' && preview);
  const p = row && (row.status === 'published' || isDraft) ? row : null;
  if (!p) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(fill(tpl('blog-index-template.html'), { LDJSON: '{}', POSTS: '<p>That post is not here any more. <a href="/blog">See the latest posts.</a></p>', COUNT: '0' }));
  }
  const url = `${SITE}/blog/${p.slug}`;
  const cover = p.cover_image ? (p.cover_image.startsWith('http') ? p.cover_image : SITE + p.cover_image) : `${SITE}/images/ps-hero-after.webp`;
  const article = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description || '', image: cover,
    datePublished: p.published_at, dateModified: p.updated_at || p.published_at, mainEntityOfPage: url,
    author: { '@type': 'Person', name: 'Eric Kaim', url: `${SITE}/about` },
    publisher: { '@type': 'Organization', name: 'Kaim Contracting LLC', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/logo.png` } } };
  const faqs = [...String(p.html).matchAll(/<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>/g)].map(m => ({ '@type': 'Question', name: m[1], acceptedAnswer: { '@type': 'Answer', text: m[2] } }));
  const faqLd = faqs.length ? JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs }) : '{}';
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
    { '@type': 'ListItem', position: 3, name: p.title, item: url } ] };
  const { data: more } = await sb.from('blog_posts').select('slug,title,excerpt,category,published_at').eq('status', 'published').neq('slug', slug).order('published_at', { ascending: false }).limit(3);
  const html = fill(tpl('blog-template.html'), {
    TITLE: esc(p.title),
    DESC: esc(p.description || p.excerpt || ''),
    CANONICAL: url,
    OG_IMAGE: cover,
    LDJSON: JSON.stringify(article),
    FAQ_LDJSON: faqLd,
    CRUMB_LDJSON: JSON.stringify(crumbs),
    CATEGORY: esc(p.category || 'Blog'),
    H1: esc(p.title),
    DATE: esc(fmtDate(p.published_at)),
    READ: String(p.read_minutes || Math.max(2, Math.round((p.word_count || 900) / 220))),
    COVER: esc(p.cover_image || '/images/ps-hero-after.webp'),
    COVER_ALT: esc(p.cover_alt || p.title),
    CONTENT: p.html,
    SIGNUP,
    MORE: (more || []).concat(STATIC_POSTS).slice(0, 3).map(card).join('\n'),
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (isDraft) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">')
      .replace(/<body([^>]*)>/, '<body$1><div style="background:#b45309;color:#fff;font:600 14px/1.4 sans-serif;padding:10px 16px;text-align:center;position:relative;z-index:9999">DRAFT. Not on the site yet. Publish it from the CRM, Blog and Agents.</div>'));
  }
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

async function renderSitemap(res) {
  const { data, error } = await sb.from('blog_posts').select('slug,updated_at,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(1000);
  if (error) throw error;   // a database blip must answer 500 uncached, never a cached "no posts" / 404
  const urls = (data || []).map(p => `  <url><loc>${SITE}/blog/${esc(p.slug)}</loc><lastmod>${String(p.updated_at || p.published_at).slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600');
  return res.status(200).send(xml);
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    if (q.sitemap) return await renderSitemap(res);
    const slug = String(q.slug || '').trim().toLowerCase();
    if (slug) {
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return res.status(404).send('Not found');
      return await renderPost(res, slug, !!q.preview);
    }
    return await renderIndex(res);
  } catch (e) {
    console.error('[blog]', e?.message || e);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">The blog is taking a breather. <a href="/">Back to the home page.</a></p>');
  }
}
