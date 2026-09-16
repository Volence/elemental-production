import { describe, it, expect } from 'vitest';
import {
  INITIAL_UPDATE_STATUS, reduceUpdateStatus, cleanVersion, isNewerVersion,
  releaseUrl, summarizeUpdaterError, isMatchLive, updateBanner, updateStatusText,
} from './update-status.js';

const run = (...events) => events.reduce((s, e) => reduceUpdateStatus(s, { at: 1, ...e }), INITIAL_UPDATE_STATUS);

describe('reduceUpdateStatus', () => {
  it('walks the happy path checking → available → downloading → downloaded', () => {
    let s = run({ type: 'checking' });
    expect(s.state).toBe('checking');
    s = reduceUpdateStatus(s, { type: 'available', version: 'v2.3.0', releaseNotes: '<p>hi</p>' });
    expect(s).toMatchObject({ state: 'available', version: '2.3.0', releaseNotes: '<p>hi</p>', manual: false });
    s = reduceUpdateStatus(s, { type: 'downloading', percent: 41.7 });
    expect(s).toMatchObject({ state: 'downloading', version: '2.3.0', percent: 42 });
    s = reduceUpdateStatus(s, { type: 'downloaded', version: '2.3.0' });
    expect(s).toMatchObject({ state: 'downloaded', version: '2.3.0', percent: 100 });
  });

  it('keeps a downloaded update through later checks, errors and not-available', () => {
    const ready = run({ type: 'available', version: '2.3.0' }, { type: 'downloaded', version: '2.3.0' });
    for (const e of [{ type: 'checking' }, { type: 'error', message: 'offline' }, { type: 'not-available' }]) {
      expect(reduceUpdateStatus(ready, e).state).toBe('downloaded');
    }
    // even a newer release doesn't hide the restart button mid-show
    expect(reduceUpdateStatus(ready, { type: 'available', version: '2.3.1' })).toMatchObject({ state: 'downloaded', version: '2.3.0' });
  });

  it('does not reset an in-flight download on a redundant check / re-announce', () => {
    const dl = run({ type: 'available', version: '2.3.0' }, { type: 'downloading', percent: 60 });
    expect(reduceUpdateStatus(dl, { type: 'checking' })).toBe(dl);
    expect(reduceUpdateStatus(dl, { type: 'available', version: '2.3.0' })).toBe(dl);
  });

  it('surfaces a failed download as an error', () => {
    const s = run({ type: 'available', version: '2.3.0' }, { type: 'downloading', percent: 60 }, { type: 'error', message: 'sha512 mismatch' });
    expect(s).toMatchObject({ state: 'error', message: 'sha512 mismatch', percent: null });
  });

  it('marks the manual (non-AppImage Linux) path', () => {
    expect(run({ type: 'available', version: '2.3.0', manual: true })).toMatchObject({ state: 'available', manual: true });
  });

  it('not-available clears a stale error', () => {
    expect(run({ type: 'error', message: 'x' }, { type: 'not-available' })).toMatchObject({ state: 'not-available', message: null });
  });

  it('ignores garbage events', () => {
    expect(reduceUpdateStatus(INITIAL_UPDATE_STATUS, null)).toBe(INITIAL_UPDATE_STATUS);
    expect(reduceUpdateStatus(INITIAL_UPDATE_STATUS, { type: 'nope' })).toBe(INITIAL_UPDATE_STATUS);
    expect(reduceUpdateStatus(undefined, { type: 'checking' }).state).toBe('checking');
  });

  it('clamps percent', () => {
    expect(run({ type: 'downloading', percent: 140 }).percent).toBe(100);
    expect(run({ type: 'downloading', percent: -3 }).percent).toBe(0);
  });
});

describe('versions', () => {
  it('cleanVersion strips v and whitespace', () => {
    expect(cleanVersion(' v2.3.0 ')).toBe('2.3.0');
    expect(cleanVersion('')).toBe(null);
    expect(cleanVersion(3)).toBe(null);
  });

  it('isNewerVersion compares numerically, not lexically', () => {
    expect(isNewerVersion('v2.10.0', '2.9.9')).toBe(true);
    expect(isNewerVersion('2.2.1', '2.2.1')).toBe(false);
    expect(isNewerVersion('2.2.0', '2.2.1')).toBe(false);
    expect(isNewerVersion('3.0.0', '2.99.99')).toBe(true);
    expect(isNewerVersion('2.3.0', '2.3.0-beta.1')).toBe(true);
    expect(isNewerVersion('2.3.0-beta.1', '2.3.0')).toBe(false);
    expect(isNewerVersion('garbage', '2.3.0')).toBe(false);
  });

  it('releaseUrl points at the tag page', () => {
    expect(releaseUrl('2.3.0')).toBe('https://github.com/Volence/elemental-production/releases/tag/v2.3.0');
    expect(releaseUrl('v2.3.0')).toBe('https://github.com/Volence/elemental-production/releases/tag/v2.3.0');
    expect(releaseUrl(null)).toBe('https://github.com/Volence/elemental-production/releases/latest');
  });
});

describe('summarizeUpdaterError', () => {
  it('keeps only the first line', () => {
    expect(summarizeUpdaterError(new Error('Boom\n    at foo (x.js:1)'))).toBe('Boom');
  });
  it('recognises offline errors', () => {
    expect(summarizeUpdaterError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe('Could not reach GitHub (offline?)');
    expect(summarizeUpdaterError(new Error('getaddrinfo ENOTFOUND github.com'))).toBe('Could not reach GitHub (offline?)');
  });
  it('recognises a release missing its yml', () => {
    expect(summarizeUpdaterError(new Error('Cannot find latest-linux.yml in the latest release artifacts (https://...): HttpError: 404'))).toBe('Latest release has no update files yet');
  });
  it('truncates very long messages and tolerates non-errors', () => {
    expect(summarizeUpdaterError(new Error('x'.repeat(500))).length).toBe(160);
    expect(summarizeUpdaterError(undefined)).toBe('Update check failed');
    expect(summarizeUpdaterError('plain string')).toBe('plain string');
  });
});

describe('isMatchLive', () => {
  it('is live when FACEIT auto-sync is running', () => {
    expect(isMatchLive({ mode: 'faceit', faceitAutoSync: true, maps: [] })).toBe(true);
  });
  it('ignores a stale auto-sync flag outside FACEIT mode', () => {
    expect(isMatchLive({ mode: 'manual', faceitAutoSync: true, maps: [] })).toBe(false);
  });
  it('is live when any map is current, in any mode', () => {
    expect(isMatchLive({ mode: 'manual', maps: [{ status: 'completed' }, { status: 'current' }] })).toBe(true);
    expect(isMatchLive({ mode: 'scrim', maps: [{ status: 'current' }] })).toBe(true);
  });
  it('is live between maps of a series in progress (the break screen)', () => {
    expect(isMatchLive({ mode: 'manual', maps: [{ status: 'completed' }, { status: 'upcoming' }] })).toBe(true);
    expect(isMatchLive({ mode: 'faceit', faceitAutoSync: false, maps: [{ status: 'upcoming' }, null, { status: 'completed' }] })).toBe(true);
  });
  it('is not live before a series starts or after it ends', () => {
    expect(isMatchLive({ mode: 'manual', maps: [{ status: 'upcoming' }, { status: 'upcoming' }] })).toBe(false);
    expect(isMatchLive({ mode: 'manual', maps: [{ status: 'completed' }, { status: 'completed' }] })).toBe(false);
    expect(isMatchLive(null)).toBe(false);
    expect(isMatchLive({ mode: 'faceit', maps: [null] })).toBe(false);
  });
  it('is live whenever OBS is streaming or recording, whatever the state says', () => {
    const idle = { mode: 'manual', maps: [] };
    expect(isMatchLive(idle, { streaming: true, recording: false })).toBe(true);
    expect(isMatchLive(idle, { streaming: false, recording: true })).toBe(true);
    expect(isMatchLive(null, { recording: true })).toBe(true);
    expect(isMatchLive(idle, { connected: false })).toBe(false);
    expect(isMatchLive(idle, null)).toBe(false);
  });
});

describe('updateBanner', () => {
  it('shows nothing for non-actionable states', () => {
    for (const state of ['idle', 'disabled', 'checking', 'not-available', 'error']) {
      expect(updateBanner({ ...INITIAL_UPDATE_STATUS, state, version: '2.3.0' })).toBe(null);
    }
    expect(updateBanner({ ...INITIAL_UPDATE_STATUS, state: 'downloaded', version: null })).toBe(null);
  });
  it('maps actionable states to banner kinds', () => {
    expect(updateBanner(run({ type: 'available', version: '2.3.0' }, { type: 'downloaded' }))).toMatchObject({ kind: 'restart', text: 'Update v2.3.0 ready' });
    expect(updateBanner(run({ type: 'available', version: '2.3.0' }, { type: 'downloading', percent: 12 }))).toMatchObject({ kind: 'downloading', percent: 12 });
    expect(updateBanner(run({ type: 'available', version: '2.3.0', manual: true }))).toMatchObject({ kind: 'manual' });
    expect(updateBanner(run({ type: 'available', version: '2.3.0' }))).toMatchObject({ kind: 'available' });
  });
});

describe('updateStatusText', () => {
  it('has a line for every state', () => {
    for (const state of ['idle', 'disabled', 'checking', 'not-available', 'available', 'downloading', 'downloaded', 'error']) {
      expect(updateStatusText({ ...INITIAL_UPDATE_STATUS, state, version: '2.3.0' })).toMatch(/\S/);
    }
  });
});
