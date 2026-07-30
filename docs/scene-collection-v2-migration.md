# Scene Collection v2 — Producer Migration Note

**What this is:** Broadcast Package v2 restyles the caster/cam scenes so the cams
are **transparent cutouts** in the overlay — the branded frame is drawn by the
overlay, and each caster's camera browser-source sits *behind* it in OBS. For
that to line up, the camera sources must be positioned at exact coordinates.
Scene collection v2 bakes those coordinates in so you do not have to.

The two files in `data/` are the v2 collections:

- `obs-scene-collection.json` — Linux
- `obs-scene-collection-windows.json` — Windows

Both are named **"Elemental Production v2"** in OBS after import.

---

## One-time import steps

1. In OBS: **Scene Collection → Import**.
2. Select the file for your OS (`obs-scene-collection.json` on Linux,
   `obs-scene-collection-windows.json` on Windows).
3. **Scene Collection → Elemental Production v2** to switch to it.
4. Set each caster camera URL (see below). Cameras ship with a **blank URL**
   on purpose — the positions are baked, but the source is yours to point at.

That's it. Do **not** hand-move the camera sources (see "Do not hand-move").

---

## What changed vs v1

- The camera browser-sources (**Caster 1**, **Caster 2**, **Interviewee**) are
  repositioned to sit exactly behind the overlay's cutout windows on these scenes:

  | Scene | Cutout layout | Cameras placed |
  |-------|---------------|----------------|
  | Casters | desk (dual) | Caster 1 (left), Caster 2 (right) |
  | Casters Lobby | desk (dual) | Caster 1 (left), Caster 2 (right) |
  | Casters Scoreboard | desk (dual) | Caster 1 (left), Caster 2 (right) |
  | Map Score | desk (dual) | Caster 1 (left), Caster 2 (right) |
  | Casters Flythrough | flythrough (dual) | Caster 1 (left), Caster 2 (right) |
  | Interview | interview (single) | Interviewee |

  Each camera uses a **bounds box** (OBS "Scale to outer bounds") whose top-left
  corner and size match the overlay cutout, so any 1920×1080 camera source is
  scaled to **fill** the window edge-to-edge. The cams are 16:9 and the desk
  cutouts are slightly wider-than-tall, so a small amount of the feed's left/right
  edges spills past the window — that overflow is hidden behind the opaque overlay
  outside the cutout, giving a clean full-bleed cam with **no letterbox bands**. A
  slight side-crop of the 16:9 feed is expected and intentional. The items are
  **locked**.

- The collection is renamed to **Elemental Production v2**.

- **Nothing else changed.** Transitions (Cut + Fade, with Fade active), audio
  sources, other scenes, and every non-caster scene item are byte-identical to
  v1. Scenes that also carry cameras but are *not* caster desks — **Map Pick,
  Map Intro, Gameplay, Series Winner** — are intentionally left as they were.

### Setting each caster's camera URL

Right-click a camera source (or double-click → Properties) and set the URL to
your camera feed. The three sources map to:

- **Caster 1** → left cutout on the caster scenes
- **Caster 2** → right cutout on the caster scenes
- **Interviewee** → the single cutout on the Interview scene

Leave **Width/Height at 1920×1080** — the bounds box handles fitting.

---

## The "dual is the baked default" note

The overlays support a runtime single-cam mode (`casterLayout`), where one caster
fills a larger centered window. **Scene collection v2 bakes the DUAL (two-camera)
positions** for the desk and flythrough scenes — a single OBS scene collection
cannot hold multiple position variants for one source.

If you run a caster scene in single-cam mode, the overlay frame will render the
single-cam cutout but the baked camera positions stay in their dual slots. In
that case a producer may temporarily nudge the active camera by hand — but this
is the exception, not the workflow. Dual-caster desks are the default and need
no adjustment.

---

## Do not hand-move the camera sources

The whole point of v2 is that the cameras are already aligned to the overlay
cutouts. If you drag or resize **Caster 1 / Caster 2 / Interviewee** in OBS, they
will no longer sit behind the frames and the cutout illusion breaks. If you need
to change where a cutout is, that is a code change: edit `overlays/cam-layout.js`
(the single source of truth for both the overlay frames and these positions),
then re-run the generator and re-import — never edit one side alone.

Regenerate after a `cam-layout.js` change:

```
node scripts/build-scene-collection-v2.mjs
```

The generator is idempotent (re-running with no layout change rewrites nothing)
and only ever touches the mapped camera transforms plus the collection name.

---

## Producer heads-ups

- **Cams FILL their windows (full-bleed, slight side-crop).** v2 uses OBS
  "Scale to outer bounds", so each 16:9 camera fills its cutout with no letterbox
  bands; a little of the feed's left/right edges is cropped by the window and
  hidden behind the overlay. This is intentional — frame your talent slightly
  looser so heads sit comfortably inside the visible window.

- **Between Matches ships with NO cam source.** The Between Matches overlay draws
  a wide single-cam cutout, but the scene currently contains only a Replay media
  source, not a live camera — so nothing is baked there. If you want a live camera
  in Between Matches, add a **Caster 1** browser-source to that scene and re-run
  the generator (`node scripts/build-scene-collection-v2.mjs`); it will snap the
  new source into the reserved 1690×900 wide window automatically.

---

## Rollback

The v1 files in the repo have been **replaced in place** by v2, but your
**existing OBS scene collection is not touched until you import** — so the
rollback is simply: keep using your current (pre-v2) collection, or re-import the
v1 file. If you need the v1 JSON after updating the repo, recover it from git.

Find the last commit before the v2 bake — the commit **just before** the v2 work
on this branch is **`ce44c89`** (the last commit before the collection files were regenerated), so its version of the file is
the pre-v2 v1. To list the file's history yourself:

```
git log --oneline -- data/obs-scene-collection.json
```

then pick the commit before "scene collection v2 — cam sources baked …" and
export that file:

```
git show ce44c89:data/obs-scene-collection.json > /tmp/obs-scene-collection-v1.json
```

then **Scene Collection → Import** that file. Your v2 collection remains
available alongside it, so you can switch back and forth while validating.
