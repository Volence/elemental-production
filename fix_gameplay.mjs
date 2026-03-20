// Fix Gameplay scene layout via OBS WebSocket API
// Run with: node fix_gameplay.mjs

import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();

async function main() {
  await obs.connect('ws://localhost:4455', 'coolpoop');
  console.log('Connected to OBS');

  const SCENE = 'Gameplay';

  // Step 1: Get all scene items
  const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: SCENE });
  console.log('\n=== Current scene items (OBS order, top=front) ===');
  for (const item of sceneItems) {
    const t = item.sceneItemTransform;
    console.log(`  ID:${item.sceneItemId} idx:${item.sceneItemIndex} "${item.sourceName}" pos=(${t.positionX.toFixed(0)},${t.positionY.toFixed(0)}) scale=(${t.scaleX.toFixed(3)},${t.scaleY.toFixed(3)}) src=(${t.sourceWidth}x${t.sourceHeight}) bounds=(${t.boundsWidth.toFixed(0)}x${t.boundsHeight.toFixed(0)})`);
  }

  // Step 2: Define desired Z-order (index 0 = BACK, highest index = FRONT in OBS API)
  // OBS GetSceneItemList returns items with sceneItemIndex where 0 = back
  // SetSceneItemIndex also uses 0 = back
  // We want (back to front): Gameplay HUD BS -> Bars -> Logos -> Scores -> Names -> Observer BS
  const desiredOrder = [
    'Gameplay HUD BS',    // 0 = furthest back
    'Left Team Bar',      // 1
    'Right Team Bar',     // 2
    'Left Team Image',    // 3
    'Right Team Image',   // 4
    'Left Score',         // 5
    'Right Score',        // 6
    'Team Name 1',        // 7
    'Team Name 2',        // 8
    'Observer BS',        // 9 = front
  ];

  // Build a map of source name -> scene item ID
  const itemMap = {};
  for (const item of sceneItems) {
    itemMap[item.sourceName] = item.sceneItemId;
  }

  console.log('\n=== Reordering items ===');
  for (let i = 0; i < desiredOrder.length; i++) {
    const name = desiredOrder[i];
    const id = itemMap[name];
    if (id !== undefined) {
      try {
        await obs.call('SetSceneItemIndex', {
          sceneName: SCENE,
          sceneItemId: id,
          sceneItemIndex: i,
        });
        console.log(`  Set "${name}" (ID:${id}) to index ${i}`);
      } catch (e) {
        console.error(`  Failed to set "${name}": ${e.message}`);
      }
    } else {
      console.log(`  SKIP "${name}" - not found in scene`);
    }
  }

  // Step 3: Fix positions
  // Bars: 1048x100px, slight Y offset
  const BAR_Y = 15;
  const positions = {
    'Left Team Bar': { positionX: 0, positionY: BAR_Y, scaleX: 1.0, scaleY: 1.0 },
    'Right Team Bar': { positionX: 872, positionY: BAR_Y, scaleX: 1.0, scaleY: 1.0 },
    'Left Team Image': { positionX: 20, positionY: 35, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 50, boundsHeight: 50 },
    'Right Team Image': { positionX: 1870, positionY: 35, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 50, boundsHeight: 50 },
    'Team Name 1': { positionX: 80, positionY: 32, scaleX: 0.20, scaleY: 0.20 },
    'Team Name 2': { positionX: 1520, positionY: 32, scaleX: 0.20, scaleY: 0.20 },
    'Left Score': { positionX: 930, positionY: 25, scaleX: 0.22, scaleY: 0.22 },
    'Right Score': { positionX: 960, positionY: 25, scaleX: 0.22, scaleY: 0.22 },
  };

  console.log('\n=== Setting positions ===');
  for (const [name, transform] of Object.entries(positions)) {
    const id = itemMap[name];
    if (id !== undefined) {
      try {
        await obs.call('SetSceneItemTransform', {
          sceneName: SCENE,
          sceneItemId: id,
          sceneItemTransform: transform,
        });
        console.log(`  "${name}" -> pos=(${transform.positionX},${transform.positionY})`);
      } catch (e) {
        console.error(`  Failed "${name}": ${e.message}`);
      }
    }
  }

  // Step 4: Verify
  const { sceneItems: after } = await obs.call('GetSceneItemList', { sceneName: SCENE });
  console.log('\n=== After fix (index 0=back, highest=front) ===');
  for (const item of after) {
    const t = item.sceneItemTransform;
    console.log(`  idx:${item.sceneItemIndex} "${item.sourceName}" pos=(${t.positionX.toFixed(0)},${t.positionY.toFixed(0)})`);
  }

  await obs.disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
