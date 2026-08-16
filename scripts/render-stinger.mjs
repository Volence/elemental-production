#!/usr/bin/env node
/**
 * Renders overlays/stinger-transition.html to a VP9 WebM WITH ALPHA, for use in
 * OBS's native "Stinger" scene transition (which needs a media file, not an HTML
 * scene). The HTML page stays the master reference — re-run this script whenever
 * the stinger art changes and commit the regenerated public/stinger-transition.webm.
 *
 * Usage:
 *   node scripts/render-stinger.mjs [--fps 60] [--duration 2000]
 *                                   [--out public/stinger-transition.webm]
 *                                   [--keep-frames] [--http] [--port 3607]
 *
 * Requires: google-chrome-stable (headless, CDP) + ffmpeg/ffprobe with
 * libvpx-vp9 and yuva420p.
 * Optional: ImageMagick (`magick` or `convert`) for the per-frame alpha-coverage
 * scan that measures the OBS "Transition Point" and gates the encode. Without it
 * the script still renders but falls back to DEFAULT_TRANSITION_POINT_MS and can
 * only do a crude blank-frame check.
 *
 * No npm dependencies: Node >= 22 gives us global WebSocket + fetch, and CDP is
 * just JSON over that socket.
 *
 * CAPTURE RECIPE (the load-bearing part): --virtual-time-budget does NOT
 * reliably scrub compositor-driven CSS animations — it advances timers, but the
 * screenshot you get back is whatever the compositor last committed. Instead we
 * let the page load normally, then for each frame pause every animation via
 * document.getAnimations() and set currentTime explicitly. Combined with
 * Emulation.setDefaultBackgroundColorOverride(alpha 0) that yields a
 * deterministic, alpha-preserving frame sequence.
 *
 * THE RECIPE DEPENDS ON `animation-fill-mode: both` (the `both` in every
 * `animation:` shorthand in stinger-transition.html). Finished animations with
 * fill:none are removed from the timeline, so by the time we settle for 1.5s
 * after load, document.getAnimations() would return [] — there would be nothing
 * to pause or scrub, and the probe below would report `animations: 0` and blame
 * asset loading. If you ever drop `both` from those keyframes, this script stops
 * working and the error message will point you in the wrong direction.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, renameSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The stinger animation is 1.1s; we render a slightly longer window so the WebM
// ends on verified-transparent frames (OBS holds the last frame briefly).
const DEFAULT_DURATION_MS = 2000; // 1.8s animation + verified-transparent tail
const DEFAULT_FPS = 60;
// Fallback only — the coverage scan below measures the real value. Peak coverage
// lands inside the trail band's 42-58% sweep of a 1.1s timeline. Also used as the
// "this frame must not be blank" probe point.
const DEFAULT_TRANSITION_POINT_MS = 900; // fallback only — the coverage scan prints the measured value
const MAX_WEBM_BYTES = 5 * 1024 * 1024;
const CDP_TIMEOUT_MS = 15000;

/* ── Args ───────────────────────────────────────────────────────────────────
   Parsed and validated BEFORE any temp dir or child process exists, so a typo
   costs nothing. Unknown flags are fatal — silently ignoring `--frames 90`
   would hand back a file that doesn't match what was asked for. */
const VALUE_FLAGS = new Set(['fps', 'duration', 'out', 'port']);
const BOOL_FLAGS = new Set(['keep-frames', 'http']);

function usage(msg) {
  console.error(`✗ ${msg}\n`);
  console.error('Usage: node scripts/render-stinger.mjs [--fps N] [--duration MS] [--out FILE]');
  console.error('                                       [--keep-frames] [--http] [--port N]');
  process.exit(2);
}

const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith('--')) usage(`unexpected argument "${token}"`);
  const eq = token.indexOf('=');
  const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
  if (VALUE_FLAGS.has(name)) {
    const value = eq === -1 ? process.argv[++i] : token.slice(eq + 1);
    if (value === undefined || value.startsWith('--')) usage(`--${name} needs a value`);
    opts[name] = value;
  } else if (BOOL_FLAGS.has(name)) {
    if (eq !== -1) usage(`--${name} takes no value`);
    opts[name] = true;
  } else {
    usage(`unknown flag "${token}"`);
  }
}

const FPS = Number(opts.fps ?? DEFAULT_FPS);
const DURATION_MS = Number(opts.duration ?? DEFAULT_DURATION_MS);
const PORT = Number(opts.port ?? 3607);
if (!Number.isFinite(FPS) || FPS <= 0) usage(`--fps must be a positive number (got "${opts.fps}")`);
if (!Number.isFinite(DURATION_MS) || DURATION_MS <= 0) usage(`--duration must be a positive number of ms (got "${opts.duration}")`);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) usage(`--port must be a valid port (got "${opts.port}")`);

const FRAMES = Math.ceil((DURATION_MS / 1000) * FPS);
if (FRAMES < 1) usage(`--duration ${DURATION_MS} at --fps ${FPS} yields no frames`);
const OUT = resolve(REPO, opts.out ?? 'public/stinger-transition.webm');
// Frame index the blank-frame check probes, derived from the render window so a
// shorter --duration can't index past the end.
const SANITY_FRAME = Math.min(FRAMES - 1, Math.round((DEFAULT_TRANSITION_POINT_MS / 1000) * FPS));

const framesDir = mkdtempSync(join(tmpdir(), 'stinger-frames-'));
const profileDir = mkdtempSync(join(tmpdir(), 'stinger-profile-'));
const framePath = i => join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);

const cleanups = [];
function cleanup() {
  while (cleanups.length) {
    try { cleanups.pop()(); } catch { /* best effort */ }
  }
  rmSync(profileDir, { recursive: true, force: true });
  if (opts['keep-frames']) console.log(`  frames kept in ${framesDir}`);
  else rmSync(framesDir, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Alpha coverage ─────────────────────────────────────────────────────────
   "Coverage" = mean alpha of a frame (0 = fully transparent, 1 = fully opaque).
   OBS's Transition Point is the moment the outgoing scene should be swapped for
   the incoming one, i.e. the frame where the stinger hides the most. */
const IM = ['magick', 'convert'].find(bin => spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0);

/** Mean alpha of a PNG, or null when ImageMagick isn't installed at all.
 *  An ImageMagick that IS installed but fails on a frame is fatal — treating
 *  that as "no scanner" would silently skip every verification below. */
function coverage(file) {
  if (!IM) return null;
  // IM6 `convert` and IM7 `magick` take the same argument form here.
  const r = spawnSync(IM, [file, '-alpha', 'extract', '-format', '%[fx:mean]', 'info:'], { encoding: 'utf8' });
  const v = parseFloat((r.stdout || '').trim());
  if (r.error || r.status !== 0 || !Number.isFinite(v)) {
    fail(`${IM} could not measure alpha of ${basename(file)}: ${(r.stderr || r.error?.message || `exit ${r.status}`).toString().trim()}`);
  }
  return v;
}

/* ── CDP plumbing ─────────────────────────────────────────────────────────── */
async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP socket failed to open'));
  });

  let id = 0;
  let dead = null;
  let expectClose = false;
  const pending = new Map();
  const events = [];

  /** Fail every in-flight request at once. Without this, a Chrome crash or a
   *  dropped socket leaves the awaiting promise unsettled and the script hangs
   *  until someone notices. */
  const die = why => {
    if (dead || expectClose) return;
    dead = new Error(why);
    for (const p of pending.values()) p.reject(dead);
    pending.clear();
  };

  ws.onclose = () => die('CDP socket closed unexpectedly (did Chrome crash?)');
  ws.onerror = () => die('CDP socket error');
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const p = msg.id && pending.get(msg.id);
    if (p) { pending.delete(msg.id); p.resolve(msg); }
    else if (msg.method) events.push(msg);
  };

  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    if (dead) return rej(dead);
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      rej(new Error(`CDP call timed out after ${CDP_TIMEOUT_MS}ms: ${method}`));
    }, CDP_TIMEOUT_MS);
    pending.set(i, {
      resolve: msg => {
        clearTimeout(timer);
        if (msg.error) rej(new Error(`${method}: ${msg.error.message}`));
        else res(msg.result);
      },
      reject: err => { clearTimeout(timer); rej(err); },
    });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

  const close = () => { expectClose = true; ws.close(); };
  return { ws, send, events, die, close };
}

/** Runtime.evaluate + the exceptionDetails check CDP won't do for you: a page
 *  that throws still comes back as a *successful* protocol response. */
async function evaluate(s, expression, extra = {}) {
  const r = await s('Runtime.evaluate', { expression, ...extra });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    const text = d.exception?.description || d.exception?.value || d.text || 'unknown page error';
    throw new Error(`page threw while evaluating: ${text}`);
  }
  return r.result;
}

async function launchChrome(url) {
  const chrome = spawn('google-chrome-stable', [
    '--headless=new', '--remote-debugging-port=0', '--window-size=1920,1080',
    '--allow-file-access-from-files', '--hide-scrollbars', '--disable-gpu-vsync',
    '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--mute-audio',
    `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  cleanups.push(() => chrome.kill('SIGKILL'));

  let stderr = '';
  const wsUrl = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`chrome did not expose CDP within 20s:\n${stderr}`)), 20000);
    // ENOENT etc. surface as 'error', never as 'exit'.
    chrome.on('error', err => { clearTimeout(timer); rej(new Error(`could not run google-chrome-stable: ${err.message}`)); });
    chrome.stderr.on('data', d => {
      stderr += d.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
    chrome.on('exit', c => { clearTimeout(timer); rej(new Error(`chrome exited (${c}) before exposing CDP:\n${stderr}`)); });
  });

  const cdp = await connectCdp(wsUrl);
  // Stays armed for the whole run: nothing else kills a Chrome that dies on its
  // own, so without this the next CDP call would just sit there.
  chrome.on('exit', c => cdp.die(`chrome exited mid-render (code ${c}):\n${stderr.slice(-2000)}`));

  const { targetInfos } = await cdp.send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page');
  if (!page) throw new Error('chrome exposed no page target');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Network.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  const loaded = new Promise(res => {
    const t = setInterval(() => {
      if (cdp.events.some(e => e.method === 'Page.loadEventFired')) { clearInterval(t); res(); }
    }, 50);
    setTimeout(() => { clearInterval(t); res(); }, 15000);
  });
  await s('Page.navigate', { url });
  await loaded;
  // Fonts (@font-face woff2) + pinwheel.js building two 1900px SVGs.
  await sleep(1500);

  const failures = cdp.events
    .filter(e => e.method === 'Network.loadingFailed' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map(e => (e.params.entry ? e.params.entry.text : `${e.params.type} load failed: ${e.params.errorText}`));

  return { chrome, cdp, s, failures };
}

/** Sanity probe: the page must have the 4 stinger animations and both pinwheel SVGs. */
async function probe(s) {
  const result = await evaluate(s, `JSON.stringify({
    animations: document.getAnimations().length,
    svgA: document.querySelectorAll('#stg-pinwheel-a svg').length,
    svgB: document.querySelectorAll('#stg-pinwheel-b svg').length,
    paths: document.querySelectorAll('#stg-stage svg path').length,
    fontLoaded: document.fonts.check('800 96px "Geist Sans"')
  })`, { returnByValue: true });
  if (typeof result.value !== 'string') throw new Error(`probe returned ${JSON.stringify(result.value)} instead of JSON`);
  return JSON.parse(result.value);
}

async function captureFrames(s) {
  for (let i = 0; i < FRAMES; i++) {
    const t = (i * 1000) / FPS;
    await evaluate(s, `document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = ${t}; });`);
    await sleep(20); // let the compositor commit the scrubbed frame
    const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(framePath(i), Buffer.from(data, 'base64'));
  }
}

/* ── Render ─────────────────────────────────────────────────────────────── */
const fileUrl = 'file://' + join(REPO, 'overlays', 'stinger-transition.html');
const httpUrl = `http://localhost:${PORT}/overlays/stinger-transition.html`;

async function startServer() {
  const userData = mkdtempSync(join(tmpdir(), 'stinger-userdata-'));
  const server = spawn(process.execPath, [join(REPO, 'server', 'server.js')], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), ELEMENTAL_USER_DATA: userData },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  cleanups.push(() => { server.kill('SIGKILL'); rmSync(userData, { recursive: true, force: true }); });

  let stderr = '';
  let exited = null;
  server.stderr.on('data', d => { stderr += d.toString(); });
  server.on('error', err => { exited = `could not spawn the server: ${err.message}`; });
  server.on('exit', c => { exited = `server exited early (code ${c})`; });

  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (exited) throw new Error(`${exited}\n${stderr.slice(-2000)}`);
    try {
      // /api/state proves it's OUR server on that port, not some other process
      // that happened to be listening — a stale dev server would otherwise be
      // rendered against silently.
      const r = await fetch(`http://localhost:${PORT}/api/state`, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      const state = await r.json();
      if (!state || typeof state !== 'object' || !('teams' in state)) {
        throw new Error(`something else is already listening on :${PORT} (/api/state is not an Elemental state object)`);
      }
      return;
    } catch (err) {
      if (/already listening/.test(err.message)) throw err;
      /* not up yet */
    }
  }
  throw new Error(`server did not come up on :${PORT} within 15s\n${stderr.slice(-2000)}`);
}

async function render(url) {
  console.log(`→ Rendering ${url}`);
  const { chrome, cdp, s, failures } = await launchChrome(url);
  const done = () => { cdp.close(); chrome.kill('SIGKILL'); };
  try {
    const info = await probe(s);
    console.log(`  animations=${info.animations} pinwheelPaths=${info.paths} font=${info.fontLoaded ? 'loaded' : 'MISSING'}`);
    if (failures.length) console.log(`  page errors: ${failures.slice(0, 5).join(' | ')}`);
    const ok = info.animations >= 4 && info.svgA === 1 && info.svgB === 1 && info.paths >= 16 && info.fontLoaded;
    if (!ok) return { ok: false, reason: `assets did not load (${JSON.stringify(info)})` };
    await captureFrames(s);
    return { ok: true };
  } finally {
    done();
  }
}

// file:// works because every asset the page pulls (theme-v2.css, fonts-v2.css,
// ./fonts/*.woff2, pinwheel.js) is a relative sibling. --http forces the express
// route instead, which is also the automatic fallback if that ever stops holding.
let result = opts.http
  ? { ok: false, reason: '--http requested' }
  : await render(fileUrl).catch(err => ({ ok: false, reason: err.message }));
if (!result.ok) {
  console.log(`  file:// route unusable — ${result.reason}\n  falling back to the express server on :${PORT}`);
  await startServer();
  result = await render(httpUrl);
  if (!result.ok) fail(`http route also failed — ${result.reason}`);
}

/* ── Verify the captured frames before spending time on the encode ──────── */
const cov = [];
for (let i = 0; i < FRAMES; i++) cov.push(coverage(framePath(i)));
const haveCoverage = IM != null;

let transitionPointMs = DEFAULT_TRANSITION_POINT_MS;
if (haveCoverage) {
  let peak = 0;
  for (let i = 1; i < FRAMES; i++) if (cov[i] > cov[peak]) peak = i;
  transitionPointMs = Math.round((peak * 1000) / FPS);
  console.log(`\nAlpha coverage (mean alpha per frame):`);
  for (let i = 0; i < FRAMES; i += 6) {
    const bar = '█'.repeat(Math.round(cov[i] * 40));
    console.log(`  ${String(Math.round((i * 1000) / FPS)).padStart(4)}ms ${cov[i].toFixed(3)} ${bar}`);
  }
  console.log(`  peak: frame ${peak} = ${transitionPointMs}ms (coverage ${cov[peak].toFixed(3)})`);

  if (cov[0] > 0.001) fail(`frame 0 is not transparent (coverage ${cov[0].toFixed(4)})`);
  if (cov[FRAMES - 1] > 0.001) fail(`last frame is not transparent (coverage ${cov[FRAMES - 1].toFixed(4)})`);
  if (cov[SANITY_FRAME] < 0.05) {
    fail(`mid-animation frame ${SANITY_FRAME} is blank (coverage ${cov[SANITY_FRAME].toFixed(4)}) — the scrub did not take`);
  }
} else {
  console.log(`\n! ImageMagick (magick/convert) not found — skipping the coverage scan and the`);
  console.log(`  encoded-file round-trip; using the ${DEFAULT_TRANSITION_POINT_MS}ms default transition point.`);
  const mid = statSync(framePath(SANITY_FRAME)).size;
  const first = statSync(framePath(0)).size;
  if (mid <= first * 2) fail(`mid-animation frame ${SANITY_FRAME} looks blank (same size as the transparent first frame)`);
}

/* ── Encode ─────────────────────────────────────────────────────────────────
   Into a temp file: every assertion below has to pass before we're allowed to
   replace the committed artifact. Encoding straight onto OUT would mean one
   failed check destroys a known-good WebM. The temp file sits NEXT TO the
   output (not in /tmp) so the final rename is same-filesystem and atomic —
   /tmp is usually tmpfs, where rename would fail with EXDEV. */
mkdirSync(dirname(OUT), { recursive: true });
// Keeps the real extension last — ffmpeg picks the muxer from it.
const tmpOut = join(dirname(OUT), `.${basename(OUT, extname(OUT))}.tmp${extname(OUT) || '.webm'}`);
cleanups.push(() => rmSync(tmpOut, { force: true }));
const enc = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'warning',
  '-framerate', String(FPS), '-i', join(framesDir, 'frame_%04d.png'),
  '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24',
  '-auto-alt-ref', '0', tmpOut,
], { stdio: ['ignore', 'ignore', 'inherit'] });
if (enc.error) fail(`could not run ffmpeg: ${enc.error.message}`);
if (enc.status !== 0 || !existsSync(tmpOut)) fail(`ffmpeg encode failed (exit ${enc.status})`);

const pr = spawnSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name,width,height,pix_fmt:stream_tags=alpha_mode:format=duration',
  '-of', 'default=nw=1', tmpOut,
], { encoding: 'utf8' });
if (pr.error) fail(`could not run ffprobe: ${pr.error.message}`);
if (pr.status !== 0) fail(`ffprobe failed (exit ${pr.status}): ${(pr.stderr || '').trim()}`);
const probeOut = (pr.stdout || '').trim();
const size = statSync(tmpOut).size;

console.log(`\nEncoded:`);
console.log(probeOut.split('\n').map(l => `  ${l}`).join('\n'));
console.log(`  size=${(size / 1024 / 1024).toFixed(2)} MB`);
if (size > MAX_WEBM_BYTES) fail(`webm is ${(size / 1024 / 1024).toFixed(2)} MB (budget ${MAX_WEBM_BYTES / 1024 / 1024} MB)`);
if (!/codec_name=vp9/.test(probeOut)) fail('encoded file is not VP9');
if (!/^width=1920$/m.test(probeOut) || !/^height=1080$/m.test(probeOut)) fail('encoded file is not 1920x1080');
// VP9-in-WebM keeps alpha in a separate BlockAdditional layer, so ffprobe reports
// the *primary* plane as yuv420p and flags the alpha layer with TAG:alpha_mode=1.
if (!/pix_fmt=yuva420p/.test(probeOut) && !/alpha_mode=1/.test(probeOut)) fail('encoded file has no alpha channel');

/* ── Round-trip the ENCODED file: alpha must survive the encode ─────────── */
if (haveCoverage) {
  const decodeDir = mkdtempSync(join(tmpdir(), 'stinger-decode-'));
  cleanups.push(() => rmSync(decodeDir, { recursive: true, force: true }));
  const decoded = n => {
    const png = join(decodeDir, `dec_${n}.png`);
    // -c:v libvpx-vp9 is required: the native VP9 decoder drops the alpha layer.
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', tmpOut,
      '-vf', `select=eq(n\\,${n})`, '-fps_mode', 'passthrough', '-frames:v', '1',
      '-pix_fmt', 'rgba', png], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.error || r.status !== 0) fail(`could not decode frame ${n} back out of the webm`);
    return coverage(png);
  };
  const peakFrame = Math.min(FRAMES - 1, Math.round((transitionPointMs / 1000) * FPS));
  const [a0, aMid, aEnd] = [decoded(0), decoded(peakFrame), decoded(FRAMES - 1)];
  console.log(`  round-trip alpha: frame 0 = ${a0.toFixed(3)}, frame ${peakFrame} = ${aMid.toFixed(3)}, frame ${FRAMES - 1} = ${aEnd.toFixed(3)}`);
  if (a0 > 0.002 || aEnd > 0.002) fail('encoded first/last frame is not transparent');
  if (aMid < 0.05) fail('encoded mid frame lost its alpha content');
}

/* ── Ship it (only now that everything passed) ──────────────────────────── */
renameSync(tmpOut, OUT);
console.log(`\n✓ ${OUT}`);

console.log(`\nOBS: Scene Transitions dock → + → Stinger → this file → Transition Point: ${transitionPointMs} ms`);
console.log('(Keep that number in sync with src/pages/Settings.jsx and README.md.)');

// Explicit: the CDP WebSocket leaves a live handle behind even after close(),
// so the event loop would otherwise keep this process alive after the work is done.
cleanup();
process.exit(0);
