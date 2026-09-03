/**
 * Build-time SEO prerender step.
 *
 * The site is a client-rendered Vite/React SPA, so search engines and non-JS link-preview
 * bots (WhatsApp, Facebook, X/Twitter, iMessage, Slack, LinkedIn) only ever see the single
 * static index.html shell. This script runs after `vite build` and writes one static HTML
 * file per public route (reusing the already-built index.html as a template) with the
 * correct <title>, description, canonical, Open Graph, and Twitter Card tags baked in for
 * that route. React still mounts and renders the full interactive app on top of each file
 * exactly as before; only the initial <head> metadata differs per route.
 *
 * Output convention (`dist/<route>.html`) matches Vercel's `cleanUrls` resolution and
 * Express's `express.static(..., { extensions: ['html'] })` resolution, so `/about` resolves
 * to `dist/about.html` on both platforms without any routing/rewrite changes.
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { ALL_ROUTES } from '../src/data/brand';

const SITE_URL = 'https://dfabulous.co.uk';
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/hero/hero1.webp`;
const distDir = path.join(process.cwd(), 'dist');

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setOrInsertMeta(html: string, matchAttr: string, matchValue: string, content: string): string {
  const tagRegex = new RegExp(`<meta ${matchAttr}="${matchValue}"[^>]*>`, 'i');
  const tag = `<meta ${matchAttr}="${matchValue}" content="${escapeAttr(content)}" />`;
  if (tagRegex.test(html)) {
    return html.replace(tagRegex, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function setOrInsertLink(html: string, rel: string, href: string): string {
  const tagRegex = new RegExp(`<link rel="${rel}"[^>]*>`, 'i');
  const tag = `<link rel="${rel}" href="${escapeAttr(href)}" />`;
  if (tagRegex.test(html)) {
    return html.replace(tagRegex, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function buildPageHtml(baseHtml: string, route: { path: string; title: string; desc: string }): string {
  const url = `${SITE_URL}${route.path === '/' ? '' : route.path}`;
  let html = baseHtml;

  html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeAttr(route.title)}</title>`);
  html = setOrInsertMeta(html, 'name', 'description', route.desc);
  html = setOrInsertMeta(html, 'property', 'og:title', route.title);
  html = setOrInsertMeta(html, 'property', 'og:description', route.desc);
  html = setOrInsertMeta(html, 'property', 'og:image', DEFAULT_OG_IMAGE);
  html = setOrInsertMeta(html, 'property', 'og:url', url);
  html = setOrInsertMeta(html, 'name', 'twitter:title', route.title);
  html = setOrInsertMeta(html, 'name', 'twitter:description', route.desc);
  html = setOrInsertMeta(html, 'name', 'twitter:image', DEFAULT_OG_IMAGE);
  html = setOrInsertLink(html, 'canonical', url);

  return html;
}

async function main() {
  const baseHtml = await readFile(path.join(distDir, 'index.html'), 'utf-8');

  for (const route of ALL_ROUTES) {
    const html = buildPageHtml(baseHtml, route);
    const outputPath = route.path === '/' ? path.join(distDir, 'index.html') : path.join(distDir, `${route.path}.html`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf-8');
  }

  console.log(`[prerender-seo] Wrote ${ALL_ROUTES.length} route-specific HTML files with unique SEO metadata.`);
}

main().catch((error) => {
  console.error('[prerender-seo] Failed:', error);
  process.exit(1);
});
