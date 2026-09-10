// Generate a REAL page at /c/<slug>/ for every published challenge.
//
// Why this exists: /c/<slug> is not a file, so GitHub Pages answered it with
// 404.html — status 404, and no og tags on it at all. A human never noticed
// (404.html's script redirects them), but a link crawler is not a human. It
// reads the status code, sees 404, and shows a bare URL with no preview card.
//
// The invite travels on WhatsApp and the preview card is the only image anyone
// sees before deciding to tap, so "no card" is most of the invite gone.
//
// c/index.html stays as the ?s=<slug> fallback for any slug not built here.
// This writes a static sibling per published challenge with the prize and dates
// baked into the og: tags, because the crawler does not run JavaScript either.
//
// Run after publishing or editing a challenge:  node build-challenge-pages.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'c/index.html';
const src = readFileSync(SRC, 'utf8');
const ANON = src.match(/ANON\s*=\s*'([^']+)'/)[1];
const SUPABASE = src.match(/SUPABASE\s*=\s*'([^']+)'/)[1];

const res = await fetch(
  `${SUPABASE}/rest/v1/challenges?select=slug,title,prize_paise,starts_on,ends_on,draw_on` +
    `&published_at=not.is.null`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
);
if (!res.ok) throw new Error(`challenges query failed: ${res.status}`);
const rows = await res.json();
if (!rows.length) throw new Error('no published challenges — refusing to write nothing');

const inr = (p) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
const day = (s, o) => new Date(s).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...o });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

for (const ch of rows) {
  // Same sentence the app's invite uses, so the card and the message agree.
  const range =
    new Date(ch.starts_on).getMonth() === new Date(ch.ends_on).getMonth()
      ? `${day(ch.starts_on, { day: 'numeric' })}–${day(ch.ends_on, { day: 'numeric', month: 'long' })}`
      : `${day(ch.starts_on, { day: 'numeric', month: 'short' })} – ${day(ch.ends_on, { day: 'numeric', month: 'short' })}`;
  const title = `${ch.title} — free walking challenge`;
  const desc =
    `Walk more than your usual day, ${range}. ` +
    `Free to enter, one winner takes ${inr(ch.prize_paise)}.`;

  // No slug injection needed: the page already derives it from the last path
  // segment (`last !== 'c'`), which at /c/<slug>/ is exactly the slug. This
  // build exists for the og: tags and for the 200, not for the routing.
  let out = src
    .replace(
      /<meta property="og:title" content="[^"]*">/,
      `<meta property="og:title" content="${esc(title)}">`
    )
    .replace(
      /<meta property="og:description" content="[^"]*">/,
      `<meta property="og:description" content="${esc(desc)}">`
    )
    .replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${esc(desc)}">`
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(ch.title)} — SideQuesting</title>`)
    .replace(
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:card" content="summary_large_image">\n' +
        `<meta property="og:url" content="https://sidequesting.club/c/${ch.slug}/">\n` +
        '<meta property="og:type" content="website">\n' +
        '<link rel="canonical" href="https://sidequesting.club/c/' + ch.slug + '/">'
    );

  // Guard the assumptions this build rests on.
  if (!out.includes("last !== 'c'")) throw new Error('path-derived slug logic is gone from c/index.html');
  if (!out.includes(esc(inr(ch.prize_paise)))) throw new Error(`prize missing from og: for ${ch.slug}`);
  if (out.includes('og:description" content="Walk more than your usual day for a week.'))
    throw new Error(`og:description still generic for ${ch.slug}`);

  mkdirSync(`c/${ch.slug}`, { recursive: true });
  writeFileSync(`c/${ch.slug}/index.html`, out);
  console.log(`c/${ch.slug}/index.html  ${inr(ch.prize_paise)}  ${range}`);
}
