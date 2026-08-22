// Binary upload endpoints (/api/upload-logo, /api/fonts/upload).
//
// Regression cover for the v2.1.3 producer report (DanBuzzBuzz): "uploading
// logos for team icons doesnt work (and has no confirmation that it has
// worked)".
//
// Root cause: both endpoints parsed the request body with
// `express.raw({ type: '<wildcard>' })`. body-parser matches that `type`
// against the request's Content-Type header — and `fetch(url, { body: await
// file.arrayBuffer() })`, which is exactly what both dashboard uploaders do,
// sends NO Content-Type at all. With nothing to match, the parser skipped the
// body; Express 5 no longer defaults `req.body` to `{}`, so it stayed
// `undefined` and `fs.writeFileSync(path, undefined)` threw. The client got
// Express's HTML error page, its own `res.json()` threw on the "<!DOCTYPE",
// and the rejection was swallowed by an un-awaited async handler — a click
// that did nothing at all, silently.
//
// Crucially, a curl smoke test could NOT reproduce this: curl always sets a
// Content-Type, so it hit the working path. These tests therefore assert on
// the no-Content-Type case specifically, which is the one real clients use.
//
// server.js itself starts a listener and the OBS/FACEIT pollers at import
// time, so the routes can't be imported directly. The parts that carry the
// bug — the raw parser, the empty-body guard and the filename decode — live
// in server/upload-middleware.js precisely so these tests exercise the REAL
// implementation rather than a copy of it; only the tiny writing handler is
// re-stated here.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rawUpload, uploadedBytes, uploadedFilename } from './upload-middleware.js';

let server;
let baseUrl;
let uploadDir;

beforeAll(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elmt-upload-test-'));
  const app = express();
  app.post('/upload', rawUpload, (req, res) => {
    const bytes = uploadedBytes(req, res);
    if (!bytes) return;
    const name = uploadedFilename(req, 'logo.png');
    fs.writeFileSync(path.join(uploadDir, name), bytes);
    res.json({ success: true, url: `/cache/logos/${encodeURIComponent(name)}`, bytes: bytes.length, name });
  });
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
  '789c63000100000500010d0a2db40000000049454e44ae426082', 'hex'
);

describe('binary upload endpoint', () => {
  it('accepts a body sent with NO Content-Type (the exact browser fetch case)', async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': 'crest.png' },
      body: PNG,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.bytes).toBe(PNG.length);
    // The bytes must land on disk intact — the old failure wrote nothing.
    expect(fs.readFileSync(path.join(uploadDir, 'crest.png'))).toEqual(PNG);
  });

  it('still accepts a body that DOES carry a Content-Type', async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': 'typed.png', 'Content-Type': 'image/png' },
      body: PNG,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('accepts the octet-stream type the fixed dashboard clients now send', async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': 'octet.png', 'Content-Type': 'application/octet-stream' },
      body: PNG,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('rejects an empty upload as JSON, not as an HTML error page', async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': 'empty.png' },
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    // The old bug's tell was an HTML body that blew up the client's res.json().
    expect(text.startsWith('<')).toBe(false);
    const data = JSON.parse(text);
    expect(data.success).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('sanitises the filename out of the X-Filename header', async () => {
    await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent('../../evil name (1).png') },
      body: PNG,
    });
    expect(fs.existsSync(path.join(uploadDir, '.._.._evil_name__1_.png'))).toBe(true);
    expect(fs.readdirSync(uploadDir).every(f => !f.includes('/'))).toBe(true);
  });

  // Second, independent cause of "uploading logos doesn't work": a header
  // value is a WebIDL ByteString, so fetch throws on any code point > 255 —
  // the request never left the browser. The clients now percent-encode.
  it('accepts a percent-encoded non-ASCII filename', async () => {
    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent('Équipe 東京.png') },
      body: PNG,
    });
    expect(res.status).toBe(200);
    const { name } = await res.json();
    expect(name).toMatch(/\.png$/);
    expect(fs.existsSync(path.join(uploadDir, name))).toBe(true);
  });

  it('sending such a name unencoded is what fetch refuses (the original failure)', () => {
    expect(() => new Headers({ 'X-Filename': 'Ω team.png' })).toThrow(TypeError);
    expect(() => new Headers({ 'X-Filename': encodeURIComponent('Ω team.png') })).not.toThrow();
  });
});

describe('uploadedFilename', () => {
  const req = (v) => ({ headers: v === undefined ? {} : { 'x-filename': v } });

  it('decodes what the fixed clients send', () => {
    expect(uploadedFilename(req(encodeURIComponent('Équipe.png')), 'x.png')).toBe('_quipe.png');
  });

  it('still handles a raw name from a pre-fix dashboard', () => {
    expect(uploadedFilename(req('crest.png'), 'x.png')).toBe('crest.png');
  });

  it('does not throw on a raw name with a bare percent sign', () => {
    // decodeURIComponent('50% scale.png') throws URIError — must fall back.
    expect(uploadedFilename(req('50% scale.png'), 'x.png')).toBe('50__scale.png');
  });

  it('falls back when nothing usable survives sanitisation', () => {
    expect(uploadedFilename(req(encodeURIComponent('///')), 'logo.png')).toBe('logo.png');
    expect(uploadedFilename(req(''), 'logo.png')).toBe('logo.png');
    expect(uploadedFilename(req(undefined), 'logo.png')).toBe('logo.png');
  });

  // The property that matters is containment, not the absence of dots: a
  // surviving ".." is inert once every separator is gone, because the result
  // is a single flat filename that path.join can't walk out of.
  it('cannot escape the target directory', () => {
    for (const attack of ['../../etc/passwd', '..\\..\\windows\\system32', '/etc/shadow', '....//x.png']) {
      const out = uploadedFilename(req(encodeURIComponent(attack)), 'x.png');
      expect(out).not.toMatch(/[/\\]/);
      const resolved = path.resolve('/srv/uploads', out);
      expect(resolved.startsWith(path.resolve('/srv/uploads') + path.sep)).toBe(true);
    }
  });
});

describe('uploadedBytes guard', () => {
  const fakeRes = () => {
    const r = { statusCode: 200, payload: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (p) => { r.payload = p; return r; };
    return r;
  };

  it('rejects the undefined body the broken parser used to produce', () => {
    const res = fakeRes();
    expect(uploadedBytes({ body: undefined }, res)).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.payload.success).toBe(false);
  });

  it('rejects a zero-length body', () => {
    const res = fakeRes();
    expect(uploadedBytes({ body: Buffer.alloc(0) }, res)).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it('passes a real buffer through untouched', () => {
    const res = fakeRes();
    expect(uploadedBytes({ body: PNG }, res)).toBe(PNG);
    expect(res.statusCode).toBe(200);
  });
});
