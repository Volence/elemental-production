#!/usr/bin/env node
/**
 * Renders overlays/stinger-transition.html to a VP9 WebM WITH ALPHA, for use in
 * OBS's native "Stinger" scene transition (which needs a media file, not an HTML
 * scene). The HTML page stays the master reference — re-run this script whenever
 * the stinger art changes and commit the regenerated public/stinger-transition.webm.
 *
 * Usage:
 *   node scripts/render-stinger.mjs [--fps 60] [--duration 1300]
 *                                   [--out public/stinger-transition.webm]
 *                                   [--keep-frames] [--http] [--port 3607]
 *
 * Requires: google-chrome-stable (headless, CDP) + ffmpeg with libvpx-vp9/yuva420p.
 * Optional: ImageMagick (`magick` or `convert`) for the per-frame alpha-coverage
 * scan that measures the OBS "Transition Point". Without it the script still
 * renders and falls back to the documented DEFAULT_TRANSITION_POINT_MS.
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
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The stinger animation is 1.1s; we render a slightly longer window so the WebM
// ends on verified-transparent frames (OBS holds the last frame briefly).
const DEFAULT_DURATION_MS = 1300;
const DEFAULT_FPS = 60;
// Fallback only — the coverage scan below measures the real value. Peak coverage
// lands inside the trail band's 42-58% sweep of a 1.1s timeline.
const DEFAULT_TRANSITION_POINT_MS = 550;
const MAX_WEBM_BYTES = 5 * 1024 * 1024;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = name => process.argv.includes(`--${name}`);

const FPS = Number(arg('fps', DEFAULT_FPS));
const DURATION_MS = Number(arg('duration', DEFAULT_DURATION_MS));
const FRAMES = Math.ceil((DURATION_MS / 1000) * FPS);
const OUT = resolve(REPO, arg('out', 'public/stinger-transition.webm'));
const PORT = Number(arg('port', 3607));

const framesDir = mkdtempSync(join(tmpdir(), 'stinger-frames-'));
const profileDir = mkdtempSync(join(tmpdir(), 'stinger-profile-'));
const framePath = i => join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);

const cleanups = [];
function cleanup() {
  while (cleanups.length) {
    try { cleanups.pop()(); } catch { /* best effort */ }
  }
  rmSync(profileDir, { recursive: true, force: true });
  if (!flag('keep-frames')) rmSync(framesDir, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Alpha coverage ─────────────────────────────────────────────────────────
   "Coverage" = mean alpha of a frame (0 = fully transparent, 1 = fully opaque).
   OBS's Transition Point is the moment the outgoing scene should be swapped for
   the incoming one, i.e. the frame where the stinger hides the most. */
const IM = ['magick', 'convert'].find(bin => spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0);

function coverage(file) {
  if (!IM) return null;
  // IM6 `convert` and IM7 `magick` take the same argument form here.
  const r = spawnSync(IM, [file, '-alpha', 'extract', '-format', '%[fx:mean]', 'info:'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const v = parseFloat(r.stdout.trim());
  return Number.isFinite(v) ? v : null;
}

/* ── CDP plumbing ───────────────────────────────────────────────────────── */
async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, msg => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  return { ws, send, events };
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
    const timer = setTimeout(() => rej(new Error(`chrome did not expose CDP:\n${stderr}`)), 20000);
    chrome.stderr.on('data', d => {
      stderr += d.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
    chrome.on('exit', c => { clearTimeout(timer); rej(new Error(`chrome exited (${c}):\n${stderr}`)); });
  });

  const { ws, send, events } = await connectCdp(wsUrl);
  const { targetInfos } = await send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Network.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  const loaded = new Promise(res => {
    const t = setInterval(() => {
      if (events.some(e => e.method === 'Page.loadEventFired')) { clearInterval(t); res(); }
    }, 50);
    setTimeout(() => { clearInterval(t); res(); }, 15000);
  });
  await s('Page.navigate', { url });
  await loaded;
  // Fonts (@font-face woff2) + pinwheel.js building two 1900px SVGs.
  await sleep(1500);

  const failures = events
    .filter(e => e.method === 'Network.loadingFailed' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map(e => e.params.entry ? e.params.entry.text : `${e.params.type} load failed: ${e.params.errorText}`);

  return { chrome, ws, s, failures };
}

/** Sanity probe: the page must have the 4 stinger animations and both pinwheel SVGs. */
async function probe(s) {
  const { result } = await s('Runtime.evaluate', {
    returnByValue: true,
    expression: `JSON.stringify({
      animations: document.getAnimations().length,
      svgA: document.querySelectorAll('#stg-pinwheel-a svg').length,
      svgB: document.querySelectorAll('#stg-pinwheel-b svg').length,
      paths: document.querySelectorAll('#stg-stage svg path').length,
      fontLoaded: document.fonts.check('800 96px "Geist Sans"')
    })`,
  });
  return JSON.parse(result.value);
}

async function captureFrames(s) {
  for (let i = 0; i < FRAMES; i++) {
    const t = (i * 1000) / FPS;
    await s('Runtime.evaluate', {
      expression: `document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = ${t}; });`,
    });
    await sleep(20); // let the compositor commit the scrubbed frame
    const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(framePath(i), Buffer.from(data, 'base64'));
  }
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

/* ── Render ─────────────────────────────────────────────────────────────── */
const fileUrl = 'file://' + join(REPO, 'overlays', 'stinger-transition.html');
const httpUrl = `http://localhost:${PORT}/overlays/stinger-transition.html`;

let server = null;
function startServer() {
  const userData = mkdtempSync(join(tmpdir(), 'stinger-userdata-'));
  server = spawn(process.execPath, [join(REPO, 'server', 'server.js')], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), ELEMENTAL_USER_DATA: userData },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  cleanups.push(() => { server.kill('SIGKILL'); rmSync(userData, { recursive: true, force: true }); });
  return (async () => {
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      try {
        const r = await fetch(httpUrl, { method: 'HEAD' });
        if (r.ok) return;
      } catch { /* not up yet */ }
    }
    throw new Error(`server did not come up on :${PORT}`);
  })();
}

async function render(url) {
  console.log(`→ Rendering ${url}`);
  const { chrome, ws, s, failures } = await launchChrome(url);
  const done = () => { ws.close(); chrome.kill('SIGKILL'); };
  const info = await probe(s);
  console.log(`  animations=${info.animations} pinwheelPaths=${info.paths} font=${info.fontLoaded ? 'loaded' : 'MISSING'}`);
  if (failures.length) console.log(`  page errors: ${failures.slice(0, 5).join(' | ')}`);
  const ok = info.animations >= 4 && info.svgA === 1 && info.svgB === 1 && info.paths >= 16 && info.fontLoaded;
  if (!ok) {
    done();
    return { ok: false, reason: `assets did not load (${JSON.stringify(info)})` };
  }
  await captureFrames(s);
  done();
  return { ok: true };
}

// file:// works because every asset the page pulls (theme-v2.css, fonts-v2.css,
// ./fonts/*.woff2, pinwheel.js) is a relative sibling. --http forces the express
// route instead, which is also the automatic fallback if that ever stops holding.
let result = flag('http')
  ? { ok: false, reason: '--http requested' }
  : await render(fileUrl);
if (!result.ok) {
  console.log(`  file:// route unusable — ${result.reason}\n  falling back to the express server on :${PORT}`);
  await startServer();
  result = await render(httpUrl);
  if (!result.ok) fail(`http route also failed — ${result.reason}`);
}

/* ── Verify the captured frames before spending time on the encode ──────── */
const cov = [];
for (let i = 0; i < FRAMES; i++) cov.push(coverage(framePath(i)));
const haveCoverage = cov.every(c => c !== null);

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

  const mid = cov[Math.round((550 / 1000) * FPS)];
  if (cov[0] > 0.001) fail(`frame 0 is not transparent (coverage ${cov[0].toFixed(4)})`);
  if (cov[FRAMES - 1] > 0.001) fail(`last frame is not transparent (coverage ${cov[FRAMES - 1].toFixed(4)})`);
  if (mid < 0.05) fail(`mid-animation frame (~550ms) is blank (coverage ${mid.toFixed(4)}) — the scrub did not take`);
} else {
  console.log(`\n! ImageMagick not found — skipping the coverage scan; using the ${DEFAULT_TRANSITION_POINT_MS}ms default.`);
  const mid = statSync(framePath(Math.round((550 / 1000) * FPS))).size;
  const first = statSync(framePath(0)).size;
  if (mid <= first * 2) fail('mid-animation frame looks blank (same size as the transparent first frame)');
}

/* ── Encode ─────────────────────────────────────────────────────────────── */
mkdirSync(dirname(OUT), { recursive: true });
rmSync(OUT, { force: true });
const enc = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'warning',
  '-framerate', String(FPS), '-i', join(framesDir, 'frame_%04d.png'),
  '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24',
  '-auto-alt-ref', '0', OUT,
], { stdio: ['ignore', 'ignore', 'inherit'] });
if (enc.status !== 0 || !existsSync(OUT)) fail('ffmpeg encode failed');

const probeOut = spawnSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name,width,height,pix_fmt:stream_tags=alpha_mode:format=duration',
  '-of', 'default=nw=1', OUT,
], { encoding: 'utf8' }).stdout.trim();
const size = statSync(OUT).size;

console.log(`\n✓ ${OUT}`);
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
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', OUT,
      '-vf', `select=eq(n\\,${n})`, '-fps_mode', 'passthrough', '-frames:v', '1',
      '-pix_fmt', 'rgba', png], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) fail(`could not decode frame ${n} back out of the webm`);
    return coverage(png);
  };
  const peakFrame = Math.round((transitionPointMs / 1000) * FPS);
  const [a0, aMid, aEnd] = [decoded(0), decoded(peakFrame), decoded(FRAMES - 1)];
  console.log(`  round-trip alpha: frame 0 = ${a0.toFixed(3)}, frame ${peakFrame} = ${aMid.toFixed(3)}, frame ${FRAMES - 1} = ${aEnd.toFixed(3)}`);
  if (a0 > 0.002 || aEnd > 0.002) fail('encoded first/last frame is not transparent');
  if (aMid < 0.05) fail('encoded mid frame lost its alpha content');
}

console.log(`\nOBS: Scene Transitions dock → + → Stinger → this file → Transition Point: ${transitionPointMs} ms`);
console.log('(Keep that number in sync with src/pages/Settings.jsx and README.md.)');

// Explicit: the CDP WebSocket leaves a live handle behind even after close(),
// so the event loop would otherwise keep this process alive after the work is done.
cleanup();
process.exit(0);
