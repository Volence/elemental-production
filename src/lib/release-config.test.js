import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { RELEASES_URL } from './update-status.js';

// Guards the release plumbing the in-app updater depends on. None of this
// fails loudly on its own: a bad artifact name or a missing yml upload only
// shows up weeks later as "installed apps never update".
const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('package.json', root)), 'utf8'));
const workflow = readFileSync(fileURLToPath(new URL('.github/workflows/release.yml', root)), 'utf8');

describe('electron-builder release config', () => {
  it('publishes update metadata for this GitHub repo', () => {
    const publish = [].concat(pkg.build.publish);
    expect(publish).toContainEqual({ provider: 'github', owner: 'Volence', repo: 'elemental-production' });
    expect(RELEASES_URL).toBe('https://github.com/Volence/elemental-production/releases');
  });

  // GitHub turns spaces in uploaded asset names into dots
  // ("Elemental.Production.Setup.2.2.1.exe"), but latest.yml records the
  // on-disk name — so a space in the name means every update download 404s.
  it.each([
    ['nsis', 'exe'],
    ['appImage', 'AppImage'],
  ])('%s artifactName is space-free and versioned', (target, ext) => {
    const name = pkg.build[target]?.artifactName;
    expect(name, `build.${target}.artifactName must be set`).toBeTruthy();
    expect(name).not.toMatch(/\s/);
    expect(name).toContain('${version}');
    const rendered = name.replace('${version}', '2.3.0').replace('${ext}', ext);
    expect(rendered).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('ships electron-updater as a runtime dependency (not dev)', () => {
    expect(pkg.dependencies['electron-updater']).toBeTruthy();
    expect(pkg.devDependencies?.['electron-updater']).toBeUndefined();
  });
});

describe('release workflow', () => {
  it.each([
    'release/*.AppImage',
    'release/latest-linux.yml',
    'release/*.exe',
    'release/*.exe.blockmap',
    'release/latest.yml',
  ])('uploads %s', (path) => {
    expect(workflow).toContain(path);
  });

  it('never lets electron-builder publish on its own (the release job does)', () => {
    const packageSteps = workflow.match(/electron-builder[^\n]*/g) || [];
    expect(packageSteps.length).toBeGreaterThan(0);
    for (const step of packageSteps) expect(step).toContain('--publish never');
  });
});
