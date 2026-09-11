// Prove the share pages never hand off to the app on their own.
//
// On 2026-09-11 an iPhone opened /c/sep-21 and got a modal on top of the page —
// "Safari cannot open the page because the address is invalid" — because the
// page navigated to sidequesting:// two tenths of a second after load and the
// phone had no app to answer it. That is the whole audience of a shared link:
// people who do not have the app yet.
//
// The script is small enough to run against a stub DOM, so the rule is checked
// rather than remembered. Run after touching c/index.html or q/index.html:
//   node tools/check-link-pages.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const APP_STORE = 'https://apps.apple.com/us/app/sidequesting-club/id6801703458';
const PLAY = 'https://play.google.com/store/apps/details?id=club.sidequesting.app';

/** Run a page's last <script> with just enough DOM for it to finish. */
function run(file, url, ua) {
  const html = readFileSync(file, 'utf8');
  const js = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/^<script>|<\/script>$/g, '');
  const nav = [];        // every location.href the page sets, in order
  const timers = [];     // [ms, fn] — armed, never fired unless a test says so
  const handlers = {};
  const els = {};
  const el = (id) => ({
    id, style: {}, hidden: true, textContent: '',
    href: id === 'ios' ? APP_STORE : id === 'android' ? PLAY : '#',
    addEventListener: (ev, fn) => { (handlers[id] ||= {})[ev] = fn; },
  });
  const u = new URL(url);
  const ctx = {
    navigator: { userAgent: ua },
    document: {
      visibilityState: 'visible',
      getElementById: (id) => (els[id] ||= el(id)),
      title: '',
    },
    location: { get href() { return url; }, set href(v) { nav.push(v); }, search: u.search, pathname: u.pathname },
    URLSearchParams, URL, Date, Math, JSON, console, encodeURIComponent,
    fetch: () => new Promise(() => {}),   // the lookup only fills in copy
    setTimeout: (fn, ms) => timers.push([ms, fn]),
  };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { nav, timers, handlers, els, ctx };
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

for (const [file, url] of [
  ['c/index.html', 'https://sidequesting.club/c/?s=sep-21'],
  ['q/index.html', 'https://sidequesting.club/q/?s=watch-the-sunrise&id=00000000-0000-0000-0000-000000000000'],
]) {
  console.log(`\n${file}  (iPhone)`);
  const r = run(file, url, IOS_UA);
  check('nothing navigates on load', r.nav.length === 0, JSON.stringify(r.nav));
  check('nothing is scheduled to navigate later', r.timers.length === 0);
  check('the button is aimed at the app', /^sidequesting:\/\/\w/.test(r.els.open.href), r.els.open.href);

  r.handlers.open.click({ preventDefault() {} });
  check('a tap tries the app first', r.nav.length === 1 && r.nav[0] === r.els.open.href, JSON.stringify(r.nav));
  check('and arms a second route', r.timers.length === 1);
  r.timers[0][1]();
  check('still here after the app did not open → the store', r.nav[1] === APP_STORE, String(r.nav[1]));

  const gone = run(file, url, IOS_UA);
  gone.handlers.open.click({ preventDefault() {} });
  gone.ctx.document.visibilityState = 'hidden';   // the app took the screen
  gone.timers[0][1]();
  check('the app opened → no store on top of it', gone.nav.length === 1, JSON.stringify(gone.nav));
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
