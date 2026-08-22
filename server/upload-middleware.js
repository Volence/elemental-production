/**
 * Shared pieces of the two binary upload endpoints in server.js
 * (/api/upload-logo, /api/fonts/upload).
 *
 * These live in their own module purely so they can be unit-tested: server.js
 * starts an HTTP listener and the OBS/FACEIT pollers at import time, so a test
 * cannot import the routes themselves without booting the whole app. Keeping a
 * hand-copied duplicate in the test instead would mean the guard tests pass
 * while the real route regresses, which defeats the point.
 *
 * PRODUCER BUG this exists to prevent recurring (v2.1.3, DanBuzzBuzz:
 * "uploading logos for team icons doesnt work (and has no confirmation that it
 * has worked)"). See the two functions below for the two independent causes.
 */
import express from 'express';

/**
 * Raw-body parser for "the request body IS the file" endpoints.
 *
 * `type: () => true` is load-bearing and must NOT be reverted to a
 * content-type string, not even a wildcard one. body-parser matches its
 * `type` option against the request's Content-Type header, and a `fetch`
 * whose body is a bare ArrayBuffer — exactly what both dashboard uploaders
 * send — sets no Content-Type at all. With no content type there is nothing
 * to match, even against a wildcard, so the parser skipped the body entirely;
 * Express 5 no longer defaults `req.body` to `{}`, so it stayed `undefined`,
 * `fs.writeFileSync(path, undefined)` threw, and the client received
 * Express's HTML error page — which then blew up its own `res.json()`. Net
 * effect for the producer: clicking Upload did nothing at all, silently.
 *
 * A curl smoke test cannot reproduce that, because curl always sets a
 * Content-Type. Test uploads from a real browser, or via the
 * no-Content-Type case in uploads.test.js.
 *
 * A predicate bypasses content-type negotiation and always parses, which is
 * what these endpoints want: the body is the file, whatever it was labelled.
 */
export const rawUpload = express.raw({ type: () => true, limit: '10mb' });

/**
 * Validate the parsed body, or reply 400 and return null.
 *
 * The parser above cannot produce a non-Buffer body, but a request with no
 * body at all still yields an empty one. Replying as JSON (never HTML) is
 * what turns "nothing happened" into an error the dashboard can show.
 */
export function uploadedBytes(req, res) {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ success: false, error: 'Upload was empty — no file data received.' });
    return null;
  }
  return body;
}

/**
 * Read the client's original filename out of X-Filename and reduce it to
 * something safe to write.
 *
 * The clients percent-encode the name because an HTTP header value is a
 * WebIDL ByteString: `fetch` THROWS outright on any code point above 255, so
 * a producer picking "Équipe logo.png" or a CJK filename used to fail the
 * upload before the request was even sent — the same "clicking Upload does
 * nothing" symptom, from a second, independent cause.
 *
 * Decoding is guarded because a pre-v2.1.3 dashboard sends the name raw, and
 * a raw name containing a bare '%' (a real thing: "50% scale.png") makes
 * decodeURIComponent throw; falling back to the raw value keeps old clients
 * working against a new server.
 *
 * The character-class replace is what actually makes the name safe — it
 * flattens path separators and dot-segments, so nothing here can escape the
 * target directory.
 */
export function uploadedFilename(req, fallback) {
  const raw = req.headers['x-filename'];
  if (!raw) return fallback;
  let name = String(raw);
  try { name = decodeURIComponent(name); } catch { /* not encoded — use as-is */ }
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  // A name made entirely of separators would sanitise to all underscores and
  // leave no basename; fall back rather than write "___.png"-style noise.
  return /[a-zA-Z0-9]/.test(safe) ? safe : fallback;
}
