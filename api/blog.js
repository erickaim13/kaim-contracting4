// Blog pages served from the database.
//   /blog                -> index (posts from blog_posts + the two original static posts)
//   /blog/<slug>         -> one post
//   /sitemap-blog.xml    -> sitemap of the database posts
// Posts are written by the blog agent on Eric's Mac (kaim-crm/mac/blog_writer.py)
// and land in Supabase table blog_posts. The page shell comes from
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
  { slug: '/blog-fall-house-washing', title: 'Wash Your House Before Winter: Why Fall Is the Deadline', category: 'Pressure Washing', published_at: '2026-07-21',
    excerpt: 'Algae and mildew do not die over a New England winter, they spread under the snow. What a fall soft wash protects, the difference between soft washing and pressure washing, and when to book before the schedule fills.' },
  { slug: '/blog-paver-sealing', title: 'Benefits of Sealing a Paver Patio in Massachusetts', category: 'Pavers', published_at: '2026-05-26',
    excerpt: 'Why sealing matters in New England, when to do it, and how to know your paver patio or driveway is ready. The five real benefits, the cost range, and when DIY makes sense vs. when to call us.' },
];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

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

async function renderIndex(res) {
  const { data } = await sb.from('blog_posts').select('slug,title,excerpt,category,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(200);
  const posts = [...(data || []), ...STATIC_POSTS].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Kaim Contracting Blog', url: `${SITE}/blog`,
    publisher: { '@type': 'Organization', name: 'Kaim Contracting LLC', url: `${SITE}/` },
    blogPost: posts.slice(0, 50).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: p.slug.startsWith('/') ? SITE + p.slug : `${SITE}/blog/${p.slug}`, datePublished: p.published_at, author: { '@type': 'Person', name: 'Eric Kaim' } })) };
  const html = fill(tpl('blog-index-template.html'), {
    LDJSON: JSON.stringify(ld),
    POSTS: posts.map(card).join('\n'),
    COUNT: String(posts.length),
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

async function renderPost(res, slug) {
  const { data: p } = await sb.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
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
    MORE: (more || []).concat(STATIC_POSTS).slice(0, 3).map(card).join('\n'),
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

async function renderSitemap(res) {
  const { data } = await sb.from('blog_posts').select('slug,updated_at,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(1000);
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
      return await renderPost(res, slug);
    }
    return await renderIndex(res);
  } catch (e) {
    console.error('[blog]', e?.message || e);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">The blog is taking a breather. <a href="/">Back to the home page.</a></p>');
  }
}
