// Prove the share pages can never produce an error the visitor did not ask for.
//
// On 2026-09-11 an iPhone opened /c/sep-21 and got a modal on top of the page —
// "Safari cannot open the page because the address is invalid" — because the
// page navigated to sidequesting:// two tenths of a second after load and the
// phone had no app to answer it. That is the whole audience of a shared link:
// people who do not have the app yet. Moving it behind a tap was not enough;
// the alert still came, so on iOS the app button is gone entirely and the App
// Store is the primary action. Both rules are asserted here, because both were
// learned from someone's screenshot.
//
// The script is small enough to run against a stub DOM, so the rules are
// checked rather than remembered. Run after touching c/index.html or
// q/index.html:
//   node tools/check-link-pages.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
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
  const gone = new Set();   // elements the page removed from the document
  const el = (id) => ({
    id, style: {}, hidden: true, textContent: '', className: '',
    href: id === 'ios' ? APP_STORE : id === 'android' ? PLAY : '#',
    addEventListener: (ev, fn) => { (handlers[id] ||= {})[ev] = fn; },
    remove: () => gone.add(id),
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
  return { nav, timers, handlers, els, ctx, gone };
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
  const ios = run(file, url, IOS_UA);
  check('nothing navigates on load', ios.nav.length === 0, JSON.stringify(ios.nav));
  check('nothing is scheduled to navigate later', ios.timers.length === 0);
  // The only control that can raise Safari's modal is a link to the scheme.
  // There is none: an iPhone with the app never reaches this page (the
  // Universal Link took it), and one without it is offered the store.
  check('the app button is gone', ios.gone.has('open'));
  check('the App Store is the primary action', ios.els.ios.className === 'btn primary');
  check('the Play badge is hidden', ios.els.android.style.display === 'none');

  console.log(`${file}  (Android)`);
  const and = run(file, url, ANDROID_UA);
  check('nothing navigates on load', and.nav.length === 0, JSON.stringify(and.nav));
  check('the app button is kept — /c is not claimed in the manifest yet', !and.gone.has('open'));
  // intent:// and not the bare scheme: Chrome follows the fallback instead of
  // answering an unhandled scheme with ERR_UNKNOWN_URL_SCHEME.
  const href = and.els.open.href;
  check('it hands off through an Android intent', href.startsWith('intent://'), href);
  check('with the app package named', href.includes('package=club.sidequesting.app'));
  check('and Play as the fallback', href.includes('S.browser_fallback_url=' + encodeURIComponent(PLAY)));
  check('the App Store badge is hidden', and.els.ios.style.display === 'none');
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
