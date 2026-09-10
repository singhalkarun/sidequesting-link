// Build a REAL page for every shareable link, so a crawler gets a 200.
//
// The problem this solves, found 2026-09-10: /c/<slug> and /q/<slug> are not
// files, so GitHub Pages answered them with 404.html — status 404. A link
// crawler reads the status code, sees an error, and draws no preview card. It
// never runs the redirect script that makes the link work for a person. So
// every quest and challenge ever shared arrived as a bare URL.
//
// og: tags on c/index.html and q/index.html could not fix that: the crawler
// never reached those files. Nor can JavaScript fill them in — crawlers do not
// run it. The values have to be in the HTML of a page that answers 200.
//
// This writes one static page per item, with its real title and description
// baked into the og: tags. /c/<slug> and /q/<slug> then 301 to them, which
// crawlers do follow, so links already shared start working with no app
// release.
//
// A quest page also bakes in the quest's id. The app routes quests by id, so a
// slug link used to wait on a Supabase round-trip before it could open the
// app; now the deep link fires immediately.
//
// c/index.html and q/index.html stay as the ?s= fallback for anything not
// built here (a brand-new quest, a draft challenge someone was given a link to).
//
// Run after publishing a challenge or adding/retiring a quest:
//   node build-link-pages.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Read the keys out of the page itself so there is one copy of them, not three. */
function creds(file) {
  const src = readFileSync(file, 'utf8');
  return {
    src,
    ANON: src.match(/ANON\s*=\s*'([^']+)'/)[1],
    SUPABASE: src.match(/SUPABASE\s*=\s*'([^']+)'/)[1],
  };
}

async function rows(SUPABASE, ANON, path) {
  const r = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`query failed ${r.status}: ${path}`);
  return r.json();
}

/**
 * Swap the head tags. Every replace is asserted, because a silent no-match here
 * ships a generic card and nobody notices until someone says "it's just a link".
 */
function head(src, { title, desc, url, image }) {
  const subs = [
    [/<title>[^<]*<\/title>/, `<title>${esc(title)} — SideQuesting</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`],
    [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`],
  ];
  let out = src;
  for (const [re, to] of subs) {
    if (!re.test(out)) throw new Error(`head tag not found: ${re}`);
    out = out.replace(re, to);
  }
  return out.replace(
    /<meta name="twitter:card" content="[^"]*">/,
    `<meta name="twitter:card" content="summary_large_image">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<link rel="canonical" href="${url}">`
  );
}

/** Delete generated subdirectories that no longer correspond to a live item. */
function prune(dir, keep) {
  if (!existsSync(dir)) return [];
  const gone = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !keep.has(e.name))
    .map((e) => e.name);
  for (const name of gone) rmSync(`${dir}/${name}`, { recursive: true, force: true });
  return gone;
}

// The brand card — "Do hard things. Every day." Correct for a quest, wrong for
// the challenge, which is about walking and has a photograph of its own.
const OG = 'https://sidequesting.club/og.jpg';

// The challenge hero, the same photograph the app shows on the challenge page,
// cropped from 1290x750 to the 1200x630 that unfurlers want. Built by
// tools/build-og-challenge.py; the walkers sit high in the frame so the crop
// comes off the bottom (cobblestone), never off them.
const OG_CHALLENGE = 'https://sidequesting.club/og-challenge.jpg';

// The quest covers in the database are picsum.photos placeholders, not
// photographs of anything in particular. A random stock image on a card is
// worse than the brand image, so quests keep OG until real covers exist.

// ─── challenges ──────────────────────────────────────────────────────────────
{
  const { src, ANON, SUPABASE } = creds('c/index.html');
  const list = await rows(
    SUPABASE,
    ANON,
    'challenges?select=slug,title,prize_paise,starts_on,ends_on&published_at=not.is.null'
  );
  if (!list.length) throw new Error('no published challenges — refusing to write nothing');
  if (!src.includes("last !== 'c'")) throw new Error('path-derived slug logic gone from c/index.html');

  const inr = (p) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
  const day = (s, o) => new Date(s).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...o });

  for (const ch of list) {
    const sameMonth = new Date(ch.starts_on).getMonth() === new Date(ch.ends_on).getMonth();
    const range = sameMonth
      ? `${day(ch.starts_on, { day: 'numeric' })}–${day(ch.ends_on, { day: 'numeric', month: 'long' })}`
      : `${day(ch.starts_on, { day: 'numeric', month: 'short' })} – ${day(ch.ends_on, { day: 'numeric', month: 'short' })}`;

    const out = head(src, {
      title: `${ch.title} — free walking challenge`,
      desc: `Walk more than your usual day, ${range}. Free to enter, one winner takes ${inr(ch.prize_paise)}.`,
      url: `https://sidequesting.club/c/${ch.slug}/`,
      image: OG_CHALLENGE,
    });
    if (!out.includes(esc(inr(ch.prize_paise)))) throw new Error(`prize missing from og: for ${ch.slug}`);
    if (!out.includes(OG_CHALLENGE)) throw new Error(`challenge og:image not set for ${ch.slug}`);

    mkdirSync(`c/${ch.slug}`, { recursive: true });
    writeFileSync(`c/${ch.slug}/index.html`, out);
    console.log(`c/${ch.slug}/  ${inr(ch.prize_paise)}  ${range}`);
  }
  const gone = prune('c', new Set(list.map((c) => c.slug)));
  if (gone.length) console.log(`  pruned unpublished: ${gone.join(', ')}`);
}

// ─── quests ──────────────────────────────────────────────────────────────────
{
  const { src, ANON, SUPABASE } = creds('q/index.html');
  const list = await rows(
    SUPABASE,
    ANON,
    'quests?select=id,slug,title,description&is_active=eq.true&slug=not.is.null&order=created_at.desc'
  );
  if (!list.length) throw new Error('no active quests — refusing to write nothing');
  if (!src.includes("last !== 'q'")) throw new Error('path-derived slug logic gone from q/index.html');

  let n = 0;
  for (const q of list) {
    if (!q.description) throw new Error(`quest ${q.slug} has no description to put on the card`);

    let out = head(src, {
      title: q.title,
      desc: q.description,
      url: `https://sidequesting.club/q/${q.slug}/`,
      image: OG,
    });

    // The id is known at build time, so skip the slug→id lookup entirely and
    // let the deep link fire on load like the challenge page does.
    const anchor = "  var id = qs.get('id');";
    if (!out.includes(anchor)) throw new Error('id lookup line not found in q/index.html');
    out = out.replace(anchor, `${anchor}\n  if (!id) id = ${JSON.stringify(q.id)}; // baked by build-link-pages.mjs`);
    if (!out.includes(JSON.stringify(q.id))) throw new Error(`id not baked for ${q.slug}`);

    mkdirSync(`q/${q.slug}`, { recursive: true });
    writeFileSync(`q/${q.slug}/index.html`, out);
    n++;
  }
  console.log(`q/  ${n} quests`);
  const gone = prune('q', new Set(list.map((q) => q.slug)));
  if (gone.length) console.log(`  pruned inactive: ${gone.join(', ')}`);
}
