#!/usr/bin/env node
/**
 * Build static HTML mirror from scraped WordPress JSON
 */

import fs from 'fs';
import path from 'path';

const SCRAPE_DIR = './data/wp-scrape';
const DIST_DIR = './dist-mirror';

// ── Helpers ──
function decodeHtml(html) {
  return html
    .replace(/&#8211;/g, '–')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(+code));
}

function rewriteLinks(html) {
  // Rewrite internal WordPress links to static .html
  return html
    .replace(/href="https:\/\/auto-glass\.no\/([^"]*)\/?"/g, (match, slug) => {
      if (slug === '' || slug === 'hovedside') return 'href="index.html"';
      if (slug.startsWith('wp-content/')) return match;
      if (slug.startsWith('shop/') || slug.startsWith('produkt/')) return 'href="under-utvikling.html"';
      return `href="${slug}.html"`;
    })
    // Rewrite media links
    .replace(/src="https:\/\/auto-glass\.no\/wp-content\/uploads\/[^"]*\/([^"]+)"/g, 'src="media/$1"')
    .replace(/href="https:\/\/auto-glass\.no\/wp-content\/uploads\/[^"]*\/([^"]+)"/g, 'href="media/$1"');
}

function stripWpMarkup(html) {
  // Remove WordPress-specific scripts and forms
  let cleaned = html;
  cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gs, '');
  cleaned = cleaned.replace(/<style[^>]*>.*?<\/style>/gs, '');
  cleaned = cleaned.replace(/<form[^>]*>.*?<\/form>/gs, '<p><em>[Skjema fjernet i statisk versjon]</em></p>');
  cleaned = cleaned.replace(/class="[^"]*gform[^"]*"/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

function pageToFilename(slug) {
  if (slug === 'hovedside') return 'index.html';
  return `${slug}.html`;
}

// ── Build HTML template ──
function buildPage(title, content, isIndex = false) {
  const decodedTitle = decodeHtml(title);
  const decodedContent = rewriteLinks(stripWpMarkup(decodeHtml(content)));

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${decodedTitle} — Autoglass AS (Mirror)</title>
<meta name="robots" content="noindex, nofollow">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; color: #212529; line-height: 1.6; }
  .banner { background: #0d1b2a; color: #f5c518; padding: 12px 20px; text-align: center; font-size: 14px; position: sticky; top: 0; z-index: 100; }
  .banner a { color: #f5c518; text-decoration: underline; font-weight: 600; }
  header { background: #1b263b; color: #fff; padding: 20px; border-bottom: 3px solid #f5c518; }
  header h1 { font-size: 24px; }
  header h1 a { color: #fff; text-decoration: none; }
  header h1 span { color: #f5c518; }
  nav { background: #415a77; padding: 10px 20px; }
  nav a { color: #e0e1dd; text-decoration: none; margin-right: 16px; font-size: 14px; }
  nav a:hover { color: #f5c518; }
  main { max-width: 900px; margin: 0 auto; padding: 40px 20px; background: #fff; min-height: 60vh; }
  main h1, main h2, main h3 { color: #1b263b; margin: 24px 0 12px; }
  main h1 { font-size: 32px; border-bottom: 2px solid #f5c518; padding-bottom: 8px; }
  main p { margin-bottom: 16px; }
  main img { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }
  main ul, main ol { margin-left: 24px; margin-bottom: 16px; }
  main a { color: #415a77; }
  main a:hover { color: #f5c518; }
  footer { background: #1b263b; color: #e0e1dd; padding: 30px 20px; text-align: center; font-size: 14px; margin-top: 40px; }
  @media (max-width: 600px) { main { padding: 20px 16px; } nav a { display: inline-block; margin-bottom: 8px; } }
</style>
</head>
<body>

<div class="banner">
  ⚠️ Denne siden er en midlertidig mirror under utvikling. Besøk vår nye side:
  <a href="https://autoglass-frontend.pages.dev" target="_blank">autoglass-frontend.pages.dev →</a>
</div>

<header>
  <h1><a href="index.html">Autoglass<span>.</span>AS</a></h1>
</header>

<nav>
  <a href="index.html">Hjem</a>
  <a href="om-oss.html">Om oss</a>
  <a href="bli-kunde.html">Bli kunde</a>
  <a href="kundeservice.html">Kontakt</a>
  <a href="aktuelt.html">Aktuelt</a>
  <a href="personvern.html">Personvern</a>
  <a href="vilkar-betingelser.html">Vilkår</a>
</nav>

<main>
${decodedContent || '<p><em>[Innhold ikke tilgjengelig i statisk versjon]</em></p>'}
</main>

<footer>
  <p>© Autoglass AS — Midlertidig mirror. Besøk <a href="https://autoglass-frontend.pages.dev" style="color:#f5c518">vår nye side</a>.</p>
</footer>

</body>
</html>`;
}

// ── Build blog listing page ──
function buildBlogList(posts) {
  let content = '<h1>Aktuelt</h1><p>Nyheter og oppdateringer fra Autoglass AS.</p>';
  content += '<div style="margin-top:32px">';

  for (const p of posts) {
    const title = decodeHtml(p.title.rendered);
    const excerpt = decodeHtml(p.excerpt.rendered.replace(/<[^>]*>/g, '')).substring(0, 200);
    const date = p.date ? p.date.substring(0, 10) : '';
    const slug = p.slug || `post-${p.id}`;

    content += `
      <article style="margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid #dee2e6">
        <h2><a href="${slug}.html">${title}</a></h2>
        <p style="color:#6c757d;font-size:14px;margin:8px 0">${date}</p>
        <p>${excerpt}...</p>
        <a href="${slug}.html">Les mer →</a>
      </article>`;
  }

  content += '</div>';
  return buildPage('Aktuelt', content);
}

// ── Main ──
console.log('🔨 Bygger statisk mirror...\n');

fs.mkdirSync(DIST_DIR, { recursive: true });

// Load data
const pages = JSON.parse(fs.readFileSync(`${SCRAPE_DIR}/pages.json`, 'utf-8'));
const posts = JSON.parse(fs.readFileSync(`${SCRAPE_DIR}/posts.json`, 'utf-8'));

// Build pages
for (const p of pages) {
  const slug = p.slug;
  const filename = pageToFilename(slug);
  const title = p.title.rendered;
  let content = p.content.rendered;

  // Special: Aktuelt page has no content — generate blog listing
  if (slug === 'aktuelt' && !content.trim()) {
    const html = buildBlogList(posts);
    fs.writeFileSync(path.join(DIST_DIR, filename), html);
    console.log(`  ✓ ${filename} (blog listing)`);
    continue;
  }

  // Special: WooCommerce pages
  if (['handlekurv', 'kassen', 'min-konto'].includes(slug)) {
    content = `<h1>${title}</h1><p>Denne funksjonen er ikke tilgjengelig i den midlertidige versjonen. Besøk <a href="https://auto-glass.no">auto-glass.no</a> for full funksjonalitet.</p>`;
  }

  const html = buildPage(title, content, slug === 'hovedside');
  fs.writeFileSync(path.join(DIST_DIR, filename), html);
  console.log(`  ✓ ${filename} (${content.length} bytes)`);
}

// Build individual blog posts
for (const p of posts) {
  const slug = p.slug || `post-${p.id}`;
  if (!slug) continue;
  const filename = `${slug}.html`;
  const title = p.title.rendered;
  const content = p.content.rendered;

  const html = buildPage(title, content);
  fs.writeFileSync(path.join(DIST_DIR, filename), html);
  console.log(`  ✓ ${filename} (blog post)`);
}

// Build "Under utvikling" page
const underUtvikling = buildPage('Under utvikling',
  '<h1>Under utvikling</h1><p>Denne funksjonen er ikke tilgjengelig i den midlertidige versjonen. Besøk vår nye side: <a href="https://autoglass-frontend.pages.dev">autoglass-frontend.pages.dev</a></p>');
fs.writeFileSync(path.join(DIST_DIR, 'under-utvikling.html'), underUtvikling);
console.log(`  ✓ under-utvikling.html`);

// Copy media files
const mediaSrc = path.join(SCRAPE_DIR, 'media-files');
const mediaDst = path.join(DIST_DIR, 'media');
if (fs.existsSync(mediaSrc)) {
  fs.mkdirSync(mediaDst, { recursive: true });
  for (const file of fs.readdirSync(mediaSrc)) {
    fs.copyFileSync(path.join(mediaSrc, file), path.join(mediaDst, file));
  }
  console.log(`  ✓ media/ (${fs.readdirSync(mediaSrc).length} files)`);
}

// Write _redirects
const redirects = `# WooCommerce paths → under utvikling
/shop/*              /under-utvikling.html   302
/handlekurv/*        /under-utvikling.html   302
/kassen/*            /under-utvikling.html   302
/min-konto/*         /under-utvikling.html   302
`;
fs.writeFileSync(path.join(DIST_DIR, '_redirects'), redirects);
console.log(`  ✓ _redirects`);

console.log(`\n✅ Mirror ferdig! ${DIST_DIR}/`);
console.log(`   Sider: ${pages.length}, Blogginnlegg: ${posts.length}`);
