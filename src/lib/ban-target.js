/**
 * Which map's slot a ban EDIT in the dashboard writes to (perMapBans[idx]).
 *
 * Must agree with the server's read-side resolver, getActiveBanIdx in
 * server/faceit-merge.js (selected → live → first upcoming-with-bans → last
 * completed → last). The server re-derives heroBans from perMapBans on every
 * maps PATCH (▶ Play, Win, Undo), so if bans are stored under a different map
 * than the one the server resolves, they vanish from the overlays the moment
 * a map changes status.
 *
 * Producer report (manual mode, "bans keep resetting"): the old rule fell
 * through to the LAST map whenever no map was live and the last one wasn't
 * completed — i.e. a freshly set-up Bo3/Bo5 (all upcoming) or the gap between
 * maps (manual Win doesn't promote the next map). Bans for "the next map" were
 * written on map 5; ▶ Play on map 2 then resolved heroBans from map 2's empty
 * slot → chips gone. The write target is now the NEXT map to be played.
 *
 * @param {Array<{status:string}>} maps  state.maps
 * @param {number} selectedMapIdx        producer selection, -1 = auto
 * @returns {number} index into perMapBans (may equal maps.length: bans for a
 *   map that is about to be added once every listed map is completed)
 */
export function banTargetIdx(maps, selectedMapIdx = -1) {
  const list = Array.isArray(maps) ? maps : [];
  if (Number.isInteger(selectedMapIdx) && selectedMapIdx >= 0) return selectedMapIdx;
  // LAST current, same tie-break as the server (normalizeSingleCurrent keeps
  // the most recently promoted map when bad state carries two).
  const currentIdx = list.reduce((acc, m, i) => (m && m.status === 'current' ? i : acc), -1);
  if (currentIdx >= 0) return currentIdx;
  const upcomingIdx = list.findIndex(m => m && m.status === 'upcoming');
  if (upcomingIdx >= 0) return upcomingIdx;
  // Everything listed is completed: the bans are for a map not added yet.
  return list.length;
}
