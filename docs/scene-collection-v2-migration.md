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

> **Keeping your existing camera URLs / media paths:** importing v2 gives you a
> collection with **blank** camera URLs and media file paths. If you already
> have a working collection, run the **settings carryover** (below) *before*
> importing so the v2 files inherit your producer settings — then import.

---

## Settings carryover (keep your URLs & media paths)

The v2 files ship with blank camera URLs and blank media paths on purpose (they
are yours to point at). Re-importing v2 **replaces** the whole collection, so if
you already run a live collection you would otherwise have to re-enter every
camera URL and media file by hand. The generator can copy those for you.

**1. Find your live collection file.** OBS stores each scene collection as JSON:

```
~/.config/obs-studio/basic/scenes/<CollectionName>.json     # Linux
%APPDATA%\obs-studio\basic\scenes\<CollectionName>.json      # Windows
```

The file name is the collection's display name with spaces replaced by
underscores (e.g. `Elemental_Production.json`). Match it to the collection you
currently use in **Scene Collection** menu.

**2. Carry its settings into the v2 files** (run from the repo root):

```
node scripts/build-scene-collection-v2.mjs --carry-from ~/.config/obs-studio/basic/scenes/Elemental_Production.json
```

This copies, **by source name**, into BOTH `data/obs-scene-collection.json` and
`data/obs-scene-collection-windows.json`:

- `settings.url` for **Caster 1**, **Caster 2**, **Interviewee**
- `settings.local_file` / `settings.playlist` (+ `is_local_file` when present)
  for **Background Music**, **Casters Background Music**, **Map Flythrough**,
  **Map Music**, **Replay**

Only **non-empty** values are copied — a blank value in your live collection
never wipes a value already set in v2. The command prints a per-source summary
(`carried` / `skipped-empty` / `absent`) so you can see exactly what moved.

**3. THEN import** the v2 file (see "One-time import steps"). Order matters:
carryover edits the repo's JSON files, and the import reads those files — so
carry first, import second. (Re-importing later would again replace the
collection, so re-run carryover any time before re-importing.)

---

## Ban Reveal scene (owner QA batch 1)

v2 now includes a **Ban Reveal** scene (right after **Map Pick** in the scene
list) containing a single **Ban Reveal BS** browser source pointed at
`overlays/hero-bans.html` — the full-screen hero-ban reveal graphic. It is
created idempotently by the generator; re-running never duplicates it.

## Map Pool scene + pick/ban audio (owner QA batch 3)

- v2 also includes a **Map Pool** scene (the scene list follows the owner's
  canonical show-flow order: Starting, Casters, **Map Pool**, Map Pick,
  Ban Reveal, Map Intro, …) with a **Map Pool BS** browser source pointed at
  `overlays/map-pool.html` — the season pool board. Configure the pool once in
  the dashboard under **Settings → Season Map Pool**; it persists across
  restarts.
- **Ban Reveal** and **Map Pool** both carry **Caster 1**, **Caster 2** and
  **Casters Background Music** (copied from Map Pick's items, including its
  offscreen-audio cam placement), so casters stay audible through the whole
  pick/ban block.
- If you already imported an earlier v2 collection, these were also injected
  into the live collection via obs-websocket — you only need to **drag "Map
  Pool" into its slot** in the scene list (the scene list order can't be set
  remotely). A fresh import has the canonical order right already.

## Final Stats scene (v2.1.0)

- v2.1.0 adds a **Final Stats** scene, sitting **immediately after Map Score**
  in the scene list (…, Casters Scoreboard, Map Score, **Final Stats**,
  Between Matches, …). It holds a **Final Stats BS** browser source pointed at
  `overlays/final-stats.html` — the series totals board: every played map's
  FACEIT stats summed into one line per player (K/D recomputed from the summed
  kills/deaths), plus a team totals footer and a chip per completed map.
- It is a caster **desk** scene, exactly like Casters Scoreboard: **Caster 1**
  and **Caster 2** are baked onto the desk cutout rects (visible AND audible,
  unlike Ban Reveal / Map Pool where the copied cams stay offscreen), and
  **Casters Background Music** rides along.
- Requires the FACEIT match to be loaded — in manual/scrim mode, or before the
  first map finishes, the scene shows a "SERIES STATS UNAVAILABLE" placeholder.
  The pre-flight checklist warns about this (**Series Stats**).
- Default hotkey: **Ctrl+Shift+T** (rebindable in Settings → Hotkeys).
- **You must re-import the scene collection** (or add the scene by hand: new
  scene "Final Stats", one browser source "Final Stats BS" at
  `http://localhost:3001/overlays/final-stats.html`, 1920×1080, plus the two
  caster cams and Casters Background Music copied from Casters Scoreboard).
  The scene-list position can't be set remotely, so on an in-place update drag
  **Final Stats** into its slot after Map Score.

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
  | Final Stats | desk (dual) | Caster 1 (left), Caster 2 (right) |
  | Casters Flythrough | flythrough (dual) | Caster 1 (left), Caster 2 (right) |
  | Interview | interview (single + corners) | Interviewee (center), Caster 1 (bottom-left), Caster 2 (bottom-right) |

  **Interview corner caster slots (owner QA batch 1):** the Interview scene now
  also carries **Caster 1** (bottom-left, `60,760 420×262`) and **Caster 2**
  (bottom-right, `1440,760 420×262`) behind the overlay's two corner cutouts.
  The overlay only draws a corner cutout when that caster is *named* in the
  dashboard, so an unnamed caster leaves the corner solid (no floating empty
  window). These items are wired to the same shared **Caster 1 / Caster 2**
  camera sources as the desk scenes — set their URL once and it applies
  everywhere.

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
  new source into the reserved 1690×860 wide window automatically.

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
